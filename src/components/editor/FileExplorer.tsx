const ROOT_ENTRIES = [
  { name: "src", kind: "directory" as const },
  { name: "README.md", kind: "file" as const },
];

export function FileExplorer() {
  return (
    <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-2 text-sm text-zinc-300">
        Files
      </div>
      <ul className="flex-1 overflow-y-auto p-2 text-sm text-zinc-400">
        {ROOT_ENTRIES.map((entry) => (
          <li
            key={entry.name}
            className="rounded px-2 py-1 hover:bg-zinc-900 hover:text-zinc-200"
          >
            {entry.kind === "directory" ? `${entry.name}/` : entry.name}
          </li>
        ))}
      </ul>
    </aside>
  );
}
