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

export function syncStatusLabel(status: SyncStatus): "SYNCED" | "SYNCING" | "OFFLINE" {
  if (status === "synced") return "SYNCED";
  return status === "syncing" ? "SYNCING" : "OFFLINE";
}
