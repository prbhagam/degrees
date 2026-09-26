// Owner: Pranav (Groups, Activities & Chat) — TanStack Query hooks shared by the group, activity, and chat screens.
import type { GroupStatus } from '@degrees/shared';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';

// The mock server's only group; used when there's no signed-in Supabase session to list real groups.
export const DEMO_GROUP_ID = '30000000-0000-4000-8000-000000000001';

export const queryKeys = {
  me: ['me'] as const,
  group: (id: string) => ['group', id] as const,
  messages: (id: string) => ['messages', id] as const,
  myGroups: ['myGroups'] as const,
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

export function useGroup(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.group(id ?? ''),
    queryFn: () => api.getGroup(id!),
    enabled: Boolean(id),
  });
}

export interface GroupSummary {
  id: string;
  status: GroupStatus;
  reasoning: string;
  formedAt: string | null;
}

interface GroupMembershipRow {
  groups: {
    id: string;
    status: GroupStatus | null;
    reasoning: string | null;
    formed_at: string | null;
  } | null;
}

// The contract has no "list my groups" endpoint; RLS lets members read their own group rows directly.
async function fetchMyGroups(): Promise<GroupSummary[]> {
  const session = await currentSession();
  if (!session) {
    return [
      {
        id: DEMO_GROUP_ID,
        status: 'confirmed',
        reasoning: 'Demo group from the mock server.',
        formedAt: null,
      },
    ];
  }
  const { data, error } = await getSupabaseClient()
    .from('group_members')
    .select('groups(id, status, reasoning, formed_at)')
    .eq('user_id', session.user.id)
    .returns<GroupMembershipRow[]>();
  if (error) {
    throw new Error(error.message);
  }
  return data
    .flatMap(({ groups }) => (groups ? [groups] : []))
    .map((group) => ({
      id: group.id,
      status: group.status ?? 'proposed',
      reasoning: group.reasoning ?? '',
      formedAt: group.formed_at,
    }))
    .sort((a, b) => (b.formedAt ?? '').localeCompare(a.formedAt ?? ''));
}

export function useMyGroups() {
  return useQuery({ queryKey: queryKeys.myGroups, queryFn: fetchMyGroups });
}
