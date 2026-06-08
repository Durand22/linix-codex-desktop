#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SYSTEMD_SOURCE="${SCRIPT_DIR}/systemd/codex-engine.service"
readonly CONFIG_SOURCE="${SCRIPT_DIR}/systemd/config.toml"
readonly DESKTOP_SOURCE="${SCRIPT_DIR}/systemd/codex-desktop.desktop"

readonly CODEX_HOME_DIR="${HOME}/.codex"
readonly CODEX_ENV_FILE="${CODEX_HOME_DIR}/.env"
readonly SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
readonly DESKTOP_DIR="${HOME}/.local/share/applications"
readonly CODEX_DATA_DIR="${HOME}/.local/share/codex"
readonly CODEX_CACHE_DIR="${HOME}/.cache/codex"
readonly CODEX_CONFIG_DEST="${CODEX_HOME_DIR}/config.toml"
readonly SYSTEMD_DEST="${SYSTEMD_USER_DIR}/codex-engine.service"
readonly DESKTOP_DEST="${DESKTOP_DIR}/codex-desktop.desktop"
readonly DESKTOP_BINARY="/usr/local/bin/codex-desktop"
readonly CODEX_NPM_PACKAGE="@openai/codex"

log() {
  printf '[install-codex-env] %s\n' "$*"
}

warn() {
  printf '[install-codex-env] warning: %s\n' "$*" >&2
}

fail() {
  printf '[install-codex-env] error: %s\n' "$*" >&2
  exit 1
}

require_file() {
  local path="$1"

  [[ -f "${path}" ]] || fail "required Phase 1 payload not found: ${path}"
}

detect_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    printf ''
    return
  fi

  command -v sudo >/dev/null 2>&1 || fail "sudo is required for system package installation"
  printf 'sudo'
}

detect_distro() {
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    local distro_id="${ID:-}"
    local distro_like="${ID_LIKE:-}"

    case " ${distro_id} ${distro_like} " in
      *" debian "*|*" ubuntu "*) printf 'debian' ;;
      *" arch "*) printf 'arch' ;;
      *" fedora "*|*" rhel "*) printf 'fedora' ;;
      *) fail "unsupported Linux distribution: ${PRETTY_NAME:-unknown}" ;;
    esac
    return
  fi

  fail "cannot detect Linux distribution because /etc/os-release is missing"
}

install_debian_dependencies() {
  local sudo_cmd="$1"

  log "Installing Debian/Ubuntu Tauri dependencies"
  ${sudo_cmd} apt-get update
  if ${sudo_cmd} apt-get install -y \
    build-essential \
    curl \
    file \
    libayatana-appindicator3-dev \
    libglib2.0-dev \
    libgtk-3-dev \
    librsvg2-dev \
    libsoup-3.0-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    nodejs \
    npm \
    pkg-config; then
    return
  fi

  warn "libwebkit2gtk-4.1-dev path failed; retrying with libwebkit2gtk-4.0-dev for older Debian/Ubuntu releases"
  ${sudo_cmd} apt-get install -y \
    build-essential \
    curl \
    file \
    libayatana-appindicator3-dev \
    libglib2.0-dev \
    libgtk-3-dev \
    librsvg2-dev \
    libsoup2.4-dev \
    libssl-dev \
    libwebkit2gtk-4.0-dev \
    nodejs \
    npm \
    pkg-config
}

install_arch_dependencies() {
  local sudo_cmd="$1"

  log "Installing Arch Linux Tauri dependencies"
  ${sudo_cmd} pacman -Syu --needed --noconfirm \
    base-devel \
    curl \
    file \
    glib2 \
    gtk3 \
    libayatana-appindicator \
    librsvg \
    libsoup3 \
    nodejs \
    npm \
    openssl \
    pkgconf \
    webkit2gtk-4.1
}

install_fedora_dependencies() {
  local sudo_cmd="$1"

  log "Installing Fedora Tauri dependencies"
  if ${sudo_cmd} dnf install -y \
    curl \
    file \
    gcc \
    gcc-c++ \
    glib2-devel \
    gtk3-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    libsoup3-devel \
    make \
    nodejs \
    npm \
    openssl-devel \
    pkgconf-pkg-config \
    webkit2gtk4.1-devel; then
    return
  fi

  warn "webkit2gtk4.1-devel path failed; retrying with webkit2gtk4.0-devel for older Fedora releases"
  ${sudo_cmd} dnf install -y \
    curl \
    file \
    gcc \
    gcc-c++ \
    glib2-devel \
    gtk3-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    libsoup-devel \
    make \
    nodejs \
    npm \
    openssl-devel \
    pkgconf-pkg-config \
    webkit2gtk4.0-devel
}

