// Owner: shared mobile scaffold (Charles) — see docs/ROLES.md.
// CHANGED Sep 26 (wave 2): the cache persists to disk (expo-sqlite) so Home, Circle, and "already met" render
// instantly on relaunch and survive a dead connection; queries refetch on app foreground; screens that show
// live data poll on LIVE_POLL_MS while focused (see features/*/queries.ts).
import { useCallback, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { deviceStorage, QUERY_CACHE_KEY } from './storage';

// A minute is the team's chosen cadence for "pages that need live information".
export const LIVE_POLL_MS = 60_000;
// Cached data older than this is thrown away on launch rather than shown.
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Must exceed maxAge or the persister drops entries before they're restored.
      gcTime: CACHE_MAX_AGE_MS,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: deviceStorage,
  key: QUERY_CACHE_KEY,
  throttleTime: 1_000,
});

export const persistOptions = {
  persister: queryPersister,
  maxAge: CACHE_MAX_AGE_MS,
  // Bump when a cached shape changes incompatibly so old entries are discarded, not rendered.
  buster: 'wave6',
};

// React Native has no window focus events; map the app coming to the foreground onto TanStack's focus manager so
// refetchOnWindowFocus and focused-only polling behave the way they do on the web.
let focusSubscribed = false;
export function subscribeQueryFocus(): void {
  if (focusSubscribed) return;
  focusSubscribed = true;
  focusManager.setEventListener((handleFocus) => {
    const onChange = (status: AppStateStatus) => handleFocus(status === 'active');
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  });
}

// Added Sep 26 (wave 4): the spinner for a pull, and only a pull. Screens used `refreshing={query.isRefetching}`,
// so every one-minute background poll (and every Realtime invalidation) popped the RefreshControl open and shoved
// the list down mid-scroll. This tracks the user's own gesture: true from the pull until that refetch settles.
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve(refetch()).finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
