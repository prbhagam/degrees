// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import { useQuery } from '@tanstack/react-query';
import { Text } from 'react-native';
import { Placeholder } from '@/components/Placeholder';
import { api } from '@/lib/api';

export function ProfileScreen() {
  // Proves the mock pipeline end to end: app → API server → shared-typed fixture.
  const profile = useQuery({ queryKey: ['me'], queryFn: api.getMe });
  return (
    <Placeholder
      title="Profile"
      owner="Charles"
      purpose="Your profile, interests, and preferences."
    >
      {profile.isPending ? <Text>Loading profile…</Text> : null}
      {profile.isError ? (
        <Text className="text-red-600">{profile.error.message}</Text>
      ) : null}
      {profile.data ? (
        <>
          <Text className="text-lg font-semibold">
            {profile.data.displayName}
          </Text>
          <Text>@{profile.data.username}</Text>
          <Text>{profile.data.city}</Text>
        </>
      ) : null}
    </Placeholder>
  );
}
