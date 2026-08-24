/**
 * uid-namespaced AsyncStorage keys, so two accounts signed into the same
 * device never read or overwrite each other's cache. `cardinal.local.<name>`
 * is the signed-out namespace — distinct from any uid's namespace, and never
 * cleared on sign-out (see the hydrate() note in store.ts), since the point
 * of namespacing by uid in the first place is that signing back in should
 * find exactly what was left behind.
 */

export interface SyncStorageKeys {
  records: string;
  meta: string;
  outbox: string;
}

export function syncStorageKeys(name: string, uid: string | null): SyncStorageKeys {
  const base = uid ? `cardinal.${uid}.${name}` : `cardinal.local.${name}`;
  return {
    records: base,
    meta: `${base}.meta`,
    outbox: `${base}.outbox`,
  };
}
