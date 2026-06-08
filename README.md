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
# Use the repository Node version
nvm use

# Install system payloads
./scripts/install-system-payloads.sh

# Enable and start the background engine
systemctl --user enable --now codex-engine.service

# Develop the desktop shell
npm install
npm run tauri:dev
```
