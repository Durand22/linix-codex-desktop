use super::client::resolve_engine_endpoint;
use crate::config;
use dirs::home_dir;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout, Duration};

const CODEX_ENGINE_SERVICE: &str = "codex-engine.service";
const ENGINE_LISTEN_ARG: &str = "ws://127.0.0.1:4520";
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineHealthSnapshot {
    pub active: bool,
    pub endpoint: String,
    pub owner: EngineOwner,
    pub service_state: ServiceState,
    pub managed_child_active: bool,
    pub managed_child_pid: Option<u32>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineOwner {
    Systemd,
    ManagedChild,
    None,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceState {
    Active,
    Inactive,
    Failed,
    Unavailable,
    Unknown(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineOutputEvent {
    stream: &'static str,
    line: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineExitEvent {
    code: Option<i32>,
    signal: Option<i32>,
}

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("failed to query systemd: {0}")]
    SystemdQuery(String),
    #[error("failed to start systemd service: {0}")]
    SystemdStart(String),
    #[error("failed to spawn codex app-server: {0}")]
    Spawn(String),
    #[error("managed engine is not running")]
    NoManagedChild,
    #[error("managed engine stdin is closed")]
    StdinClosed,
    #[error("failed to write to managed engine stdin: {0}")]
    StdinWrite(String),
}

struct ManagedChild {
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    stdout_task: JoinHandle<()>,
    stderr_task: JoinHandle<()>,
    exit_task: JoinHandle<()>,
}

impl ManagedChild {
    async fn pid(&self) -> Option<u32> {
        self.child.lock().await.id()
    }

    async fn is_active(&self) -> bool {
        let mut child = self.child.lock().await;
        match child.try_wait() {
            Ok(Some(_)) => false,
            Ok(None) => true,
            Err(_) => false,
        }
    }

    async fn write_line(&self, message: &str) -> Result<(), EngineError> {
        let mut stdin = self.stdin.lock().await;
        let Some(stdin) = stdin.as_mut() else {
            return Err(EngineError::StdinClosed);
        };

        stdin
            .write_all(message.as_bytes())
            .await
            .map_err(|error| EngineError::StdinWrite(error.to_string()))?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|error| EngineError::StdinWrite(error.to_string()))?;
        stdin
            .flush()
            .await
            .map_err(|error| EngineError::StdinWrite(error.to_string()))
    }

    async fn shutdown(self) {
        {
            let mut stdin = self.stdin.lock().await;
            stdin.take();
        }

        let child = Arc::clone(&self.child);
        let shutdown = async move {
            let mut child = child.lock().await;
            if matches!(child.try_wait(), Ok(None)) {
                let _ = child.kill().await;
            }
            let _ = child.wait().await;
        };

        let _ = timeout(SHUTDOWN_TIMEOUT, shutdown).await;
        self.stdout_task.abort();
        self.stderr_task.abort();
        self.exit_task.abort();
    }
}

pub struct EngineLifecycle {
    endpoint: String,
    socket_dir: PathBuf,
    child: Mutex<Option<ManagedChild>>,
}

impl EngineLifecycle {
    pub fn from_env() -> Self {
        let endpoint = resolve_engine_endpoint();
        let socket_dir = Self::default_socket_dir();
        Self {
            endpoint,
            socket_dir,
            child: Mutex::new(None),
        }
    }

    pub async fn health(&self) -> EngineHealthSnapshot {
        let service_state = query_service_state().await.unwrap_or(ServiceState::Unavailable);
        let (managed_child_active, managed_child_pid) = self.managed_child_status().await;

        let service_active = matches!(service_state, ServiceState::Active);
        let active = service_active || managed_child_active;
        let owner = if service_active {
            EngineOwner::Systemd
        } else if managed_child_active {
            EngineOwner::ManagedChild
        } else {
            EngineOwner::None
        };

        EngineHealthSnapshot {
            active,
            endpoint: self.endpoint.clone(),
            owner,
            service_state,
            managed_child_active,
            managed_child_pid,
            detail: if active {
                None
            } else {
                Some("Engine is not running; call ensure_engine_running".to_string())
            },
        }
    }

    pub async fn ensure_running(&self, app: AppHandle) -> Result<EngineHealthSnapshot, EngineError> {
        if matches!(query_service_state().await?, ServiceState::Active) {
            return Ok(self.health().await);
        }

        if start_service().await.is_ok()
            && matches!(query_service_state().await?, ServiceState::Active)
        {
            return Ok(self.health().await);
        }

        self.spawn_managed_child(app).await?;
        Ok(self.health().await)
    }

    pub async fn send_stdin(&self, message: String) -> Result<(), EngineError> {
        let child = self.child.lock().await;
        let Some(child) = child.as_ref() else {
            return Err(EngineError::NoManagedChild);
        };
        child.write_line(&message).await
    }

    pub async fn stop_managed_child(&self) {
        let mut guard = self.child.lock().await;
        let child = guard.take();
        drop(guard);

        if let Some(child) = child {
            child.shutdown().await;
        }
    }

    pub fn ensure_socket_directory(&self) {
        if let Err(error) = fs::create_dir_all(&self.socket_dir) {
            eprintln!(
                "codex-desktop: failed to create socket directory {}: {error}",
                self.socket_dir.display()
            );
        }
    }

    async fn managed_child_status(&self) -> (bool, Option<u32>) {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_ref() {
            if child.is_active().await {
                return (true, child.pid().await);
            }
        }

        guard.take();
        (false, None)
    }

    async fn spawn_managed_child(&self, app: AppHandle) -> Result<(), EngineError> {
        let mut guard = self.child.lock().await;

        if let Some(child) = guard.as_ref() {
            if child.is_active().await {
                return Ok(());
            }
        }
        guard.take();

        let mut command = Command::new("codex");
        command
            .arg("app-server")
            .arg("--listen")
            .arg(ENGINE_LISTEN_ARG)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        for (key, value) in engine_environment() {
            command.env(key, value);
        }

        let mut child = command
            .spawn()
            .map_err(|error| EngineError::Spawn(error.to_string()))?;

        let stdin = child.stdin.take();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let child = Arc::new(Mutex::new(child));

        let stdout_task = spawn_output_task(app.clone(), "stdout", stdout);
        let stderr_task = spawn_output_task(app.clone(), "stderr", stderr);
        let exit_task = spawn_exit_task(app, Arc::clone(&child));

        *guard = Some(ManagedChild {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
            stdout_task,
            stderr_task,
            exit_task,
        });

        Ok(())
    }

    fn default_socket_dir() -> PathBuf {
        if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
            return PathBuf::from(runtime_dir).join("codex");
        }

        if let Some(home) = home_dir() {
            return home.join(".local/share/codex/run");
        }

        PathBuf::from("/tmp/codex")
    }
}

fn spawn_output_task<R>(app: AppHandle, stream: &'static str, reader: Option<R>) -> JoinHandle<()>
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let Some(reader) = reader else {
            return;
        };

        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit(
                match stream {
                    "stderr" => "engine://stderr",
                    _ => "engine://stdout",
                },
                EngineOutputEvent { stream, line },
            );
        }
    })
}

