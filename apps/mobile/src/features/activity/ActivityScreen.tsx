// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Placeholder } from '@/components/Placeholder';

export function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Placeholder
      title="Activity"
      owner="Pranav"
      purpose="Venue, price, map, and source link for the group's plan."
    >
      <Text className="font-mono text-sm">id: {id}</Text>
    </Placeholder>
  );
}
