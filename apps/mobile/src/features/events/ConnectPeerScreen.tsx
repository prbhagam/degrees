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
} from '@/features/groups/ui';
import { api } from '@/lib/api';

export function ConnectPeerScreen() {
  const { peerId, name } = useLocalSearchParams<{
    peerId: string;
    name?: string;
  }>();
  const router = useRouter();
  const me = useMe();
  const peerName = name?.trim() || 'your new friend';
  const isSelf = Boolean(me.data && me.data.id === peerId);

  const connect = useMutation({
    mutationFn: () => api.createConnection({ peerId, context: 'qr' }),
  });

  // Fire once per screen: a later `me` refetch must not re-send and flip the result to "already connected".
  const fired = useRef(false);
  const { mutate } = connect;
  const ready = Boolean(me.data) && !isSelf;
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
              <Avatar
                name={me.data?.displayName ?? 'You'}
                degree={0}
                size="lg"
              />
              <Handshake size={28} color="#059669" />
              <Avatar name={peerName} degree={1} size="lg" />
            </View>
            <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
              {connect.data.edgeCreated
                ? `You and ${peerName} are connected`
                : `You and ${peerName} were already connected`}
            </Text>
            <Body className="text-center">
              Their friends are now two degrees from you. The more people you
              meet, the better your groups get.
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
