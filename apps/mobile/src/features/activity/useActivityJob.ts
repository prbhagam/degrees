// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26 (wave 2, Sahith).
// Drives a plan job to completion. The server can't run the whole AI chain inside one 10-second function (legacy
// Netlify plan, no Background Functions), so POST /activity only starts a job and each POST /activity/advance
// runs one stage. While the group's plan is 'generating' this keeps calling advance, one call at a time, and
// writes each answer into the group query so every screen updates without a refetch. The driver is module-level
// (one per group, independent of which screen is mounted) so navigating between the group and plan screens
// never stalls it; if the app is closed mid-job the row stays 'generating' and the next mount resumes it.
import type { ActivityJobResponse, GroupResponse } from '@degrees/shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { queryKeys } from '@/features/groups/queries';
import { api } from '@/lib/api';

// Breather between stages (each advance itself takes up to ~8s server-side).
const STEP_DELAY_MS = 400;
// A concurrent advance (another device) answers "still generating" fast; wait before re-asking.
const BUSY_DELAY_MS = 1_500;
const MAX_CONSECUTIVE_ERRORS = 3;
const ERROR_DELAY_MS = 2_500;

type DriverState = 'running' | 'stalled';
const drivers = new Map<string, DriverState>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function apply(queryClient: QueryClient, groupId: string, result: ActivityJobResponse): void {
  queryClient.setQueryData<GroupResponse>(queryKeys.group(groupId), (previous) =>
    previous
      ? { ...previous, activityStatus: result.status, activity: result.activity ?? previous.activity }
      : previous,
  );
}

function ensureDriver(queryClient: QueryClient, groupId: string): void {
  if (drivers.get(groupId) === 'running') return;
  drivers.set(groupId, 'running');
  notify();
  void (async () => {
    let errors = 0;
    let lastStage: string | null = null;
    for (;;) {
      try {
        const result = await api.advanceActivity(groupId);
        errors = 0;
        apply(queryClient, groupId, result);
        if (result.status !== 'generating') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
          drivers.delete(groupId);
          break;
        }
        const moved = result.stage !== lastStage;
        lastStage = result.stage;
        await sleep(moved ? STEP_DELAY_MS : BUSY_DELAY_MS);
      } catch (error) {
        errors += 1;
        if (__DEV__) console.warn('[activity] advance failed', error);
        if (errors >= MAX_CONSECUTIVE_ERRORS) {
          drivers.set(groupId, 'stalled');
          break;
        }
        await sleep(ERROR_DELAY_MS);
      }
    }
    notify();
  })();
}

export function useActivityJob(groupId: string | undefined, generating: boolean) {
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(subscribe, () => (groupId ? (drivers.get(groupId) ?? null) : null));

  useEffect(() => {
    if (groupId && generating && drivers.get(groupId) !== 'stalled') {
      ensureDriver(queryClient, groupId);
    }
  }, [groupId, generating, queryClient]);

  return {
    stalled: state === 'stalled',
    retry: () => {
      if (!groupId) return;
      drivers.delete(groupId);
      ensureDriver(queryClient, groupId);
    },
  };
}
