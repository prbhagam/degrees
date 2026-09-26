// Owner: Pranav (Groups, Activities & Chat) — "my code": the person-to-person QR that forms an edge in one scan.
// CHANGED Sep 26: a connection must be tied to a shared event — this no longer shows a code at all
// until the person has joined one (see stores/session.ts `activeEvent`, set by JoinRoomScreen).
import { Stack, useRouter } from 'expo-router';
import { ScanLine } from 'lucide-react-native';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useMe } from '@/features/groups/queries';
import { useSessionStore } from '@/stores/session';
import {
  Body,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Muted,
  Screen,
} from '@/components/ui';
import { connectLink } from './links';

export function ConnectScreen() {
  const router = useRouter();
  const me = useMe();
  const activeEvent = useSessionStore((state) => state.activeEvent);
  const name = me.data ? (me.data.displayName ?? me.data.username) : '';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Meet someone' }} />
      {me.isPending ? <LoadingState label="Loading your code…" /> : null}
      {me.isError ? <ErrorState message={me.error.message} onRetry={() => void me.refetch()} /> : null}
      {me.data && !activeEvent ? (
        <Card className="items-center gap-3 py-8">
          <Text className="font-body-semibold text-lg text-ink">Join an event first</Text>
          <Body className="text-center">
            Connections are tied to the hangout you're both at — join with a room code, then come
            back here.
          </Body>
          <Button label="Join an event" onPress={() => router.push('/join')} />
        </Card>
      ) : null}
      {me.data && activeEvent ? (
        <>
          <Card className="items-center gap-4 py-6">
            <View className="rounded-l bg-paper-raised p-5">
              <QRCode value={connectLink(me.data.id, name, activeEvent)} size={220} />
            </View>
            <Text className="font-display text-xl text-ink">{name}</Text>
            <Muted>At {activeEvent.name}</Muted>
            <Body className="text-center">
              Just met someone here? Have them scan this. You'll both show up as "met in person."
            </Body>
          </Card>
          <Button
            label="Scan their code"
            icon={<ScanLine size={18} color="#F7F3EC" />}
            onPress={() => router.push('/scan')}
          />
          <Muted>Only people who scan in person get connected. Nobody can add you from afar.</Muted>
        </>
      ) : null}
    </Screen>
  );
}
