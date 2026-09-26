// Owner: Christian (Server & Infra) — Added Sep 26. Same dual-path pattern as groups/queries.ts
// useMyGroups: no session (mock-mode dev) reads the mock server route; a real session reads
// Supabase directly under RLS (`user_id = auth.uid()`), per docs/API-CONTRACTS.md's "reads that
// bypass the server".
import type { Notification } from '@degrees/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { currentSession, queryKeys } from '@/features/groups/queries';
import { LIVE_POLL_MS } from '@/lib/query';
import { getSupabaseClient } from '@/lib/supabase';

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
  // Wave 2: one-minute polling while focused, until the Realtime subscription lands (Christian, ROLES.md).
  return useQuery({ queryKey: queryKeys.notifications, queryFn: fetchNotifications, refetchInterval: LIVE_POLL_MS });
}
