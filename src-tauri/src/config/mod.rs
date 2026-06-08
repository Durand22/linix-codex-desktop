use dirs::home_dir;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("unable to resolve home directory")]
    MissingHome,
    #[error("failed to read config: {0}")]
    ReadFailed(String),
    #[error("failed to parse config: {0}")]
    ParseFailed(String),
}

#[derive(Debug, Deserialize)]
struct CodexConfig {
    #[serde(default)]
    workspace_roots: Vec<String>,
}

pub fn resolve_codex_home() -> Result<String, ConfigError> {
    if let Ok(path) = std::env::var("CODEX_HOME") {
        if !path.is_empty() {
            return Ok(path);
        }
    }

    let home = home_dir().ok_or(ConfigError::MissingHome)?;
    Ok(home.join(".codex").to_string_lossy().into_owned())
}

pub fn resolve_config_path() -> Result<PathBuf, ConfigError> {
    let codex_home = resolve_codex_home()?;
    Ok(Path::new(&codex_home).join("config.toml"))
}

pub fn load_workspace_roots() -> Result<Vec<String>, ConfigError> {
    let config_path = resolve_config_path()?;
    if !config_path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(&config_path)
        .map_err(|error| ConfigError::ReadFailed(error.to_string()))?;
    let parsed: CodexConfig = toml::from_str(&raw)
        .map_err(|error| ConfigError::ParseFailed(error.to_string()))?;
    Ok(parsed.workspace_roots)
}