fn spawn_exit_task(app: AppHandle, child: Arc<Mutex<Child>>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let status = loop {
            {
                let mut child = child.lock().await;
                if let Ok(Some(status)) = child.try_wait() {
                    break Some(status);
                }
            }

            sleep(Duration::from_millis(500)).await;
        };

        let _ = app.emit(
            "engine://exit",
            EngineExitEvent {
                code: status.as_ref().and_then(|status| status.code()),
                #[cfg(unix)]
                signal: {
                    use std::os::unix::process::ExitStatusExt;
                    status.as_ref().and_then(|status| status.signal())
                },
                #[cfg(not(unix))]
                signal: None,
            },
        );
    })
}

async fn query_service_state() -> Result<ServiceState, EngineError> {
    if systemctl_missing() {
        return Ok(ServiceState::Unavailable);
    }

    let output = Command::new("systemctl")
        .arg("--user")
        .arg("is-active")
        .arg(CODEX_ENGINE_SERVICE)
        .output()
        .await
        .map_err(|error| EngineError::SystemdQuery(error.to_string()))?;

    let status = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(match status.as_str() {
        "active" => ServiceState::Active,
        "inactive" => ServiceState::Inactive,
        "failed" => ServiceState::Failed,
        "" => ServiceState::Unavailable,
        other => ServiceState::Unknown(other.to_string()),
    })
}

async fn start_service() -> Result<(), EngineError> {
    if systemctl_missing() {
        return Err(EngineError::SystemdStart(
            "systemctl command is unavailable".to_string(),
        ));
    }

    let output = Command::new("systemctl")
        .arg("--user")
        .arg("start")
        .arg(CODEX_ENGINE_SERVICE)
        .output()
        .await
        .map_err(|error| EngineError::SystemdStart(error.to_string()))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(EngineError::SystemdStart(stderr))
    }
}

fn systemctl_missing() -> bool {
    std::process::Command::new("systemctl")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_err()
}

fn engine_environment() -> HashMap<String, String> {
    let mut env = HashMap::new();

    for key in [
        "HOME",
        "USER",
        "LOGNAME",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_CACHE_HOME",
        "XDG_RUNTIME_DIR",
    ] {
        if let Ok(value) = std::env::var(key) {
            env.insert(key.to_string(), value);
        }
    }

    if let Ok(codex_home) = config::resolve_codex_home() {
        env.insert("CODEX_HOME".to_string(), codex_home.clone());
        env.extend(read_dotenv(PathBuf::from(codex_home).join(".env")));
    }

    env.insert(
        "CODEX_ENGINE_WS_URL".to_string(),
        resolve_engine_endpoint(),
    );

    env
}

fn read_dotenv(path: PathBuf) -> HashMap<String, String> {
    let Ok(raw) = fs::read_to_string(path) else {
        return HashMap::new();
    };

    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }

            let (key, value) = line.split_once('=')?;
            let key = key.trim();
            if key.is_empty() {
                return None;
            }

            let value = value.trim().trim_matches('"').trim_matches('\'');
            Some((key.to_string(), value.to_string()))
        })
        .collect()
}
