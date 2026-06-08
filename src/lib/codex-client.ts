export const DEFAULT_ENGINE_WS_URL = "ws://127.0.0.1:4520";
export const DEFAULT_ENGINE_UNIX_SOCKET = "/run/user/%UID%/codex/app-server.sock";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export class CodexAppServerClient {
  private socket: WebSocket | null = null;
  private readonly pending = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
    }
  >();
  private requestCounter = 0;

  constructor(private readonly endpoint: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.endpoint);

      this.socket.addEventListener("open", () => {
        resolve();
      });

      this.socket.addEventListener("message", (event) => {
        const payload = JSON.parse(String(event.data)) as JsonRpcResponse;
        if (payload.id === null) {
          return;
        }
        const waiter = this.pending.get(payload.id);
        if (!waiter) {
          return;
        }
        this.pending.delete(payload.id);
        if (payload.error) {
          waiter.reject(new Error(payload.error.message));
          return;
        }
        waiter.resolve(payload.result);
      });

      this.socket.addEventListener("error", () => {
        reject(new Error(`Failed to connect to Codex app-server at ${this.endpoint}`));
      });

      this.socket.addEventListener("close", () => {
        for (const [, waiter] of this.pending) {
          waiter.reject(new Error("Codex app-server connection closed"));
        }
        this.pending.clear();
      });
    });
  }

  call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Codex app-server socket is not connected"));
    }

    const id = ++this.requestCounter;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket?.send(JSON.stringify(request));
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }
}
