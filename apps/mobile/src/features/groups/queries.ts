// Owner: Pranav (Groups, Activities & Chat) — TanStack Query hooks shared by the group, activity, and chat screens.
// CHANGED Sep 26 (wave 2): the home list comes from GET /api/hangouts (groups + meetups together) instead of a
// direct group_members read, which couldn't see meetup names or history. Live screens poll once a minute while
// focused (LIVE_POLL_MS); every list also has pull-to-refresh.
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { LIVE_POLL_MS } from '@/lib/query';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';

// The mock server's only group; used when there's no signed-in Supabase session to list real groups.
export const DEMO_GROUP_ID = '30000000-0000-4000-8000-000000000001';
// While a plan is generating, refresh often enough that the reveal feels live even if Realtime is quiet.
const GENERATING_POLL_MS = 2_000;

export const queryKeys = {
  me: ['me'] as const,
  group: (id: string) => ['group', id] as const,
  messages: (id: string) => ['messages', id] as const,
  hangouts: ['hangouts'] as const,
  photos: (id: string) => ['photos', id] as const,
  graph: ['graph', 'me'] as const,
  notifications: ['notifications'] as const,
};

// Null in mock-mode dev (no Supabase env) or before sign-in; direct reads and Realtime need a session.
export async function currentSession(): Promise<Session | null> {
  if (isSupabaseEnvironmentUnset()) {
    return null;
  }
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session;
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: api.getMe });
}

// `live` (wave 2): one-minute polling while the screen is focused. While a plan is generating (Christian, PR #22)
// it polls every 2s and also subscribes to `activities` so the 'ready' row lands the moment it's written.
export function useGroup(id: string | undefined, { live = false }: { live?: boolean } = {}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!id || isSupabaseEnvironmentUnset()) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void currentSession().then(async (session) => {
      if (cancelled || !session) return;
      const supabase = getSupabaseClient();
      // Same fix as chat: the socket must carry the JWT or RLS evaluates as anon and nothing is delivered.
      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;
      const channel = supabase
        .channel(`group-activity-sub:${id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'activities',
            filter: `group_id=eq.${id}`,
          },
          () => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.group(id),
            });
          },
        )
        .subscribe();

      cleanup = () => {
        void supabase.removeChannel(channel);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [id, queryClient]);

  return useQuery({
    queryKey: queryKeys.group(id ?? ''),
    queryFn: () => api.getGroup(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.activityStatus === 'generating' || data?.activity?.status === 'generating') {
        return GENERATING_POLL_MS;
      }
      return live ? LIVE_POLL_MS : false;
    },
  });
}

export function useHangouts() {
  return useQuery({
    queryKey: queryKeys.hangouts,
    queryFn: api.getHangouts,
    refetchInterval: LIVE_POLL_MS,
  });
}
