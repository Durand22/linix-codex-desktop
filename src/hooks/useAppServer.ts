import { useEffect, useRef, useState } from "react";
import { CodexAppServerClient } from "../lib/codex-client";
import { resolveEngineEndpoint } from "../lib/engine-health";

export function useAppServer() {
  const clientRef = useRef<CodexAppServerClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const endpoint = resolveEngineEndpoint();
    const client = new CodexAppServerClient(endpoint);
    clientRef.current = client;

    client
      .connect()
      .then(() => {
        setConnected(true);
        setError(null);
      })
      .catch((connectError: Error) => {
        setConnected(false);
        setError(connectError.message);
      });

    return () => {
      client.disconnect();
      clientRef.current = null;
      setConnected(false);
    };
  }, []);

  return {
    connected,
    error,
    client: clientRef.current,
  };
}
