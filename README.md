# Codex Desktop (Linux)

Native Linux desktop shell for Codex. The Tauri wrapper orchestrates a local headless
`codex app-server` for unrestricted filesystem operations while routing AI inference to a
cloud provider through an OpenAI-compatible API.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  codex-desktop (Tauri: Rust + React/Tailwind)               │
│  ├─ UI: chat, file explorer, session management             │
│  └─ Rust bridge: engine health, native dialogs, IPC         │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket / Unix socket (JSON-RPC)
┌──────────────────────────▼──────────────────────────────────┐
│  codex app-server (systemd user service: codex-engine)      │
│  ├─ Full user-context filesystem access                     │
│  └─ Tool execution under ~/.codex/config.toml permissions   │
└──────────────────────────┬──────────────────────────────────┘
                           │ OpenAI-compatible API
┌──────────────────────────▼──────────────────────────────────┐
│  Cloud inference provider (OpenAI, Azure, custom base URL)  │
└─────────────────────────────────────────────────────────────┘
```

## System payloads

| Path | Purpose |
|------|---------|
| `~/.codex/config.toml` | Codex engine configuration (unbounded access, cloud keys) |
| `~/.config/systemd/user/codex-engine.service` | Headless app-server daemon |
| `~/.local/share/applications/codex-desktop.desktop` | Application menu entry |

## Quick start

```bash
cd /home/durand/Projects/codex-desktop

# Use the repository Node version
nvm use

# Install frontend dependencies
npm install

# Install required system payloads for the engine
./scripts/install-system-payloads.sh

# Enable and start the local engine service
systemctl --user enable --now codex-engine.service

# Start the desktop shell in development mode
npm run tauri:dev
```

## One-line copy/paste setup

```bash
cd /home/durand/Projects/codex-desktop && nvm use && npm install && ./scripts/install-system-payloads.sh && systemctl --user enable --now codex-engine.service && npm run tauri:dev
```

## Full setup guide

### 1. Prerequisites

- Linux host
- `nvm` installed and available
- Node.js `20.x` (see `.nvmrc`)
- `npm`
- Rust toolchain for Tauri (`rustup`, `cargo`)
- `systemd --user`

### 1.1 Install prerequisites on Linux

Use one of the commands below to install the required platform tools.

#### Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y curl git build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.0-dev
```

#### Fedora / RHEL

```bash
sudo dnf install -y curl git gcc-c++ make openssl-devel gtk3-devel webkit2gtk3-devel
```

#### Arch Linux / Manjaro

```bash
sudo pacman -Syu --needed curl git base-devel openssl gtk3 webkit2gtk
```

#### Install `nvm` and Node 20

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 20
nvm use 20
```

#### Install Rust toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup toolchain install stable
rustup default stable
```

### 2. Use the correct Node version

From the repo root:

```bash
cd /home/durand/Projects/codex-desktop
nvm use
```

If Node 20 is not installed:

```bash
nvm install 20
nvm use 20
```

### 3. Install dependencies

```bash
npm install
```

### 4. Install local system payloads

This sets up the user service, desktop entry, and engine config paths.

```bash
./scripts/install-system-payloads.sh
```

### 5. Enable and start the headless engine

```bash
systemctl --user enable --now codex-engine.service
```

### 6. Install the desktop launcher for one-click start

```bash
./scripts/install-system-payloads.sh
```

This installs a desktop entry at `~/.local/share/applications/codex-desktop.desktop`.

Once installed, open your Linux application launcher and search for **Codex Desktop** to start the app with a single click.

### 7. Run the desktop app in development mode

```bash
npm run tauri:dev
```

This launches the Tauri application and serves the React UI for development.

## Build and package

### Build frontend assets

```bash
npm run build
```

### Build the Tauri desktop bundle

```bash
npm run tauri:build
```

## Useful commands

- `npm run lint` — run TypeScript type checking
- `npm run preview` — preview the built frontend
- `npm run tauri` — run the Tauri CLI

## Notes

- The repo enforces Node `>=20 <22` via `package.json`.
- Use `nvm use` before running or building, otherwise packages may fail.
- If the engine service is not running, the app may not connect to the local backend.

## What this project does

This repo provides a native Linux desktop shell for Codex.

- `src-tauri/` contains the Rust/Tauri bridge and native app configuration.
- `src/` contains the React UI components, hooks, and frontend logic.
- `systemd/` contains service and desktop integration payloads.
- `scripts/` contains install and control helpers for the engine.

The desktop app communicates with a local `codex-engine` systemd service and forwards AI inference requests to an OpenAI-compatible cloud provider.
