export type SessionMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type SessionState = {
  id: string;
  title: string;
  workspaceRoot: string;
  messages: SessionMessage[];
};

export function createSession(workspaceRoot: string): SessionState {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New session",
    workspaceRoot,
    messages: [
      {
        id: crypto.randomUUID(),
        role: "system",
        content: "Session initialized against local codex app-server.",
        createdAt: timestamp,
      },
    ],
  };
}
