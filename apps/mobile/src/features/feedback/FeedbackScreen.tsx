// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Placeholder } from '@/components/Placeholder';

export function FeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Placeholder
      title="Post-event feedback"
      owner="Charles"
      purpose="Rate the hangout, say who you'd meet again, and add optional free text."
    >
      <Text className="font-mono text-sm">id: {id}</Text>
    </Placeholder>
  );
}
