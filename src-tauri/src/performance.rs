use crate::error::{ApplicationError, ApplicationErrorCode};
use crate::http::{HttpEngine, HttpMethod, HttpRequestInput, RequestAuth, RequestBody};
use crate::store::models::RequestSnapshot;
use crate::store::{FixtureProfile, HistoryDraft, HistoryResponse, Store};
use std::future::Future;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const MIB: usize = 1024 * 1024;
const DEFAULT_RESPONSE_LIMIT: usize = 10 * MIB;
const MAXIMUM_RESPONSE_LIMIT: usize = 50 * MIB;

struct Measurement {
    name: &'static str,
    iterations: usize,
    minimum_ms: f64,
    median_ms: f64,
    p95_ms: f64,
}

impl Measurement {
    fn from_durations(name: &'static str, mut durations: Vec<Duration>) -> Self {
        durations.sort_unstable();
        let iterations = durations.len();
        let p95_index = (iterations * 95).div_ceil(100).saturating_sub(1);
        Self {
            name,
            iterations,
            minimum_ms: duration_ms(durations[0]),
            median_ms: duration_ms(durations[iterations / 2]),
            p95_ms: duration_ms(durations[p95_index]),
        }
    }
}

pub fn run() -> Result<(), String> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?;
    runtime.block_on(run_async())
}

async fn run_async() -> Result<(), String> {
    let root = std::env::temp_dir().join(format!(
        "laika-performance-{}",
        crate::store::models::new_id()
    ));
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;

    let result = measure_all(&root).await;
    if let Err(error) = std::fs::remove_dir_all(&root) {
        eprintln!("warning: could not remove fixture directory: {error}");
    }
    result
}

async fn measure_all(root: &Path) -> Result<(), String> {
    println!("# Laika performance baseline");
    println!();
    println!("- OS: {}", std::env::consts::OS);
    println!("- Architecture: {}", std::env::consts::ARCH);
    println!("- Build: release");
    println!("- History retention: 1,000 entries");
    println!();

    let typical_path = root.join("typical.db");
    let maximum_path = root.join("maximum.db");
    create_fixture(&typical_path, FixtureProfile::TYPICAL).await?;
    create_fixture(&maximum_path, FixtureProfile::MAXIMUM).await?;

    let mut measurements = Vec::new();
    measurements.push(measure_new_database_startup(root, 10).await?);
    measurements.push(measure_existing_startup(&typical_path, 10).await?);

    let typical = Store::open(&typical_path).await.map_err(app_error)?;
    measurements.push(
        measure("load typical workspace tree", 30, || async {
            typical.load_tree().await.map(|_| ())
        })
        .await?,
    );
    typical.close().await;

    let maximum = Store::open(&maximum_path).await.map_err(app_error)?;
    measurements.push(
        measure("load maximum workspace tree", 30, || async {
            maximum.load_tree().await.map(|_| ())
        })
        .await?,
    );
    measurements.push(
        measure("list newest history page", 50, || async {
            maximum.list_history(None, 200, 0).await.map(|_| ())
        })
        .await?,
    );
    measurements.push(
        measure("search 1,000 history entries", 50, || async {
            maximum
                .list_history(Some("matching-order"), 200, 0)
                .await
                .map(|_| ())
        })
        .await?,
    );

    let mut write_index = 0_usize;
    measurements.push(
        measure("write history at retention limit", 30, || {
            write_index += 1;
            let draft = history_draft(write_index);
            async {
                maximum
                    .record_execution(draft, Ok(history_response()))
                    .await
            }
        })
        .await?,
    );
    maximum.close().await;

    measurements
        .push(measure_http_limit("10 MiB response truncation", DEFAULT_RESPONSE_LIMIT, 5).await?);
    measurements
        .push(measure_http_limit("50 MiB response truncation", MAXIMUM_RESPONSE_LIMIT, 3).await?);
    measurements.push(measure_http_cancellation(5).await?);

    println!("| Operation | Iterations | Min (ms) | Median (ms) | p95 (ms) |");
    println!("| --- | ---: | ---: | ---: | ---: |");
    for measurement in measurements {
        println!(
            "| {} | {} | {:.3} | {:.3} | {:.3} |",
            measurement.name,
            measurement.iterations,
            measurement.minimum_ms,
            measurement.median_ms,
            measurement.p95_ms
        );
    }
    println!();
    if let Some(peak_bytes) = peak_working_set_bytes() {
        println!(
            "Peak process working set observed: {:.1} MiB",
            peak_bytes as f64 / MIB as f64
        );
    } else {
        println!("Peak process working set observed: unavailable on this platform");
    }

    Ok(())
}

