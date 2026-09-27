// Owner: Christian (Server & Infra) — Added Sep 26. Same dual-path pattern as groups/queries.ts
// useMyGroups: no session (mock-mode dev) reads the mock server route; a real session reads
// Supabase directly under RLS (`user_id = auth.uid()`), per docs/API-CONTRACTS.md's "reads that
// bypass the server".
// CHANGED Sep 26 (wave 5, Sahith): the server now writes rows, so the feed subscribes to Realtime on
// `notifications` (JWT on the socket, one topic per hook instance — see useGroup) and the one-minute poll
// is the safety net. useUnreadCount() drives the bell dot on Home.
import type { Notification } from '@degrees/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { currentSession, queryKeys } from '@/features/groups/queries';
import { LIVE_POLL_MS } from '@/lib/query';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';

async function fetchNotifications(): Promise<Notification[]> {
  const session = await currentSession();
  if (!session) {
    return (await api.getNotifications()).notifications;
  }
  const { data, error } = await getSupabaseClient()
    .from('notifications')
    .select('id, type, payload, read, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return data.map((row) => ({
    id: row.id as string,
    type: row.type as Notification['type'],
    payload: row.payload as Record<string, unknown>,
    read: row.read as boolean,
    createdAt: row.created_at as string,
  }));
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const instance = useRef(Math.random().toString(36).slice(2, 10));

  useEffect(() => {
    if (isSupabaseEnvironmentUnset()) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void currentSession().then(async (session) => {
      if (cancelled || !session) return;
      const supabase = getSupabaseClient();
      // Without the JWT on the socket RLS evaluates as anon and nothing is delivered (verified Sep 26, chat).
      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;
      const topic = `notifications:${session.user.id}:${instance.current}`;
      for (const existing of supabase.getChannels()) {
        if (existing.topic === `realtime:${topic}`) await supabase.removeChannel(existing);
      }
      if (cancelled) return;
      const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      };
      const channel = supabase
        .channel(topic)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
          refresh,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
          refresh,
        )
        .subscribe((status, error) => {
          if (__DEV__ && error) console.warn(`[notifications] realtime ${status}: ${error.message}`);
        });
      cleanup = () => {
        void supabase.removeChannel(channel);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [queryClient]);

  // Wave 2: one-minute polling while focused; wave 5: Realtime above makes this the fallback.
  return useQuery({ queryKey: queryKeys.notifications, queryFn: fetchNotifications, refetchInterval: LIVE_POLL_MS });
}

// How many are unread — the ember dot on Home's bell.
export function useUnreadCount(): number {
  const notifications = useNotifications();
  return notifications.data?.filter((notification) => !notification.read).length ?? 0;
}
