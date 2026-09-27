// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
// CHANGED Sep 26 (wave 3): you are "Degree 0" — the app's own vocabulary, used everywhere from here out.
import { Stack, useRouter } from 'expo-router';
import { ChevronRight, QrCode } from 'lucide-react-native';
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
import { useSessionStore } from '@/stores/session';

export function ProfileScreen() {
  const router = useRouter();
  const me = useMe();
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);

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
    <Screen refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={() => void me.refetch()} />}>
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
              <Muted>@{me.data.username} · Degree 0</Muted>
              <Muted>Every degree in Degrees is measured from you.</Muted>
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

          <Pressable onPress={() => router.push('/connect')}>
            <Card className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-m border border-line bg-paper">
                <QrCode size={18} color="#20201C" />
              </View>
              <View className="flex-1">
                <Text className="font-body-semibold text-[15px] text-ink">My QR code</Text>
                <Muted>Scan in person — they become your 1st degree</Muted>
              </View>
            </Card>
          </Pressable>

          <Card className="p-0">
            <SectionRow
              title="1st-degree friends"
              subtitle="Everyone you've met in person — and where numbers get exchanged"
              onPress={() => router.push('/circle')}
              right={<ChevronRight size={18} color="#8A8378" />}
            />
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
