#!/usr/bin/env bash
set -euo pipefail

readonly SERVICE_NAME="codex-engine.service"

usage() {
  cat <<'EOF'
Usage: codex-engine-ctl.sh <start|stop|restart|status|enable|disable|logs>

Manage the user-level codex app-server systemd unit.
EOF
}

require_systemctl() {
  if ! command -v systemctl >/dev/null 2>&1; then
    printf 'systemctl is required but was not found in PATH\n' >&2
    exit 1
  fi
}

main() {
  require_systemctl

  if [ "$#" -ne 1 ]; then
    usage >&2
    exit 1
  fi

  case "$1" in
    start)
      systemctl --user start "${SERVICE_NAME}"
      ;;
    stop)
      systemctl --user stop "${SERVICE_NAME}"
      ;;
    restart)
      systemctl --user restart "${SERVICE_NAME}"
      ;;
    status)
      systemctl --user status "${SERVICE_NAME}" --no-pager
      ;;
    enable)
      systemctl --user enable --now "${SERVICE_NAME}"
      ;;
    disable)
      systemctl --user disable --now "${SERVICE_NAME}"
      ;;
    logs)
      journalctl --user -u "${SERVICE_NAME}" -f
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
