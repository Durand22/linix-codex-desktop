use crate::config;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use thiserror::Error;

const DEFAULT_MAX_DEPTH: usize = 4;
const DEFAULT_MAX_ENTRIES: usize = 2_000;
const HARD_MAX_DEPTH: usize = 12;
const HARD_MAX_ENTRIES: usize = 20_000;
const SKIPPED_DIRECTORIES: &[&str] = &[".git", "node_modules", "target", "dist", ".cache"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryTreeRequest {
    pub root: String,
    pub max_depth: Option<usize>,
    pub max_entries: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryTreeNode {
    pub path: String,
    pub name: String,
    pub kind: DirectoryEntryKind,
    pub depth: usize,
    pub children: Vec<DirectoryTreeNode>,
    pub metadata: DirectoryEntryMetadata,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DirectoryEntryKind {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntryMetadata {
    pub size: u64,
    pub readonly: bool,
    pub modified_ms: Option<u128>,
}

#[derive(Debug, Error)]
pub enum DirectoryTreeError {
    #[error("no workspace roots are configured")]
    NoWorkspaceRoots,
    #[error("path does not exist: {0}")]
    MissingPath(String),
    #[error("path is outside configured workspace roots: {0}")]
    OutsideWorkspace(String),
    #[error("failed to read filesystem entry: {0}")]
    ReadFailed(String),
}

pub fn normalize_workspace_path(input: &str) -> PathBuf {
    let expanded = expand_home(input);
    expanded.canonicalize().unwrap_or(expanded)
}

pub fn read_directory_tree(
    request: DirectoryTreeRequest,
) -> Result<DirectoryTreeNode, DirectoryTreeError> {
    let root = normalize_workspace_path(&request.root);
    if !root.exists() {
        return Err(DirectoryTreeError::MissingPath(
            root.to_string_lossy().into_owned(),
        ));
    }

    let allowed_roots = allowed_workspace_roots()?;
    if !allowed_roots.iter().any(|allowed| root.starts_with(allowed)) {
        return Err(DirectoryTreeError::OutsideWorkspace(
            root.to_string_lossy().into_owned(),
        ));
    }

    let max_depth = request
        .max_depth
        .unwrap_or(DEFAULT_MAX_DEPTH)
        .min(HARD_MAX_DEPTH);
    let max_entries = request
        .max_entries
        .unwrap_or(DEFAULT_MAX_ENTRIES)
        .min(HARD_MAX_ENTRIES);
    let mut remaining_entries = max_entries;

    build_tree(&root, 0, max_depth, &mut remaining_entries)
}

fn allowed_workspace_roots() -> Result<Vec<PathBuf>, DirectoryTreeError> {
    let roots = config::load_workspace_roots()
        .map_err(|error| DirectoryTreeError::ReadFailed(error.to_string()))?;

    let roots: Vec<PathBuf> = roots
        .iter()
        .map(|root| normalize_workspace_path(root))
        .filter(|root| root.exists())
        .collect();

    if roots.is_empty() {
        Err(DirectoryTreeError::NoWorkspaceRoots)
    } else {
        Ok(roots)
    }
}

fn build_tree(
    path: &Path,
    depth: usize,
    max_depth: usize,
    remaining_entries: &mut usize,
) -> Result<DirectoryTreeNode, DirectoryTreeError> {
    if *remaining_entries == 0 {
        return Err(DirectoryTreeError::ReadFailed(
            "directory tree entry limit reached".to_string(),
        ));
    }
    *remaining_entries -= 1;

    let metadata =
        fs::symlink_metadata(path).map_err(|error| DirectoryTreeError::ReadFailed(error.to_string()))?;
    let file_type = metadata.file_type();
    let kind = if file_type.is_dir() {
        DirectoryEntryKind::Directory
    } else if file_type.is_file() {
        DirectoryEntryKind::File
    } else if file_type.is_symlink() {
        DirectoryEntryKind::Symlink
    } else {
        DirectoryEntryKind::Other
    };

    let mut children = Vec::new();
    if matches!(kind, DirectoryEntryKind::Directory) && depth < max_depth {
        let mut entries = fs::read_dir(path)
            .map_err(|error| DirectoryTreeError::ReadFailed(error.to_string()))?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();

        entries.sort_by_key(|entry| entry.file_name());

        for entry in entries {
            let entry_path = entry.path();
            if should_skip(&entry_path) {
                continue;
            }

            if *remaining_entries == 0 {
                break;
            }

            match build_tree(&entry_path, depth + 1, max_depth, remaining_entries) {
                Ok(child) => children.push(child),
                Err(DirectoryTreeError::ReadFailed(_)) => continue,
                Err(error) => return Err(error),
            }
        }
    }

    Ok(DirectoryTreeNode {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned()),
        kind,
        depth,
        children,
        metadata: DirectoryEntryMetadata {
            size: metadata.len(),
            readonly: metadata.permissions().readonly(),
            modified_ms: metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|timestamp| timestamp.as_millis()),
        },
    })
}

fn should_skip(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| SKIPPED_DIRECTORIES.contains(&name))
        .unwrap_or(false)
}

fn expand_home(input: &str) -> PathBuf {
    if input == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }

    if let Some(remainder) = input.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(remainder);
        }
    }

    PathBuf::from(input)
}
