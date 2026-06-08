import { StatusBar } from "./StatusBar";
import { useEngineStatus } from "../../hooks/useEngineStatus";
import { WorkspaceDashboard } from "../workspace/WorkspaceDashboard";

export function AppShell() {
  const engine = useEngineStatus();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-center border-b border-zinc-800 px-4">
        <span className="text-sm font-semibold tracking-wide text-zinc-100">
          Codex Desktop
        </span>
        <span className="ml-3 text-xs text-zinc-500">Linux native shell</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <WorkspaceDashboard />
      </div>
      <StatusBar engine={engine} />
    </div>
  );
}
