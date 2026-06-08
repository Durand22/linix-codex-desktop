export type DisplayServer = "wayland" | "x11" | "unknown";

export function detectDisplayServer(): DisplayServer {
  const waylandDisplay = typeof process !== "undefined" ? process.env.WAYLAND_DISPLAY : undefined;
  const x11Display = typeof process !== "undefined" ? process.env.DISPLAY : undefined;

  if (waylandDisplay && waylandDisplay.length > 0) {
    return "wayland";
  }

  if (x11Display && x11Display.length > 0) {
    return "x11";
  }

  return "unknown";
}

export function buildDesktopLaunchEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};

  if (typeof process !== "undefined") {
    if (process.env.WAYLAND_DISPLAY) {
      env.WAYLAND_DISPLAY = process.env.WAYLAND_DISPLAY;
    }
    if (process.env.DISPLAY) {
      env.DISPLAY = process.env.DISPLAY;
    }
    if (process.env.XDG_RUNTIME_DIR) {
      env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR;
    }
    if (process.env.XDG_SESSION_TYPE) {
      env.XDG_SESSION_TYPE = process.env.XDG_SESSION_TYPE;
    }
  }

  return env;
}
