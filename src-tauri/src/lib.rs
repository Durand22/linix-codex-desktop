mod config;
mod engine;
mod fs;

use engine::lifecycle::EngineLifecycle;
use fs::bridge::{DirectoryTreeNode, DirectoryTreeRequest};
use std::sync::Arc;
use tauri::Manager;

#[tauri::command]
async fn engine_health(
    state: tauri::State<'_, Arc<EngineLifecycle>>,
) -> engine::lifecycle::EngineHealthSnapshot {
    state.health().await
}

#[tauri::command]
async fn ensure_engine_running(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<EngineLifecycle>>,
) -> Result<engine::lifecycle::EngineHealthSnapshot, String> {
    state
        .ensure_running(app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn stop_engine(state: tauri::State<'_, Arc<EngineLifecycle>>) -> Result<(), String> {
    state.stop_managed_child().await;
    Ok(())
}

#[tauri::command]
async fn send_engine_stdin(
    state: tauri::State<'_, Arc<EngineLifecycle>>,
    message: String,
) -> Result<(), String> {
    state
        .send_stdin(message)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn codex_home() -> Result<String, String> {
    config::resolve_codex_home().map_err(|error| error.to_string())
}

#[tauri::command]
fn workspace_roots() -> Result<Vec<String>, String> {
    config::load_workspace_roots().map_err(|error| error.to_string())
}

#[tauri::command]
fn read_directory_tree(request: DirectoryTreeRequest) -> Result<DirectoryTreeNode, String> {
    fs::bridge::read_directory_tree(request).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine_lifecycle = Arc::new(EngineLifecycle::from_env());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::clone(&engine_lifecycle))
        .invoke_handler(tauri::generate_handler![
            engine_health,
            ensure_engine_running,
            stop_engine,
            send_engine_stdin,
            codex_home,
            workspace_roots,
            read_directory_tree
        ])
        .setup(|app| {
            let lifecycle = app.state::<Arc<EngineLifecycle>>();
            lifecycle.ensure_socket_directory();
            Ok(())
        })
        .on_window_event(move |_window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let lifecycle = Arc::clone(&engine_lifecycle);
                tauri::async_runtime::block_on(async move {
                    lifecycle.stop_managed_child().await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Codex Desktop");
}
