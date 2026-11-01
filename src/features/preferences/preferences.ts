import { useEffect, useMemo, useState } from "react";

import type { FieldAdapterConfig } from "@/lib/sync/adapter";
import { createSyncedStore, type SyncedStoreConfig, type SyncStatus } from "@/lib/sync/store";

/**
 * How the app takes input. `legacy` is the original gesture grammar — holds,
 * swipes and drags for every commitment. `traditional` swaps each of those
 * for an ordinary tap target, for people who would rather just press things.
 */
export type UxMode = "legacy" | "traditional";

export interface Preferences {
  uxMode: UxMode;
  /**
   * Whether surfaces that support it (home's course bar) use iOS 26 Liquid
   * Glass. Ignored where the platform can't render it — see
   * useLiquidGlass in lib/liquid-glass.ts.
   */
  liquidGlass: boolean;
  hapticsEnabled: boolean;
  dailyReminderEnabled: boolean;
  reminderTime: string;
}

export interface PreferencesRecord extends Preferences {
  id: "settings";
  updatedAt: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  uxMode: "legacy",
  liquidGlass: true,
  hapticsEnabled: true,
  dailyReminderEnabled: false,
  reminderTime: "19:30",
};

const DEFAULT_RECORD: PreferencesRecord = {
  id: "settings",
  ...DEFAULT_PREFERENCES,
  updatedAt: 0,
};

/**
 * `settings` is fixed by the path, not duplicated in the document. Reusing
 * userId for the factory's id and owner fields leaves it as the only wire
 * field while the document id continues to select `settings`.
 */
export const PREFERENCES_FIELD: FieldAdapterConfig = {
  idField: "userId",
  ownerIdField: "userId",
  timestampFields: ["updatedAt"],
  serverTimestamps: { updatedAt: "always" },
};

export function isPreferencesRecord(value: unknown): value is PreferencesRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PreferencesRecord>;
  return (
    candidate.id === "settings" &&
    // Optional on the wire: records written before the choice existed are
    // read back as legacy by normalise() rather than rejected.
    (candidate.uxMode === undefined || candidate.uxMode === "legacy" || candidate.uxMode === "traditional") &&
    (candidate.liquidGlass === undefined || typeof candidate.liquidGlass === "boolean") &&
    typeof candidate.hapticsEnabled === "boolean" &&
    typeof candidate.dailyReminderEnabled === "boolean" &&
    typeof candidate.reminderTime === "string" &&
    /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(candidate.reminderTime) &&
    typeof candidate.updatedAt === "number" &&
    Number.isFinite(candidate.updatedAt)
  );
}

const preferencesSyncConfig: SyncedStoreConfig<PreferencesRecord> = {
  name: "preferences",
  collectionPath: (uid) => `users/${uid}/preferences`,
  pathIsOwnerScoped: true,
  field: PREFERENCES_FIELD,
  remoteUpdatedAtField: "updatedAt",
  isValid: isPreferencesRecord,
};

const store = createSyncedStore<PreferencesRecord>(preferencesSyncConfig);

// Remembers the last upgrade so an older record maps to the same object
// on every render, rather than a fresh copy that defeats memo and effect deps.
let lastRaw: PreferencesRecord | undefined;
let lastNormalised: PreferencesRecord = DEFAULT_RECORD;

function normalise(record: PreferencesRecord | undefined): PreferencesRecord {
  if (!record) return DEFAULT_RECORD;
  // Fields added after launch are optional on the wire; fill them in here.
  if (record.uxMode !== undefined && record.liquidGlass !== undefined) return record;
  if (record !== lastRaw) {
    lastRaw = record;
    lastNormalised = {
      ...record,
      uxMode: record.uxMode ?? DEFAULT_PREFERENCES.uxMode,
      liquidGlass: record.liquidGlass ?? DEFAULT_PREFERENCES.liquidGlass,
    };
  }
  return lastNormalised;
}

export function usePreferences(): PreferencesRecord {
  return normalise(store.useRecords()[0]);
}

export function getPreferences(): PreferencesRecord {
  return normalise(store.getRecords()[0]);
}

/** True when every hold, swipe and drag should render as a plain tap target. */
export function useTraditionalUx(): boolean {
  return usePreferences().uxMode === "traditional";
}

export function updatePreferences(patch: Partial<Preferences>): void {
  store.put({ ...getPreferences(), ...patch, id: "settings" });
}

export function usePreferencesSyncStatus(): SyncStatus {
  return store.useSyncStatus();
}

/** How often the settings SYNC row re-reads the store. */
export const SYNC_SUMMARY_REFRESH_MS = 120_000;

/**
 * A calm, past-tense sync summary: "SYNCED · 3 MIN AGO". A queued write
 * flips the store to "syncing" for a few hundred milliseconds, so naming
 * that state live made the row flicker on every preference change. Once the
 * store has synced at least once, the row reports when, and only says
 * SYNCING or OFFLINE when there is no sync to point back to.
 */
export function syncSummaryLabel(status: SyncStatus, lastSyncedAt: number | null, now: number): string {
  if (lastSyncedAt === null) return status === "offline" ? "OFFLINE" : "SYNCING";
  if (status === "offline") return "OFFLINE";
  const minutes = Math.floor(Math.max(0, now - lastSyncedAt) / 60_000);
  if (minutes < 1) return "SYNCED · JUST NOW";
  if (minutes < 60) return `SYNCED · ${minutes} MIN AGO`;
  const hours = Math.floor(minutes / 60);
  return `SYNCED · ${hours} HR AGO`;
}

/**
 * The SYNC row's text, recomputed every SYNC_SUMMARY_REFRESH_MS rather than
 * on every status change — the one exception being the first sync, so a row
 * opened mid-connect doesn't sit on SYNCING for two minutes.
 */
export function usePreferencesSyncSummary(): string {
  // Subscribed so the first-sync flip below re-renders this; the label
  // itself ignores status changes between ticks.
  store.useSyncStatus();
  const [now, setNow] = useState(() => Date.now());
  const everSynced = store.getLastSyncedAt() !== null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), SYNC_SUMMARY_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return useMemo(
    // A first sync landing between ticks is newer than `now`; the label
    // clamps that to JUST NOW rather than a negative age.
    () => syncSummaryLabel(store.getSyncStatus(), store.getLastSyncedAt(), now),
    // Recomputed on the timer, and once when the first sync lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, everSynced],
  );
}

export function syncStatusLabel(status: SyncStatus): "SYNCED" | "SYNCING" | "OFFLINE" {
  if (status === "synced") return "SYNCED";
  return status === "syncing" ? "SYNCING" : "OFFLINE";
}
