import { useEffect, useState } from "react";
import {
  type EngineStatus,
  probeEngine,
  resolveEngineEndpoint,
} from "../lib/engine-health";

const INITIAL_STATUS: EngineStatus = {
  state: "connecting",
  endpoint: resolveEngineEndpoint(),
  detail: null,
};

export function useEngineStatus(pollIntervalMs = 5000): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>(INITIAL_STATUS);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const endpoint = resolveEngineEndpoint();
      setStatus((current) => ({
        ...current,
        state: "connecting",
        endpoint,
      }));
      const next = await probeEngine(endpoint);
      if (!cancelled) {
        setStatus(next);
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollIntervalMs]);

  return status;
}
