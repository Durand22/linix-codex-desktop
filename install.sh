#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"

info() {
  printf '\033[1;34m%s\033[0m\n' "$*"
}

warn() {
  printf '\033[1;33m%s\033[0m\n' "$*"
}

error() {
  printf '\033[1;31m%s\033[0m\n' "$*"
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

install_packages() {
  case "$1" in
    apt)
      info "Installing required packages with apt"
      sudo apt update
      sudo apt install -y curl git build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.0-dev
      ;;
    dnf)
      info "Installing required packages with dnf"
      sudo dnf install -y curl git gcc-c++ make openssl-devel gtk3-devel webkit2gtk3-devel
      ;;
    pacman)
      info "Installing required packages with pacman"
      sudo pacman -Syu --needed --noconfirm curl git base-devel openssl gtk3 webkit2gtk
      ;;
    *)
      warn "Unsupported package manager: $1"
      warn "You will need to install prerequisites manually."
      ;;
  esac
}

detect_package_manager() {
  if command_exists apt; then
    echo apt
  elif command_exists dnf; then
    echo dnf
  elif command_exists pacman; then
    echo pacman
  else
    echo ""
  fi
}

install_nvm() {
  if command_exists nvm; then
    info "nvm already installed"
    return
  fi

  info "Installing nvm"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
}

ensure_nvm_loaded() {
  if ! command_exists nvm; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  fi

  if ! command_exists nvm; then
    error "nvm is not available. Please install it manually and rerun this script."
  fi
}

install_node() {
  ensure_nvm_loaded
  info "Installing Node 20 via nvm"
  nvm install 20
  nvm use 20
}

install_rust() {
  if command_exists rustup; then
    info "Rust toolchain already installed"
    return
  fi

  info "Installing Rust toolchain"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck source=/dev/null
  [ -s "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
  rustup toolchain install stable
  rustup default stable
}

install_project() {
  info "Installing project dependencies"
  npm install

  info "Installing system payloads"
  ./scripts/install-system-payloads.sh

  if command_exists systemctl; then
    info "Reloading user systemd daemon"
    systemctl --user daemon-reload || true
    info "Enabling and starting codex-engine.service"
    systemctl --user enable --now codex-engine.service
  else
    warn "systemctl is not available. Please start the service manually."
  fi
}

print_manual_instructions() {
  cat <<'EOF'

Manual fallback instructions:

1. Install prerequisites for your Linux distro:
   - Debian/Ubuntu: sudo apt update && sudo apt install -y curl git build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.0-dev
   - Fedora/RHEL: sudo dnf install -y curl git gcc-c++ make openssl-devel gtk3-devel webkit2gtk3-devel
   - Arch/Manjaro: sudo pacman -Syu --needed curl git base-devel openssl gtk3 webkit2gtk

2. Install nvm and Node 20:
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
   source "$HOME/.nvm/nvm.sh"
   nvm install 20
   nvm use 20

3. Install Rust toolchain:
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   rustup toolchain install stable
   rustup default stable

4. From repo root:
   npm install
   ./scripts/install-system-payloads.sh
   systemctl --user enable --now codex-engine.service
   npm run tauri:dev
EOF
}

main() {
  info "Starting automated installer for Codex Desktop"
  local pm
  pm="$(detect_package_manager)"

  if [[ -n "$pm" ]]; then
    install_packages "$pm"
  else
    warn "Could not detect a supported package manager. Skipping automated distro prerequisite install."
  fi

  install_nvm
  ensure_nvm_loaded
  install_node
  install_rust
  install_project

  info "Installer completed successfully"
  print_manual_instructions
}

main "$@"
