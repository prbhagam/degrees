// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Placeholder } from '@/components/Placeholder';

export function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Placeholder
      title="Group chat"
      owner="Pranav"
      purpose="Message list, composer, and a Supabase Realtime subscription."
    >
      <Text className="font-mono text-sm">id: {id}</Text>
    </Placeholder>
  );
}
