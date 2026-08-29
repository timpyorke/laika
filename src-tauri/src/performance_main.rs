fn main() {
    if let Err(error) = laika_lib::performance::run() {
        eprintln!("performance baseline failed: {error}");
        std::process::exit(1);
    }
}
