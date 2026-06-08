import { DEFAULT_ENGINE_WS_URL } from "./codex-client";

export type EngineState = "disconnected" | "connecting" | "connected";

export type EngineStatus = {
  state: EngineState;
  endpoint: string;
  detail: string | null;
};

export function resolveEngineEndpoint(): string {
  const configured = import.meta.env.VITE_CODEX_ENGINE_WS_URL;
  if (configured && configured.length > 0) {
    return configured;
  }
  return DEFAULT_ENGINE_WS_URL;
}

export async function probeEngine(endpoint: string): Promise<EngineStatus> {
  return new Promise((resolve) => {
    const socket = new WebSocket(endpoint);
    const timeout = window.setTimeout(() => {
      socket.close();
      resolve({
        state: "disconnected",
        endpoint,
        detail: "Connection timed out",
      });
    }, 3000);

    socket.addEventListener("open", () => {
      window.clearTimeout(timeout);
      socket.close();
      resolve({
        state: "connected",
        endpoint,
        detail: null,
      });
    });

    socket.addEventListener("error", () => {
      window.clearTimeout(timeout);
      resolve({
        state: "disconnected",
        endpoint,
        detail: "Engine unreachable; start codex-engine.service",
      });
    });
  });
}
