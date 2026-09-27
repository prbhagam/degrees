// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
// CHANGED Sep 26 (wave 3): you are "Degree 0" — the app's own vocabulary, used everywhere from here out.
import { Stack, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import {
  Avatar,
  Body,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Muted,
  Screen,
  SectionRow,
} from '@/components/ui';
import { api } from '@/lib/api';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';
import { useMe } from '@/features/groups/queries';
import { usePullToRefresh } from '@/lib/query';
import { useSessionStore } from '@/stores/session';

export function ProfileScreen() {
  const router = useRouter();
  const me = useMe();
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);
  const pull = usePullToRefresh(me.refetch);

  async function logout() {
    if (!isSupabaseEnvironmentUnset()) {
      await getSupabaseClient().auth.signOut();
    }
    setCurrentUser(null);
    // Collapse whatever was pushed so login is the only screen left (wave 2: no swipe-back into the app).
    if (router.canDismiss()) router.dismissAll();
    router.replace('/login');
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}>
      <Stack.Screen options={{ title: 'Degree 0 (You)' }} />
      {me.isPending ? <LoadingState label="Loading profile…" /> : null}
      {me.isError ? <ErrorState message={me.error.message} onRetry={() => void me.refetch()} /> : null}
      {me.data ? (
        <>
          <View className="flex-row items-center gap-3.5">
            <Avatar name={me.data.displayName ?? me.data.username} photoUrl={me.data.photoUrl} size="lg" tone="you" />
            <View className="flex-1">
              <Text className="font-body-semibold text-lg text-ink">
                {me.data.displayName ?? me.data.username}
              </Text>
              <Muted>@{me.data.username}</Muted>
              <Muted>You're degree 0. People you've met are your 1st degree; their friends are your 2nd.</Muted>
            </View>
          </View>

          {me.data.bio ? (
            <Card>
              <Body>{me.data.bio}</Body>
            </Card>
          ) : null}

          <Pressable onPress={() => router.push({ pathname: '/onboarding/preferences', params: { mode: 'settings' } })}>
            <Card className="p-0">
              <SectionRow
                title="Degrees & preferences"
                subtitle={
                  me.data.preferences
                    ? `Reaching up to ${me.data.preferences.maxDegrees === 1 ? '1st' : me.data.preferences.maxDegrees === 2 ? '2nd' : '3rd'} degree · group size, distance, frequency`
                    : 'How far out we reach, group size, distance, frequency'
                }
                right={<ChevronRight size={18} color="#8A8378" />}
              />
            </Card>
          </Pressable>

          <Card className="p-0">
            <SectionRow
              title="Edit profile"
              subtitle="Name, bio, interests, rather-skips, home base"
              onPress={() => router.push('/profile/edit')}
              right={<ChevronRight size={18} color="#8A8378" />}
            />
          </Card>

          <Button label="Log out" variant="ghost" onPress={() => void logout()} />
        </>
      ) : null}
    </Screen>
  );
}
