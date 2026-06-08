import { MessageList } from "./MessageList";

export function ChatPanel() {
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-zinc-800 px-4 py-2 text-sm text-zinc-300">
        Agent
      </div>
      <MessageList />
      <form
        className="border-t border-zinc-800 p-4"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <textarea
          className="h-24 w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          placeholder="Ask Codex to view, edit, or create files..."
        />
      </form>
    </section>
  );
}
