// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import { Stack, useRouter } from 'expo-router';
import { ScanLine } from 'lucide-react-native';
import { useState } from 'react';
import { TextInput } from 'react-native';
import {
  Body,
  Button,
  Card,
  Heading,
  Muted,
  Screen,
} from '@/features/groups/ui';

export function JoinScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const roomCode = code.trim().toUpperCase();
  const valid = /^[A-Z0-9]{3,16}$/.test(roomCode);

  const join = () => {
    if (valid) {
      router.push({ pathname: '/join/[roomCode]', params: { roomCode } });
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Join an event' }} />
      <Card>
        <Heading>Room code</Heading>
        <Body>Enter the code shown at your event to see who’s here.</Body>
        <TextInput
          value={code}
          onChangeText={setCode}
          onSubmitEditing={join}
          placeholder="HACKGT"
          placeholderTextColor="#a3a3a3"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          maxLength={16}
          className="rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-center text-2xl font-bold tracking-[6px] text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <Button label="Join" disabled={!valid} onPress={join} />
      </Card>
      <Button
        label="Scan a QR code"
        variant="secondary"
        icon={<ScanLine size={18} color="#737373" />}
        onPress={() => router.push('/scan')}
      />
      <Muted>Joining is instant. You can finish your profile later.</Muted>
    </Screen>
  );
}
