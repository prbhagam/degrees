// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Placeholder } from '@/components/Placeholder';
import { api } from '@/lib/api';

export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useQuery({
    queryKey: ['group', id],
    queryFn: () => api.getGroup(id),
  });
  return (
    <Placeholder
      title="Your group"
      owner="Pranav"
      purpose="Members, the degrees path, and Gemini's reasoning."
    >
      {group.isPending ? <Text>Loading group…</Text> : null}
      {group.isError ? (
        <Text className="text-red-600">{group.error.message}</Text>
      ) : null}
      {group.data ? (
        <>
          <Text className="italic">{group.data.reasoning}</Text>
          {group.data.members.map((member) => (
            <Text key={member.id}>
              {member.displayName} · degree {member.degree}
            </Text>
          ))}
        </>
      ) : null}
    </Placeholder>
  );
}
