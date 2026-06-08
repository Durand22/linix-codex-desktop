#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

readonly CODEX_HOME_DIR="${HOME}/.codex"
readonly SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
readonly DESKTOP_DIR="${HOME}/.local/share/applications"

install_file() {
  local source_path="$1"
  local destination_path="$2"
  local destination_dir

  destination_dir="$(dirname "${destination_path}")"
  mkdir -p "${destination_dir}"
  install -m 0644 "${source_path}" "${destination_path}"
}

main() {
  install_file "${PROJECT_ROOT}/systemd/codex-engine.service" "${SYSTEMD_USER_DIR}/codex-engine.service"
  install_file "${PROJECT_ROOT}/systemd/codex-desktop.desktop" "${DESKTOP_DIR}/codex-desktop.desktop"
  install_file "${PROJECT_ROOT}/systemd/config.toml" "${CODEX_HOME_DIR}/config.toml"

  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload
  fi

  printf 'Installed Codex system payloads:\n'
  printf '  %s\n' "${CODEX_HOME_DIR}/config.toml"
  printf '  %s\n' "${SYSTEMD_USER_DIR}/codex-engine.service"
  printf '  %s\n' "${DESKTOP_DIR}/codex-desktop.desktop"
}

main "$@"
