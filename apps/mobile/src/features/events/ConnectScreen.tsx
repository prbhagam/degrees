// Owner: Pranav (Groups, Activities & Chat) — "my code": the person-to-person QR that forms an edge in one scan.
import { Stack, useRouter } from 'expo-router';
import { ScanLine } from 'lucide-react-native';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useMe } from '@/features/groups/queries';
import {
  Body,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Muted,
  Screen,
} from '@/features/groups/ui';
import { connectLink } from './links';

export function ConnectScreen() {
  const router = useRouter();
  const me = useMe();
  const name = me.data ? (me.data.displayName ?? me.data.username) : '';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Meet someone' }} />
      {me.isPending ? <LoadingState label="Loading your code…" /> : null}
      {me.isError ? (
        <ErrorState
          message={me.error.message}
          onRetry={() => void me.refetch()}
        />
      ) : null}
      {me.data ? (
        <>
          <Card className="items-center gap-4 py-6">
            <View className="rounded-3xl bg-white p-5">
              <QRCode value={connectLink(me.data.id, name)} size={220} />
            </View>
            <Text className="text-xl font-bold text-neutral-900 dark:text-white">
              {name}
            </Text>
            <Body className="text-center">
              Just met someone? Have them scan this. You’ll both show up as “met
              in person.”
            </Body>
          </Card>
          <Button
            label="Scan their code"
            icon={<ScanLine size={18} color="white" />}
            onPress={() => router.push('/scan')}
          />
          <Muted>
            Only people who scan in person get connected. Nobody can add you
            from afar.
          </Muted>
        </>
      ) : null}
    </Screen>
  );
}
