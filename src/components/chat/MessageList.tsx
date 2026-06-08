const PLACEHOLDER_MESSAGES = [
  {
    id: "welcome",
    role: "system" as const,
    content:
      "Connected to local codex app-server. Cloud inference is configured via ~/.codex/config.toml.",
  },
];

export function MessageList() {
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {PLACEHOLDER_MESSAGES.map((message) => (
        <article
          key={message.id}
          className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-300"
        >
          <header className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
            {message.role}
          </header>
          <p>{message.content}</p>
        </article>
      ))}
    </div>
  );
}
