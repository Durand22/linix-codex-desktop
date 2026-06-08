pub const DEFAULT_ENGINE_WS_URL: &str = "ws://127.0.0.1:4520";

pub fn resolve_engine_endpoint() -> String {
    std::env::var("CODEX_ENGINE_WS_URL").unwrap_or_else(|_| DEFAULT_ENGINE_WS_URL.to_string())
}
