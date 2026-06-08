# Codex Desktop Issue Reports

This document tracks known installation and runtime issues for the Codex Desktop repository.
It is intended to capture troubleshooting details beyond the README and make the project easier to use.

## 1. Installer apt update failure: Waydroid NO_PUBKEY

### Symptoms
- `./install.sh` stops during `apt update`
- Error message includes:
  - `NO_PUBKEY 0E406D181DCEE19C`
  - `waydroid.gpg are ignored as the file has an unsupported filetype`
  - `The repository 'https://repo.waydro.id noble InRelease' is not signed`

### Root cause
The Waydroid repository signing key is missing or the existing key file is corrupted or invalid.

### Fix
```bash
sudo rm /usr/share/keyrings/waydroid.gpg
sudo curl --proto '=https' --tlsv1.2 -sSf https://repo.waydro.id/waydroid.gpg -o /usr/share/keyrings/waydroid.gpg
sudo apt update
```

### Installer behavior
The automated installer now attempts this fix automatically when `apt update` fails with Waydroid key or signature issues.

## 2. Missing Ubuntu universe repo for libwebkit2gtk

### Symptoms
- `apt install` fails with:
  - `Unable to locate package libwebkit2gtk-4.0-dev`

### Root cause
The Ubuntu `universe` repository is not enabled, which is required for the `libwebkit2gtk-4.0-dev` package.

### Fix
```bash
sudo add-apt-repository universe
sudo apt update
sudo apt install -y libwebkit2gtk-4.0-dev
```

### Installer behavior
The installer now tries to detect this case and enable `universe` automatically.

## 3. Manual fallback path

If the automated installer cannot complete, use the manual fallback path:

```bash
nvm use
npm install
./scripts/install-system-payloads.sh
systemctl --user enable --now codex-engine.service
npm run tauri:dev
```

If the installer still fails, refer to the troubleshooting section in `README.md` for specific error cases.

## 4. Node / nvm requirements

### Requirement
- Node.js `20.x`

### Recommended install
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 20
nvm use 20
```

### Notes
- The repo uses `.nvmrc` to document the supported version.
- `nvm` must be loaded before running `npm install` or the installer.

## 5. Rust toolchain requirements

### Requirement
- Rust stable toolchain for Tauri and native build support

### Recommended install
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup toolchain install stable
rustup default stable
```

## 6. User systemd issues

### Symptoms
- `systemctl --user enable --now codex-engine.service` fails

### Fix
```bash
loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now codex-engine.service
```

## 7. Installer and README coverage

This repository now includes:
- `install.sh` with auto-fix logic for apt repository and universe repo issues
- `README.md` with setup instructions, manual fallback, and troubleshooting guidance
- `ISSUES.md` for full issue reporting and fix details
