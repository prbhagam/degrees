// Owner: Pranav (Groups, Activities & Chat) — one scanner for both QR types: event room codes and people.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Screen } from '@/components/ui';
import { useSessionStore } from '@/stores/session';
import { parseScan } from './links';

const FRAME = 260;

export function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [unrecognized, setUnrecognized] = useState(false);
  const activeEvent = useSessionStore((state) => state.activeEvent);
  // The camera fires many callbacks per second; act on the first good code only.
  const handled = useRef(false);

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Scan a code' }} />
        <Card>
          <Body>
            Degrees uses the camera to scan event codes and the codes on your
            friends’ phones.
          </Body>
          {permission.canAskAgain ? (
            <Button
              label="Allow camera"
              onPress={() => void requestPermission()}
            />
          ) : (
            <Body>
              Camera access is off. Turn it on for Expo Go in Settings, then
              come back.
            </Body>
          )}
          <Button
            label="Type a room code instead"
            variant="ghost"
            onPress={() => router.replace('/join')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ title: 'Scan a code' }} />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (handled.current) {
            return;
          }
          const target = parseScan(data);
          if (!target) {
            setUnrecognized(true);
            return;
          }
          handled.current = true;
          if (target.kind === 'join') {
            router.replace({
              pathname: '/join/[roomCode]',
              params: { roomCode: target.roomCode },
            });
          } else {
            // Every edge must carry the event both people are at. Prefer the one embedded in their
            // code; if it has none, you're scanning them in person, so the event you joined is it.
            const event = target.eventId
              ? { id: target.eventId, name: target.eventName }
              : activeEvent
                ? { id: activeEvent.id, name: activeEvent.name }
                : null;
            router.replace({
              pathname: '/connect/[peerId]',
              params: {
                peerId: target.peerId,
                ...(target.name ? { name: target.name } : {}),
                ...(event ? { eventId: event.id } : {}),
                ...(event?.name ? { eventName: event.name } : {}),
              },
            });
          }
        }}
      />
      <View
        pointerEvents="none"
        className="absolute inset-0 items-center justify-center"
      >
        <View
          style={{ width: FRAME, height: FRAME }}
          className="rounded-3xl border-4 border-white/90"
        />
        <Text className="mt-6 px-8 text-center text-base font-medium text-white">
          {unrecognized
            ? 'That isn’t a Degrees code. Try a friend’s code or an event code.'
            : 'Point at a friend’s code or an event code'}
        </Text>
      </View>
    </View>
  );
}
