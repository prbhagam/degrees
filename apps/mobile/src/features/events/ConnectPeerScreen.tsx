// Owner: Pranav (Groups, Activities & Chat) — target of a scanned person QR (degrees://connect/<id>): forms the edge.
import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Handshake } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { useMe } from '@/features/groups/queries';
import {
  Avatar,
  Body,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import { api } from '@/lib/api';

export function ConnectPeerScreen() {
  const { peerId, name, eventId, eventName } = useLocalSearchParams<{
    peerId: string;
    name?: string;
    eventId?: string;
    eventName?: string;
  }>();
  const router = useRouter();
  const me = useMe();
  const peerName = name?.trim() || 'your new friend';
  const isSelf = Boolean(me.data && me.data.id === peerId);
  // CHANGED Sep 26: a scanned code with no event embedded (an old/stale link) can't form a
  // connection — the design requires every edge to carry which hangout it came from.
  const missingEvent = !eventId;

  const connect = useMutation({
    mutationFn: () => api.createConnection({ peerId, context: 'qr', eventId }),
  });

  // Fire once per screen: a later `me` refetch must not re-send and flip the result to "already connected".
  const fired = useRef(false);
  const { mutate } = connect;
  const ready = Boolean(me.data) && !isSelf && !missingEvent;
  useEffect(() => {
    if (ready && !fired.current) {
      fired.current = true;
      mutate();
    }
  }, [ready, mutate]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Connect' }} />
      {isSelf ? (
        <ErrorState message="That’s your own code. Have a friend scan it instead." />
      ) : null}
      {!isSelf && missingEvent ? (
        <ErrorState message="This code doesn't say which event you're both at — ask them to open their code fresh from an event they've joined." />
      ) : null}
      {me.isPending || connect.isPending ? (
        <LoadingState label={`Connecting with ${peerName}…`} />
      ) : null}
      {me.isError ? <ErrorState message={me.error.message} /> : null}
      {connect.isError ? (
        <ErrorState
          message={connect.error.message}
          onRetry={() => connect.mutate()}
        />
      ) : null}
      {connect.data ? (
        <>
          <Card className="items-center gap-4 py-8">
            <View className="flex-row items-center gap-3">
              <Avatar name={me.data?.displayName ?? 'You'} tone="you" size="lg" />
              <Handshake size={28} color="#5B7A6B" />
              <Avatar name={peerName} tone="met" size="lg" />
            </View>
            <Text className="text-center font-display text-2xl text-ink">
              {connect.data.edgeCreated
                ? `You and ${peerName} are connected`
                : `You and ${peerName} were already connected`}
            </Text>
            <Body className="text-center">
              {eventName ? `Met at ${eventName}. ` : ''}You're each other's 1st degree now — and their
              1st degree just became your 2nd.
            </Body>
          </Card>
          <Button
            label="Find my group"
            onPress={() => router.replace('/match')}
          />
          <Button
            label="Meet someone else"
            variant="secondary"
            onPress={() => router.replace('/connect')}
          />
        </>
      ) : null}
    </Screen>
  );
}
