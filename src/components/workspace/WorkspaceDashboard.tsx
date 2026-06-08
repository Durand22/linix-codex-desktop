import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";

type ThreadStatus = "running" | "waiting" | "review" | "done";
type DiffStatus = "pending" | "approved" | "rejected";
type LogLevel = "stdout" | "stderr" | "system";
type TreeKind = "directory" | "file" | "symlink" | "other";

type AgentThread = {
  id: string;
  name: string;
  task: string;
  status: ThreadStatus;
  workspace: string;
  updatedAt: string;
};

type DirectoryTreeNode = {
  path: string;
  name: string;
  kind: TreeKind;
  depth: number;
  children: DirectoryTreeNode[];
  metadata: {
    size: number;
    readonly: boolean;
    modifiedMs: number | null;
  };
};

type DiffFile = {
  path: string;
  status: DiffStatus;
  additions: number;
  deletions: number;
  original: string;
  proposed: string;
};

type TerminalLog = {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
};

type EngineOutputPayload = {
  stream?: LogLevel;
  line?: string;
};

const SAMPLE_THREADS: AgentThread[] = [
  {
    id: "planner",
    name: "Planner",
    task: "Coordinating workspace changes",
    status: "running",
    workspace: "codex-desktop",
    updatedAt: "now",
  },
  {
    id: "rust-core",
    name: "Rust Core",
    task: "Watching engine bridge",
    status: "waiting",
    workspace: "src-tauri",
    updatedAt: "2m",
  },
  {
    id: "ui-review",
    name: "UI Review",
    task: "Pending diff approval",
    status: "review",
    workspace: "src",
    updatedAt: "5m",
  },
];

const SAMPLE_DIFFS: DiffFile[] = [
  {
    path: "src/components/workspace/WorkspaceDashboard.tsx",
    status: "pending",
    additions: 84,
    deletions: 18,
    original: [
      "export function AppShell() {",
      "  return (",
      "    <main>",
      "      <FileExplorer />",
      "      <ChatPanel />",
      "    </main>",
      "  );",
      "}",
    ].join("\n"),
    proposed: [
      "export function WorkspaceDashboard() {",
      "  return (",
      "    <main className=\"grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)]\">",
      "      <ExecutionSidebar />",
      "      <DiffWorkspace />",
      "      <TerminalOutputOverlay />",
      "    </main>",
      "  );",
      "}",
    ].join("\n"),
  },
  {
    path: "src-tauri/src/fs/bridge.rs",
    status: "pending",
    additions: 31,
    deletions: 7,
    original: [
      "pub fn normalize_workspace_path(input: &str) -> PathBuf {",
      "    PathBuf::from(input)",
      "}",
    ].join("\n"),
    proposed: [
      "pub fn normalize_workspace_path(input: &str) -> PathBuf {",
      "    let expanded = expand_home(input);",
      "    expanded.canonicalize().unwrap_or(expanded)",
      "}",
    ].join("\n"),
  },
];

const FALLBACK_TREE: DirectoryTreeNode = {
  path: "/workspace",
  name: "codex-desktop",
  kind: "directory",
  depth: 0,
  metadata: { size: 0, readonly: false, modifiedMs: null },
  children: [
    {
      path: "/workspace/src",
      name: "src",
      kind: "directory",
      depth: 1,
      metadata: { size: 0, readonly: false, modifiedMs: null },
      children: [
        {
          path: "/workspace/src/App.tsx",
          name: "App.tsx",
          kind: "file",
          depth: 2,
          metadata: { size: 0, readonly: false, modifiedMs: null },
          children: [],
        },
      ],
    },
    {
      path: "/workspace/src-tauri",
      name: "src-tauri",
      kind: "directory",
      depth: 1,
      metadata: { size: 0, readonly: false, modifiedMs: null },
      children: [],
    },
  ],
};

const initialLogs: TerminalLog[] = [
  {
    id: "boot",
    level: "system",
    message: "Workspace dashboard initialized. Waiting for engine output.",
    timestamp: new Date().toLocaleTimeString(),
  },
];

