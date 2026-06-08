import type { EngineStatus } from "../../lib/engine-health";

interface StatusBarProps {
  engine: EngineStatus;
}

export function StatusBar({ engine }: StatusBarProps) {
  const indicatorClass =
    engine.state === "connected"
      ? "bg-emerald-500"
      : engine.state === "connecting"
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <footer className="flex h-8 items-center gap-3 border-t border-zinc-800 px-4 text-xs text-zinc-400">
      <span className={`inline-block h-2 w-2 rounded-full ${indicatorClass}`} />
      <span>Engine: {engine.state}</span>
      <span className="text-zinc-600">|</span>
      <span>{engine.endpoint}</span>
      {engine.detail ? (
        <>
          <span className="text-zinc-600">|</span>
          <span>{engine.detail}</span>
        </>
      ) : null}
    </footer>
  );
}
