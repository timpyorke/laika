# Performance Baselines

Laika uses a deterministic, offline harness to measure the release-critical
SQLite and HTTP response paths. The harness is a release-only executable and is
not included in the application bundle.

## Run the Baseline

From the repository root:

```bash
pnpm perf:baseline
```

Or invoke Cargo directly:

```bash
cargo run --release --manifest-path src-tauri/Cargo.toml \
  --features performance --bin performance-baseline
```

Run it on an otherwise idle supported Windows machine. Keep the machine,
operating system, Rust version, power profile, and Laika commit with the saved
result. The first release build can take several minutes because the production
profile enables LTO; subsequent runs reuse the compiled executable.

The harness creates uniquely named databases under the operating-system temp
directory and removes them when it finishes. It never reads the user's Laika
workspace and never sends traffic beyond a loopback TCP server.

## Deterministic Fixtures

| Profile | Collections | Folders | Saved requests | History entries |
| --- | ---: | ---: | ---: | ---: |
| Empty | 0 | 0 | 0 | 0 |
| Typical | 5 | 25 | 250 | 100 |
| Maximum | 10 | 100 | 1,000 | 1,000 |

The maximum profile reaches the current history retention limit. Fixture IDs,
names, URLs, ordering, timestamps, response metadata, and search matches are
stable. A normal Rust test verifies the counts and expected search cardinality.

## Initial Windows Baseline

Captured on 2026-08-29 with commit `4f840af` plus the uncommitted Phase 7D
changes described in this document.

- OS: Windows NT 10.0.26200.0, x86-64
- CPU: Intel64 Family 6 Model 170, 18 logical processors available
- Rust: 1.98.0 (`x86_64-pc-windows-msvc`, LLVM 22.1.8)
- Build: Cargo release profile with LTO

| Operation | Iterations | Min (ms) | Median (ms) | p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Create and migrate empty database | 10 | 33.480 | 38.768 | 51.277 |
| Open typical existing database | 10 | 4.167 | 5.340 | 20.534 |
| Load typical workspace tree | 30 | 1.982 | 3.150 | 4.789 |
| Load maximum workspace tree | 30 | 5.654 | 6.892 | 13.151 |
| List newest history page | 50 | 0.861 | 0.921 | 1.051 |
| Search 1,000 history entries | 50 | 0.662 | 0.765 | 0.897 |
| Write history at retention limit | 30 | 1.315 | 1.410 | 1.730 |
| 10 MiB response truncation | 5 | 44.521 | 56.167 | 87.681 |
| 50 MiB response truncation | 3 | 190.468 | 244.833 | 497.632 |
| Cancel streaming response | 5 | 15.720 | 16.742 | 30.894 |

Peak process working set observed: **109.8 MiB**. This includes fixture setup,
SQLite, the HTTP client, and the largest response measurement. Response checks
verify the returned byte count and truncation flag; cancellation verifies the
stable `CANCELLED` result.

## Provisional Budgets

These budgets are investigation thresholds, not CI failure thresholds. They
allow for shared-runner variance while identifying changes large enough to
review before release.

| Operation | Provisional p95 budget |
| --- | ---: |
| Create and migrate empty database | 150 ms |
| Open typical existing database | 75 ms |
| Load typical workspace tree | 15 ms |
| Load maximum workspace tree | 35 ms |
| List newest history page | 15 ms |
| Search 1,000 history entries | 15 ms |
| Write history at retention limit | 15 ms |
| 10 MiB response truncation | 250 ms |
| 50 MiB response truncation | 750 ms |
| Cancel streaming response | 100 ms |
| Peak process working set | 175 MiB |

A result over budget requires a repeat on an idle machine and an explanation;
it does not automatically imply a product regression. Compare medians and p95,
not a single sample. Record before/after results separately from fixture setup.

## CI Policy

The Windows baseline runs on scheduled and manually dispatched CI workflows.
Its Markdown-compatible output is retained as an artifact, but timing does not
block pull requests yet. Deterministic fixture correctness remains part of the
normal Rust test suite.

After at least five comparable Windows CI runs:

1. review runner variance and revise the provisional budgets;
2. choose the operations stable enough to gate;
3. require consecutive over-budget runs before reporting a regression; and
4. keep the 50 MiB and memory observations informational if runner noise is too
   high for a reliable gate.

Any performance optimization must include before/after measurements from the
same machine and must keep the existing correctness and security gates passing.