export function WorkspaceDashboard() {
  const [threads] = useState(SAMPLE_THREADS);
  const [tree, setTree] = useState<DirectoryTreeNode>(FALLBACK_TREE);
  const [selectedPath, setSelectedPath] = useState(FALLBACK_TREE.path);
  const [diffs, setDiffs] = useState(SAMPLE_DIFFS);
  const [activeDiffPath, setActiveDiffPath] = useState(SAMPLE_DIFFS[0]?.path ?? "");
  const [logs, setLogs] = useState<TerminalLog[]>(initialLogs);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  const activeDiff = useMemo(
    () => diffs.find((diff) => diff.path === activeDiffPath) ?? diffs[0],
    [activeDiffPath, diffs],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      try {
        const roots = await invoke<string[]>("workspace_roots");
        const firstRoot = roots[0];
        if (!firstRoot) {
          setTreeError("No workspace roots configured");
          return;
        }

        const loadedTree = await invoke<DirectoryTreeNode>("read_directory_tree", {
          request: {
            root: firstRoot,
            maxDepth: 4,
            maxEntries: 2000,
          },
        });

        if (!cancelled) {
          setTree(loadedTree);
          setSelectedPath(loadedTree.path);
          setTreeError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setTreeError(String(error));
        }
      }
    }

    void loadTree();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let disposed = false;

    async function attachEngineLogs() {
      const attach = async (eventName: string, level: LogLevel) => {
        const unlisten = await listen<EngineOutputPayload>(eventName, (event) => {
          const line = event.payload?.line ?? "";
          if (!line) {
            return;
          }

          appendLog(level, line);
        });
        unlisteners.push(unlisten);
      };

      try {
        await attach("engine://stdout", "stdout");
        await attach("engine://stderr", "stderr");
        const unlistenExit = await listen("engine://exit", () => {
          appendLog("system", "Engine process exited.");
        });
        unlisteners.push(unlistenExit);
      } catch (error) {
        if (!disposed) {
          appendLog("system", `Engine event stream unavailable: ${String(error)}`);
        }
      }
    }

    void attachEngineLogs();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, []);

  function appendLog(level: LogLevel, message: string) {
    setLogs((current) =>
      [
        ...current,
        {
          id: crypto.randomUUID(),
          level,
          message,
          timestamp: new Date().toLocaleTimeString(),
        },
      ].slice(-300),
    );
  }

  function updateDiffStatus(path: string, status: DiffStatus) {
    setDiffs((current) =>
      current.map((diff) => (diff.path === path ? { ...diff, status } : diff)),
    );
    appendLog(
      "system",
      `${status === "approved" ? "Approved" : "Rejected"} proposed edits for ${path}`,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-zinc-800 bg-zinc-950">
          <div className="border-b border-zinc-800 px-4 py-3">
            <div className="text-sm font-semibold text-zinc-100">Execution Threads</div>
            <div className="mt-1 text-xs text-zinc-500">Multi-agent activity</div>
          </div>
          <div className="border-b border-zinc-800 p-3">
            <ThreadList threads={threads} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-zinc-100">Project Tree</div>
                <div className="mt-1 text-xs text-zinc-500">Native workspace view</div>
              </div>
              <button
                type="button"
                className="h-8 rounded border border-zinc-700 px-3 text-xs text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900"
                onClick={() => {
                  setSelectedPath(tree.path);
                  appendLog("system", "Project tree focus reset.");
                }}
              >
                Root
              </button>
            </div>
            {treeError ? (
              <div className="m-3 rounded border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-200">
                {treeError}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <TreeNode
                node={tree}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-100">
                Code Workspace
              </div>
              <div className="truncate text-xs text-zinc-500">{selectedPath}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-8 rounded border border-emerald-700 bg-emerald-950/40 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!activeDiff || activeDiff.status === "approved"}
                onClick={() => activeDiff && updateDiffStatus(activeDiff.path, "approved")}
              >
                Approve Changes
              </button>
              <button
                type="button"
                className="h-8 rounded border border-red-800 bg-red-950/30 px-3 text-xs font-medium text-red-200 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!activeDiff || activeDiff.status === "rejected"}
                onClick={() => activeDiff && updateDiffStatus(activeDiff.path, "rejected")}
              >
                Reject Changes
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
            <DiffFileList
              diffs={diffs}
              activePath={activeDiff?.path ?? ""}
              onSelect={setActiveDiffPath}
            />
            {activeDiff ? <SideBySideDiff diff={activeDiff} /> : <EmptyDiffState />}
          </div>
        </main>
      </div>

      <TerminalOverlay
        logs={logs}
        isOpen={isTerminalOpen}
        onToggle={() => setIsTerminalOpen((current) => !current)}
      />
    </div>
  );
}

function ThreadList({ threads }: { threads: AgentThread[] }) {
  return (
    <div className="space-y-2">
      {threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          className="w-full rounded border border-zinc-800 bg-zinc-900/40 p-3 text-left hover:border-zinc-700 hover:bg-zinc-900"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-medium text-zinc-100">{thread.name}</span>
            <StatusPill status={thread.status} />
          </div>
          <div className="mt-1 truncate text-xs text-zinc-400">{thread.task}</div>
          <div className="mt-2 flex items-center justify-between text-xs text-zinc-600">
            <span>{thread.workspace}</span>
            <span>{thread.updatedAt}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: ThreadStatus }) {
  const className =
    status === "running"
      ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
      : status === "review"
        ? "border-sky-700 bg-sky-950/40 text-sky-200"
        : status === "waiting"
          ? "border-amber-700 bg-amber-950/40 text-amber-200"
          : "border-zinc-700 bg-zinc-900 text-zinc-300";

  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] capitalize ${className}`}>
      {status}
    </span>
  );
}

function TreeNode({
  node,
  selectedPath,
  onSelect,
}: {
  node: DirectoryTreeNode;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(node.depth < 2);
  const isDirectory = node.kind === "directory";
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button
        type="button"
        className={`flex h-7 w-full min-w-0 items-center gap-2 rounded px-2 text-left text-xs ${
          isSelected
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: `${8 + node.depth * 14}px` }}
        onClick={() => {
          onSelect(node.path);
          if (isDirectory) {
            setExpanded((current) => !current);
          }
        }}
      >
        <span className="w-4 shrink-0 text-zinc-500">
          {isDirectory ? (expanded ? "▾" : "▸") : "•"}
        </span>
        <span className="truncate">{node.name}</span>
      </button>
      {isDirectory && expanded
        ? node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

function DiffFileList({
  diffs,
  activePath,
  onSelect,
}: {
  diffs: DiffFile[];
  activePath: string;
  onSelect: (path: string) => void;
}) {
  return (
    <aside className="min-h-0 overflow-auto border-r border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Modified Files
      </div>
      <div className="space-y-2">
        {diffs.map((diff) => (
          <button
            key={diff.path}
            type="button"
            className={`w-full rounded border p-3 text-left ${
              activePath === diff.path
                ? "border-zinc-600 bg-zinc-900"
                : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
            }`}
            onClick={() => onSelect(diff.path)}
          >
            <div className="truncate text-xs font-medium text-zinc-100">{diff.path}</div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-emerald-300">+{diff.additions}</span>
              <span className="text-red-300">-{diff.deletions}</span>
              <DiffStatusPill status={diff.status} />
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function DiffStatusPill({ status }: { status: DiffStatus }) {
  const className =
    status === "approved"
      ? "border-emerald-700 text-emerald-200"
      : status === "rejected"
        ? "border-red-800 text-red-200"
        : "border-zinc-700 text-zinc-300";

  return <span className={`rounded border px-2 py-0.5 text-[11px] ${className}`}>{status}</span>;
}

function SideBySideDiff({ diff }: { diff: DiffFile }) {
  return (
    <section className="flex min-w-0 flex-col bg-zinc-950">
      <div className="flex h-11 items-center justify-between border-b border-zinc-800 px-4">
        <div className="min-w-0 truncate text-sm font-medium text-zinc-100">{diff.path}</div>
        <div className="text-xs text-zinc-500">
          <span className="text-emerald-300">+{diff.additions}</span>
          <span className="mx-2 text-zinc-700">/</span>
          <span className="text-red-300">-{diff.deletions}</span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <CodePane title="Original Code" tone="original" code={diff.original} />
        <CodePane title="Agent Proposed Edits" tone="proposed" code={diff.proposed} />
      </div>
    </section>
  );
}

function CodePane({
  title,
  tone,
  code,
}: {
  title: string;
  tone: "original" | "proposed";
  code: string;
}) {
  const lines = code.split("\n");
  const gutterClass = tone === "proposed" ? "text-emerald-500" : "text-zinc-600";
  const titleClass = tone === "proposed" ? "text-emerald-200" : "text-zinc-300";

  return (
    <div className="min-w-0 overflow-hidden border-r border-zinc-800 last:border-r-0">
      <div className="flex h-9 items-center border-b border-zinc-800 bg-zinc-900/50 px-3">
        <span className={`text-xs font-semibold ${titleClass}`}>{title}</span>
      </div>
      <pre className="h-full overflow-auto p-0 font-mono text-xs leading-6 text-zinc-300">
        {lines.map((line, index) => (
          <div
            key={`${index}-${line}`}
            className={`grid grid-cols-[52px_minmax(0,1fr)] ${
              tone === "proposed" && line.trim().length > 0 ? "bg-emerald-950/10" : ""
            }`}
          >
            <span className={`select-none border-r border-zinc-900 px-3 text-right ${gutterClass}`}>
              {index + 1}
            </span>
            <code className="whitespace-pre px-3">{line || " "}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}

function EmptyDiffState() {
  return (
    <div className="flex items-center justify-center text-sm text-zinc-500">
      No file changes selected.
    </div>
  );
}

function TerminalOverlay({
  logs,
  isOpen,
  onToggle,
}: {
  logs: TerminalLog[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="border-t border-zinc-800 bg-zinc-950">
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between px-4 text-left text-xs text-zinc-300 hover:bg-zinc-900"
        onClick={onToggle}
      >
        <span className="font-semibold">Terminal Output</span>
        <span className="text-zinc-500">{isOpen ? "Hide" : "Show"}</span>
      </button>
      {isOpen ? (
        <div className="h-44 overflow-auto border-t border-zinc-800 bg-black px-4 py-3 font-mono text-xs leading-5">
          {logs.map((log) => (
            <div key={log.id} className="grid grid-cols-[84px_64px_minmax(0,1fr)] gap-3">
              <span className="text-zinc-600">{log.timestamp}</span>
              <span
                className={
                  log.level === "stderr"
                    ? "text-red-300"
                    : log.level === "stdout"
                      ? "text-emerald-300"
                      : "text-sky-300"
                }
              >
                {log.level}
              </span>
              <span className="min-w-0 break-words text-zinc-300">{log.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
