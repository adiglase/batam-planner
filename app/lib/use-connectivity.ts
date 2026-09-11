import { useCallback, useEffect, useState } from "react";

export type Connectivity = {
  connected: boolean;
  checking: boolean;
  retry: () => Promise<boolean>;
};

/** Browser signal plus an explicit, read-only check against this application. */
export function useConnectivity(): Connectivity {
  const [connected, setConnected] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const update = () => setConnected(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const retry = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/connectivity", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      setConnected(response.ok);
      return response.ok;
    } catch {
      setConnected(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  return { connected, checking, retry };
}
