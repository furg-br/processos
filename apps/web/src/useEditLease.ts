import { useEffect, useRef } from "react";
import { releaseLease, renewLease } from "./api";

export const EDIT_LEASE_RENEW_INTERVAL_MS = 2 * 60_000;

export function useEditLease(token: string | undefined, onExpired: (message: string) => void) {
  const onExpiredRef = useRef(onExpired);

  useEffect(() => { onExpiredRef.current = onExpired; }, [onExpired]);

  useEffect(() => {
    if (!token) return;

    let active = true;
    let renewing = false;

    async function renew() {
      if (!active || renewing) return;
      renewing = true;
      try {
        await renewLease(token!);
      } catch (error) {
        if (active) {
          onExpiredRef.current(error instanceof Error ? error.message : "O bloqueio de edição expirou.");
        }
      } finally {
        renewing = false;
      }
    }

    const interval = window.setInterval(() => { void renew(); }, EDIT_LEASE_RENEW_INTERVAL_MS);
    const handleVisibility = () => { if (document.visibilityState === "visible") void renew(); };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      void releaseLease(token).catch(() => undefined);
    };
  }, [token]);
}
