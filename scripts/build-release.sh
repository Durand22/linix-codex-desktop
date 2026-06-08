#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

main() {
  cd "${PROJECT_ROOT}"

  if ! command -v pnpm >/dev/null 2>&1; then
    printf 'pnpm is required but was not found in PATH\n' >&2
    exit 1
  fi

  if ! command -v cargo >/dev/null 2>&1; then
    printf 'cargo is required but was not found in PATH\n' >&2
    exit 1
  fi

  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm tauri build
}

main "$@"