async fn create_fixture(path: &Path, profile: FixtureProfile) -> Result<(), String> {
    let store = Store::open(path).await.map_err(app_error)?;
    store
        .seed_performance_fixture(profile)
        .await
        .map_err(app_error)?;
    store.close().await;
    Ok(())
}

async fn measure_new_database_startup(
    root: &Path,
    iterations: usize,
) -> Result<Measurement, String> {
    let warmup_path = root.join("empty-warmup.db");
    let warmup = Store::open(&warmup_path).await.map_err(app_error)?;
    warmup.close().await;
    remove_sqlite_files(&warmup_path);

    let mut durations = Vec::with_capacity(iterations);
    for index in 0..iterations {
        let path = root.join(format!("empty-{index:04}.db"));
        let started = Instant::now();
        let store = Store::open(&path).await.map_err(app_error)?;
        store.close().await;
        durations.push(started.elapsed());
        remove_sqlite_files(&path);
    }
    Ok(Measurement::from_durations(
        "create and migrate empty database",
        durations,
    ))
}

async fn measure_existing_startup(path: &Path, iterations: usize) -> Result<Measurement, String> {
    measure("open typical existing database", iterations, || async {
        let store = Store::open(path).await?;
        store.close().await;
        Ok(())
    })
    .await
}

async fn measure<F, Fut>(
    name: &'static str,
    iterations: usize,
    mut operation: F,
) -> Result<Measurement, String>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<(), ApplicationError>>,
{
    operation().await.map_err(app_error)?;
    let mut durations = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let started = Instant::now();
        operation().await.map_err(app_error)?;
        durations.push(started.elapsed());
    }
    Ok(Measurement::from_durations(name, durations))
}

async fn measure_http_limit(
    name: &'static str,
    limit: usize,
    iterations: usize,
) -> Result<Measurement, String> {
    let engine = HttpEngine::new().map_err(app_error)?;
    let mut durations = Vec::with_capacity(iterations);
    for index in 0..iterations {
        let (url, server) = spawn_body_server(limit + 64 * 1024, Duration::ZERO).await?;
        let request = http_request(format!("large-{limit}-{index}"), url, limit as u64);
        let started = Instant::now();
        let response = engine.execute(request).await.map_err(app_error)?;
        durations.push(started.elapsed());
        if response.size_bytes != limit as u64 || !response.truncated {
            return Err(format!(
                "{name} returned {} bytes with truncated={}",
                response.size_bytes, response.truncated
            ));
        }
        server.await.map_err(|error| error.to_string())??;
    }
    Ok(Measurement::from_durations(name, durations))
}

async fn measure_http_cancellation(iterations: usize) -> Result<Measurement, String> {
    let engine = HttpEngine::new().map_err(app_error)?;
    let mut durations = Vec::with_capacity(iterations);
    for index in 0..iterations {
        let (url, server) =
            spawn_body_server(MAXIMUM_RESPONSE_LIMIT, Duration::from_millis(2)).await?;
        let request_id = format!("cancel-{index}");
        let request = http_request(request_id.clone(), url, MAXIMUM_RESPONSE_LIMIT as u64);
        let running_engine = engine.clone();
        let started = Instant::now();
        let task = tokio::spawn(async move { running_engine.execute(request).await });
        tokio::time::sleep(Duration::from_millis(15)).await;
        if !engine.cancel(&request_id) {
            return Err("HTTP cancellation did not find the in-flight request".to_owned());
        }
        let error = task
            .await
            .map_err(|error| error.to_string())?
            .expect_err("cancelled request unexpectedly succeeded");
        durations.push(started.elapsed());
        if error.code != ApplicationErrorCode::Cancelled {
            return Err(format!(
                "HTTP cancellation returned {}",
                error.code.as_str()
            ));
        }
        server.await.map_err(|error| error.to_string())??;
    }
    Ok(Measurement::from_durations(
        "cancel streaming response",
        durations,
    ))
}

