import { useCallback, useEffect, useRef, useState } from "react";

import { EMPTY_DASHBOARD, fetchDashboard, type DashboardSnapshot } from "@/features/admin/dashboard";

/**
 * Kept separate from the hook so the mapping is testable without mounting a
 * component, matching getAuthErrorMessage in auth/errors.ts. A callable
 * error is a FirebaseError whose `.code` is prefixed "functions/" (the
 * client SDK's own convention, distinct from the "auth/..." codes
 * getAuthErrorMessage matches) — "functions/permission-denied" is what the
 * backend throws when the caller's token lacks the admin claim, and gets
 * its own message rather than the generic fallback because "you're not
 * allowed here" is actionable in a way "something went wrong" is not.
 */
export function dashboardErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "functions/permission-denied"
  ) {
    return "YOU DO NOT HAVE DASHBOARD ACCESS.";
  }
  return "COULDN'T LOAD THE DASHBOARD. TRY AGAIN.";
}

export interface UseDashboardResult {
  snapshot: DashboardSnapshot | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  refresh: () => void;
}

/**
 * No module-level store here unlike stats.ts/role.ts — the dashboard is a
 * single admin-only screen's data, fetched on demand rather than kept live
 * for the whole app session, so a plain per-mount fetch is the right amount
 * of machinery. `cancelled` guards every state update because the fetch is
 * async and the screen (reached only past an admin gate that can itself
 * change under the user) can unmount before it resolves.
 */
export function useDashboard(): UseDashboardResult {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setStatus("loading");
    setError(null);

    fetchDashboard()
      .then((result) => {
        if (requestId.current !== id) return;
        setSnapshot(result);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setSnapshot(EMPTY_DASHBOARD);
        setStatus("error");
        setError(dashboardErrorMessage(err));
      });
  }, []);

  useEffect(() => {
    load();
    // Bumping requestId on unmount makes any in-flight response from this
    // effect a no-op even though `load` can also be called again by
    // `refresh` — a stale unmount-time value is indistinguishable from a
    // stale refresh-time one, so one counter covers both.
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  return { snapshot, status, error, refresh: load };
}
