// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Placeholder } from '@/components/Placeholder';

export function JoinRoomScreen() {
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  return (
    <Placeholder
      title="Joining event"
      owner="Pranav"
      purpose="Deep-link target (degrees://join/CODE): joins the event, then offers connections."
    >
      <Text className="font-mono text-sm">roomCode: {roomCode}</Text>
    </Placeholder>
  );
}
