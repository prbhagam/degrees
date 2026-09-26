// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
// CHANGED Sep 26 (wave 2): a meetup is a group now, so this screen only joins (idempotent) and hands off to
// groups/[id], where the lobby (attendees + "We met"), code/QR, icebreakers, chat, plan, photos, and "End meetup"
// all live. Expired or ended codes (410) explain themselves instead of spinning.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { queryKeys } from '@/features/groups/queries';
import { useSessionStore } from '@/stores/session';
import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export function JoinRoomScreen() {
  const { roomCode: rawCode } = useLocalSearchParams<{ roomCode: string }>();
  const roomCode = (rawCode ?? '').toUpperCase();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveEvent = useSessionStore((state) => state.setActiveEvent);

  // Joining is idempotent server-side, so a query (with its retries and refetch) is safe here.
  const join = useQuery({
    queryKey: ['event', roomCode],
    queryFn: () => api.joinEvent(roomCode),
    enabled: roomCode.length > 0,
    staleTime: 15_000,
    retry: (failures, error) =>
      !(error instanceof ApiError && (error.status === 404 || error.status === 410)) && failures < 2,
  });

  useEffect(() => {
    if (join.data) {
      setActiveEvent({ id: join.data.eventId, name: join.data.name, groupId: join.data.groupId });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hangouts });
      router.replace(`/groups/${join.data.groupId}`);
    }
  }, [join.data, queryClient, router, setActiveEvent]);

  const message = (() => {
    if (!join.isError) return null;
    if (join.error instanceof ApiError && join.error.status === 404) {
      return `No meetup uses the code ${roomCode}. Check the code and try again.`;
    }
    if (join.error instanceof ApiError && join.error.status === 410) {
      return `The code ${roomCode} has expired or the meetup has ended. Ask the host to start a new one.`;
    }
    return join.error.message;
  })();

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Joining meetup' }} />
      {join.isPending || join.data ? <LoadingState label={`Joining ${roomCode}…`} /> : null}
      {message ? <ErrorState message={message} onRetry={() => router.replace('/join')} /> : null}
    </Screen>
  );
}
