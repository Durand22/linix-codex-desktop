# Codex Desktop (Linux)

Native Linux desktop shell for Codex. The Tauri wrapper orchestrates a local headless
`codex app-server` for unrestricted filesystem operations while routing AI inference to a
cloud provider through an OpenAI-compatible API.

> Known issues: Linux package manager errors can prevent the installer from completing.
> If you hit `apt update` GPG key failures, see the troubleshooting section below.

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

Open a terminal in the project root.

### Option 1: Automated installer (recommended)

```bash
./install.sh
```

### Option 2: Manual setup

```bash
# Use the repository Node version
nvm use

# Install frontend dependencies
npm install

# Install required system payloads for the engine
./scripts/install-system-payloads.sh

# Enable and start the engine service
systemctl --user enable --now codex-engine.service

# Run the desktop shell in development mode
npm run tauri:dev
```

## One-line setup

```bash
./install.sh
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
sudo apt install -y curl git build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev || sudo apt install -y curl git build-essential libssl-dev libgtk-3-dev libwebkit2gtk-4.0-dev
```

#### Fedora / RHEL

```bash
sudo dnf install -y curl git gcc-c++ make openssl-devel gtk3-devel webkit2gtk3-devel
```

#### Arch Linux / Manjaro

```bash
sudo pacman -Syu --needed curl git base-devel openssl gtk3 webkit2gtk
```

### 1.2 Install `nvm` and Node 20

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 20
nvm use 20
```

### 1.3 Install Rust toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup toolchain install stable
rustup default stable
```

### 1.4 Fix apt GPG key failures

If `apt update` fails with a missing public key or unsupported Waydroid key file, run:

```bash
sudo rm /usr/share/keyrings/waydroid.gpg
sudo curl --proto '=https' --tlsv1.2 -sSf https://repo.waydro.id/waydroid.gpg -o /usr/share/keyrings/waydroid.gpg
sudo apt update
```

If `apt install` still reports a missing WebKit development package, enable the Ubuntu universe repository and update again:

```bash
sudo add-apt-repository universe
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev || sudo apt install -y libwebkit2gtk-4.0-dev
```

Then continue with the installer or manual steps.

### 1.5 Automated installer

The repository includes an automated installer script that installs prerequisites when possible, sets up Node 20, installs Rust, installs project dependencies, installs system payloads, and starts the engine service.

```bash
./install.sh
```

If `apt update` fails because of a broken third-party repository or missing signing key, the script will continue to try installing packages from the local cache. If a required package cannot be installed, the installer will print manual fallback instructions.

## Report an issue or request support

If you run into problems, please open a GitHub issue using one of the pre-made templates so we can quickly triage your report:

- **Bug report**: use the bug report template for reproducible failures and installer errors.
- **Support request**: use the support request template for setup, install, or configuration help.

If you would rather provide full context first, the `ISSUES.md` file also contains the current known issues and troubleshooting steps.

### 2. Use the correct Node version

```bash
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

Open your application launcher and search for **Codex Desktop** to start the app with one click.

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

## Troubleshooting

### `apt update` fails with Waydroid `NO_PUBKEY`

If `apt update` reports a missing public key for `https://repo.waydro.id` or an unsupported `waydroid.gpg` file, run:

```bash
sudo rm /usr/share/keyrings/waydroid.gpg
sudo curl --proto '=https' --tlsv1.2 -sSf https://repo.waydro.id/waydroid.gpg -o /usr/share/keyrings/waydroid.gpg
sudo apt update
```

Then rerun the installer:

```bash
./install.sh
```

### Installer stops before `npm install`

If the automated installer exits early, complete the missing steps manually:

```bash
nvm use
npm install
./scripts/install-system-payloads.sh
systemctl --user enable --now codex-engine.service
npm run tauri:dev
```

### `systemctl --user` fails

If the user systemd service command fails, make sure user systemd is enabled and running:

```bash
loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now codex-engine.service
```

### Universe repository missing

If `apt install` cannot find the WebKit development package, install the Ubuntu universe repository:

```bash
sudo add-apt-repository universe
sudo apt update
```

Then rerun the installer.

## Troubleshooting and issue tracking

For a full list of installer issues, fixes, and troubleshooting steps, see `ISSUES.md`.

## What this project does

This repo provides a native Linux desktop shell for Codex.

- `src-tauri/` contains the Rust/Tauri bridge and native app configuration.
- `src/` contains the React UI components, hooks, and frontend logic.
- `systemd/` contains service and desktop integration payloads.
- `scripts/` contains install and control helpers for the engine.

The desktop app communicates with a local `codex-engine` systemd service and forwards AI inference requests to an OpenAI-compatible cloud provider.
