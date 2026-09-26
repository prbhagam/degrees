// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import type { CreateConnectionResponse } from '@degrees/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, QrCode, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useMe } from '@/features/groups/queries';
import { useSessionStore } from '@/stores/session';
import {
  Avatar,
  Body,
  Button,
  Card,
  ErrorState,
  Heading,
  LoadingState,
  Muted,
  Screen,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { joinLink } from './links';

function AttendeeRow({
  attendee,
  eventId,
}: {
  attendee: { id: string; displayName: string };
  eventId: string;
}) {
  const [result, setResult] = useState<CreateConnectionResponse | null>(null);
  const connect = useMutation({
    mutationFn: () =>
      api.createConnection({ peerId: attendee.id, context: 'event', eventId }),
    onSuccess: setResult,
  });

  return (
    <View className="flex-row items-center gap-3 py-1.5">
      <Avatar name={attendee.displayName} tone={result ? 'met' : 'unmet'} size="sm" />
      <Text className="flex-1 font-body text-base text-ink">{attendee.displayName}</Text>
      {result ? (
        <View className="flex-row items-center gap-1">
          <Check size={16} color="#5B7A6B" />
          <Text className="font-body-medium text-sm text-sage">
            {result.edgeCreated ? 'Connected' : 'Already met'}
          </Text>
        </View>
      ) : (
        <Button
          label="We met"
          variant="secondary"
          className="min-h-9 py-1.5"
          loading={connect.isPending}
          onPress={() => connect.mutate()}
        />
      )}
    </View>
  );
}

export function JoinRoomScreen() {
  const { roomCode: rawCode } = useLocalSearchParams<{ roomCode: string }>();
  const roomCode = (rawCode ?? '').toUpperCase();
  const router = useRouter();
  const me = useMe();
  const [showQr, setShowQr] = useState(false);

  // Joining is idempotent server-side, so a query (with its retries and refetch) is safe here.
  const event = useQuery({
    queryKey: ['event', roomCode],
    queryFn: () => api.joinEvent(roomCode),
    enabled: roomCode.length > 0,
    staleTime: 15_000,
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status === 404) && failures < 2,
  });

  const others =
    event.data?.attendees.filter(({ id }) => id !== me.data?.id) ?? [];

  const setActiveEvent = useSessionStore((state) => state.setActiveEvent);
  useEffect(() => {
    if (event.data) {
      setActiveEvent({ id: event.data.eventId, name: event.data.name });
    }
  }, [event.data, setActiveEvent]);

  return (
    <Screen>
      <Stack.Screen options={{ title: event.data?.name ?? 'Joining event' }} />
      {event.isPending ? <LoadingState label={`Joining ${roomCode}…`} /> : null}
      {event.isError ? (
        <ErrorState
          message={
            event.error instanceof ApiError && event.error.status === 404
              ? `No event uses the code ${roomCode}. Check the code and try again.`
              : event.error.message
          }
          onRetry={() => router.replace('/join')}
        />
      ) : null}

      {event.data ? (
        <>
          <Card className="items-center border-line bg-paper-raised">
            <Check size={28} color="#5B7A6B" />
            <Text className="font-display text-xl text-ink">You're in</Text>
            <Body className="text-center">
              Tap "We met" for anyone you've actually talked to. That's what
              Degrees matches from.
            </Body>
          </Card>

          <Card>
            <View className="flex-row items-center gap-2">
              <Users size={16} color="#8A8378" />
              <Heading>{`Here now · ${others.length}`}</Heading>
            </View>
            {others.length === 0 ? (
              <Muted>Nobody else yet. Share the code so people can join.</Muted>
            ) : (
              others.map((attendee) => (
                <AttendeeRow
                  key={attendee.id}
                  attendee={attendee}
                  eventId={event.data.eventId}
                />
              ))
            )}
          </Card>

          <Card className="items-center">
            {showQr ? (
              <>
                <View className="rounded-l bg-paper-raised p-4">
                  <QRCode value={joinLink(roomCode)} size={200} />
                </View>
                <Text className="font-display text-2xl tracking-[6px] text-ink">{roomCode}</Text>
                <Muted>Scan with the iPhone camera or in Degrees.</Muted>
              </>
            ) : null}
            <Button
              label={showQr ? 'Hide code' : 'Invite people with a QR code'}
              variant="ghost"
              icon={<QrCode size={16} color="#20201C" />}
              onPress={() => setShowQr((value) => !value)}
            />
          </Card>

          <Button label="Find my group" onPress={() => router.push('/match')} />
        </>
      ) : null}
    </Screen>
  );
}
