// Owner: shared mobile scaffold (Charles) — on-device key/value storage, added Sep 26 (wave 2).
// One SQLite-backed store (expo-sqlite/kv-store, AsyncStorage-compatible) shared by the TanStack Query persister
// (lib/query.ts) and the persisted slice of the session store (stores/session.ts). Everything in it is a
// cache or a per-device preference: clearing it only costs a refetch.
import Storage from 'expo-sqlite/kv-store';

export const deviceStorage = {
  getItem: (key: string) => Storage.getItem(key),
  setItem: (key: string, value: string) => Storage.setItem(key, value),
  removeItem: (key: string) => Storage.removeItem(key),
};

export const QUERY_CACHE_KEY = 'degrees.query-cache.v1';
export const SESSION_STORE_KEY = 'degrees.session.v1';

// Sign-out wipes the cached queries so nothing from one account renders for the next.
export async function clearDeviceCaches(): Promise<void> {
  await Promise.all([Storage.removeItem(QUERY_CACHE_KEY)]);
}