async fn spawn_body_server(
    body_bytes: usize,
    chunk_delay: Duration,
) -> Result<(String, tokio::task::JoinHandle<Result<(), String>>), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|error| error.to_string())?;
    let address = listener.local_addr().map_err(|error| error.to_string())?;
    let task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.map_err(|error| error.to_string())?;
        let mut request = [0_u8; 4096];
        stream
            .read(&mut request)
            .await
            .map_err(|error| error.to_string())?;
        let header = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {body_bytes}\r\nConnection: close\r\n\r\n"
        );
        stream
            .write_all(header.as_bytes())
            .await
            .map_err(|error| error.to_string())?;
        let chunk = vec![b'x'; 64 * 1024];
        let mut remaining = body_bytes;
        while remaining > 0 {
            let length = remaining.min(chunk.len());
            if let Err(error) = stream.write_all(&chunk[..length]).await {
                if matches!(
                    error.kind(),
                    io::ErrorKind::BrokenPipe
                        | io::ErrorKind::ConnectionReset
                        | io::ErrorKind::ConnectionAborted
                ) {
                    return Ok(());
                }
                return Err(error.to_string());
            }
            remaining -= length;
            if !chunk_delay.is_zero() {
                tokio::time::sleep(chunk_delay).await;
            }
        }
        Ok(())
    });
    Ok((format!("http://{address}/response"), task))
}

fn http_request(request_id: String, url: String, max_response_bytes: u64) -> HttpRequestInput {
    HttpRequestInput {
        request_id,
        saved_request_id: None,
        name: None,
        method: HttpMethod::Get,
        url,
        params: Vec::new(),
        headers: Vec::new(),
        body: RequestBody::None,
        auth: RequestAuth::None,
        timeout_ms: 30_000,
        max_response_bytes,
    }
}

fn history_draft(index: usize) -> HistoryDraft {
    HistoryDraft {
        request_id: None,
        name: format!("measured write {index:04}"),
        snapshot: RequestSnapshot {
            method: "GET".to_owned(),
            url: format!("https://api.example.test/measured/{index:04}"),
            timeout_ms: 30_000,
            ..RequestSnapshot::default()
        },
    }
}

fn history_response() -> HistoryResponse {
    HistoryResponse {
        status: 200,
        status_text: "OK".to_owned(),
        elapsed_ms: 12,
        size_bytes: 34,
        headers: Vec::new(),
        body: "{\"ok\":true}".to_owned(),
        truncated: false,
    }
}

fn remove_sqlite_files(path: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let candidate = PathBuf::from(format!("{}{suffix}", path.display()));
        if candidate.exists() {
            let _ = std::fs::remove_file(candidate);
        }
    }
}

fn app_error(error: ApplicationError) -> String {
    format!("{}: {}", error.code.as_str(), error.message)
}

fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}

#[cfg(windows)]
fn peak_working_set_bytes() -> Option<usize> {
    windows_memory::peak_working_set_bytes()
}

#[cfg(not(windows))]
fn peak_working_set_bytes() -> Option<usize> {
    None
}

#[cfg(windows)]
mod windows_memory {
    use std::ffi::c_void;
    use std::mem::size_of;

    #[repr(C)]
    struct ProcessMemoryCounters {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> *mut c_void;
        fn K32GetProcessMemoryInfo(
            process: *mut c_void,
            counters: *mut ProcessMemoryCounters,
            size: u32,
        ) -> i32;
    }

    pub(super) fn peak_working_set_bytes() -> Option<usize> {
        let mut counters = ProcessMemoryCounters {
            cb: size_of::<ProcessMemoryCounters>() as u32,
            page_fault_count: 0,
            peak_working_set_size: 0,
            working_set_size: 0,
            quota_peak_paged_pool_usage: 0,
            quota_paged_pool_usage: 0,
            quota_peak_non_paged_pool_usage: 0,
            quota_non_paged_pool_usage: 0,
            pagefile_usage: 0,
            peak_pagefile_usage: 0,
        };
        // SAFETY: both functions are process-local Windows APIs. The counters
        // pointer is valid for the declared structure size for the whole call.
        let success = unsafe {
            K32GetProcessMemoryInfo(
                GetCurrentProcess(),
                &mut counters,
                size_of::<ProcessMemoryCounters>() as u32,
            )
        };
        (success != 0).then_some(counters.peak_working_set_size)
    }
}