install_system_dependencies() {
  local distro="$1"
  local sudo_cmd="$2"

  case "${distro}" in
    debian) install_debian_dependencies "${sudo_cmd}" ;;
    arch) install_arch_dependencies "${sudo_cmd}" ;;
    fedora) install_fedora_dependencies "${sudo_cmd}" ;;
    *) fail "unsupported distro family: ${distro}" ;;
  esac
}

install_codex_cli() {
  local sudo_cmd="$1"

  log "Installing ${CODEX_NPM_PACKAGE} globally"
  if ! npm install -g "${CODEX_NPM_PACKAGE}"; then
    [[ -n "${sudo_cmd}" ]] || fail "global npm install failed and no sudo fallback is available"
    log "Retrying ${CODEX_NPM_PACKAGE} global install with sudo"
    ${sudo_cmd} npm install -g "${CODEX_NPM_PACKAGE}"
  fi

  command -v codex >/dev/null 2>&1 || fail "codex command was not found on PATH after npm installation"
  log "Installed codex at $(command -v codex)"
}

create_directories() {
  log "Creating Codex directories"
  mkdir -p \
    "${CODEX_HOME_DIR}" \
    "${CODEX_HOME_DIR}/sessions" \
    "${CODEX_HOME_DIR}/tasks" \
    "${CODEX_HOME_DIR}/logs" \
    "${CODEX_DATA_DIR}" \
    "${CODEX_DATA_DIR}/run" \
    "${CODEX_DATA_DIR}/sessions" \
    "${CODEX_DATA_DIR}/tracking" \
    "${CODEX_CACHE_DIR}" \
    "${SYSTEMD_USER_DIR}" \
    "${DESKTOP_DIR}"

  if [[ -d "${XDG_RUNTIME_DIR:-}" ]]; then
    mkdir -p "${XDG_RUNTIME_DIR}/codex"
  fi

  if [[ ! -f "${CODEX_ENV_FILE}" ]]; then
    install -m 0600 /dev/null "${CODEX_ENV_FILE}"
    {
      printf '# Codex Desktop environment secrets.\n'
      printf '# OPENAI_API_KEY=sk-...\n'
      printf '# CODEX_CLOUD_API_KEY=...\n'
    } >"${CODEX_ENV_FILE}"
  else
    chmod 0600 "${CODEX_ENV_FILE}"
  fi
}

install_payload() {
  local source_path="$1"
  local destination_path="$2"
  local mode="$3"
  local destination_dir

  destination_dir="$(dirname "${destination_path}")"
  mkdir -p "${destination_dir}"
  install -m "${mode}" "${source_path}" "${destination_path}"
}

deploy_phase_one_payloads() {
  log "Deploying Phase 1 payloads"
  install_payload "${CONFIG_SOURCE}" "${CODEX_CONFIG_DEST}" 0644
  install_payload "${SYSTEMD_SOURCE}" "${SYSTEMD_DEST}" 0644
  install_payload "${DESKTOP_SOURCE}" "${DESKTOP_DEST}" 0644
}

refresh_desktop_database() {
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${DESKTOP_DIR}" >/dev/null 2>&1 || warn "desktop database refresh failed"
  fi
}

start_user_service() {
  command -v systemctl >/dev/null 2>&1 || fail "systemctl is required to manage the codex-engine user service"

  log "Reloading user systemd daemon"
  systemctl --user daemon-reload

  log "Enabling and starting codex-engine.service"
  systemctl --user enable --now codex-engine.service
}

print_summary() {
  printf '\nCodex Desktop environment installed.\n'
  printf '  Config:       %s\n' "${CODEX_CONFIG_DEST}"
  printf '  Env file:     %s\n' "${CODEX_ENV_FILE}"
  printf '  User service: %s\n' "${SYSTEMD_DEST}"
  printf '  Launcher:     %s\n' "${DESKTOP_DEST}"
  printf '  Codex CLI:    %s\n' "$(command -v codex)"

  if [[ ! -x "${DESKTOP_BINARY}" ]]; then
    warn "${DESKTOP_BINARY} is not executable; the desktop launcher is installed but the app binary still needs to be built and installed there"
  fi

  if [[ ! -s "${CODEX_ENV_FILE}" ]] || ! grep -Eq '^[[:space:]]*OPENAI_API_KEY=' "${CODEX_ENV_FILE}"; then
    warn "add OPENAI_API_KEY to ${CODEX_ENV_FILE} before using the default cloud profile"
  fi
}

main() {
  require_file "${CONFIG_SOURCE}"
  require_file "${SYSTEMD_SOURCE}"
  require_file "${DESKTOP_SOURCE}"

  local sudo_cmd
  local distro

  sudo_cmd="$(detect_sudo)"
  distro="$(detect_distro)"

  log "Detected distro family: ${distro}"
  install_system_dependencies "${distro}" "${sudo_cmd}"
  install_codex_cli "${sudo_cmd}"
  create_directories
  deploy_phase_one_payloads
  refresh_desktop_database
  start_user_service
  print_summary
}

main "$@"
exit 0
