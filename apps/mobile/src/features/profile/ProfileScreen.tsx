// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
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
      <Stack.Screen options={{ title: 'Profile' }} />
      {me.isPending ? <LoadingState label="Loading profile…" /> : null}
      {me.isError ? <ErrorState message={me.error.message} onRetry={() => void me.refetch()} /> : null}
      {me.data ? (
        <>
          <View className="flex-row items-center gap-3.5">
            <Avatar name={me.data.displayName ?? me.data.username} photoUrl={me.data.photoUrl} size="lg" tone="you" />
            <View>
              <Text className="font-body-semibold text-lg text-ink">
                {me.data.displayName ?? me.data.username}
              </Text>
              <Muted>@{me.data.username}</Muted>
            </View>
          </View>

          {me.data.bio ? (
            <Card>
              <Body>{me.data.bio}</Body>
            </Card>
          ) : null}

          <Pressable onPress={() => router.push('/onboarding/preferences')}>
            <Card className="p-0">
              <SectionRow
                title="Degrees & preferences"
                subtitle="Reach, group size, distance, frequency"
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
                <Muted>Scan in person to connect</Muted>
              </View>
            </Card>
          </Pressable>

          <Card className="p-0">
            <SectionRow
              title="Your circle"
              subtitle="People you've met in person"
              onPress={() => router.push('/circle')}
              right={<ChevronRight size={18} color="#8A8378" />}
            />
            <SectionRow
              title="Edit profile"
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
