import type { FieldAdapterConfig } from "@/lib/sync/adapter";
import { createSyncedStore, type SyncedStoreConfig, type SyncStatus } from "@/lib/sync/store";

export interface Preferences {
  hapticsEnabled: boolean;
  dailyReminderEnabled: boolean;
  reminderTime: string;
}

export interface PreferencesRecord extends Preferences {
  id: "settings";
  updatedAt: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
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

export function usePreferences(): PreferencesRecord {
  return store.useRecords()[0] ?? DEFAULT_RECORD;
}

export function getPreferences(): PreferencesRecord {
  return store.getRecords()[0] ?? DEFAULT_RECORD;
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
