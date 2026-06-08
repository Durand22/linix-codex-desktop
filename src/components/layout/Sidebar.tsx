const NAV_ITEMS = [
  { id: "workspace", label: "Workspace" },
  { id: "sessions", label: "Sessions" },
  { id: "settings", label: "Settings" },
] as const;

export function Sidebar() {
  return (
    <aside className="flex w-52 flex-col border-r border-zinc-800 bg-zinc-900/60 p-3">
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="rounded-md px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
