/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CODEX_ENGINE_WS_URL: string;
  readonly VITE_CODEX_ENGINE_UNIX_SOCKET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
