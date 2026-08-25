import { useEffect, useState } from "react";

export function shouldShowSkeleton(hydrated: boolean, delayElapsed: boolean): boolean {
  return !hydrated && delayElapsed;
}

/** Avoids flashing a skeleton when the local cache resolves immediately. */
export function useDelayedSkeleton(hydrated: boolean, delayMs = 300): boolean {
  const [delayElapsed, setDelayElapsed] = useState(false);

  useEffect(() => {
    if (hydrated) {
      setDelayElapsed(false);
      return;
    }
    const timer = setTimeout(() => setDelayElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, hydrated]);

  return shouldShowSkeleton(hydrated, delayElapsed);
}
