// Owner: Pranav (Groups, Activities & Chat) — the home hub: your groups, meet someone, join an event, find a group.
// Charles agreed to this living here; auth gating (redirect to /login) belongs in his scaffold.
// CHANGED Sep 26: restyled to ember/paper; added Notifications + Host a hangout entry points.
import { Link, Stack, useRouter, type Href } from 'expo-router';
import { Bell, CalendarPlus, ChevronRight, Plus, QrCode, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useMyGroups, type GroupSummary } from '@/features/groups/queries';
import { Button, Card, Heading, Muted, Screen } from '@/components/ui';

const STATUS_LABEL: Record<GroupSummary['status'], string> = {
  proposed: 'New match — needs your reply',
  confirmed: 'Plans on',
  completed: 'Done — leave feedback',
};

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-l bg-paper">{icon}</View>
        <View className="flex-1">
          <Text className="font-body-semibold text-base text-ink">{title}</Text>
          <Muted>{subtitle}</Muted>
        </View>
        <ChevronRight size={20} color="#8A8378" />
      </Card>
    </Pressable>
  );
}

// Charles's screens plus the new Sep 26 additions, reachable until real nav entry points exist for all of them.
const DEV_LINKS: { href: Href; label: string }[] = [
  { href: '/login', label: 'Log in' },
  { href: '/signup', label: 'Sign up' },
  { href: '/onboarding/interests', label: 'Onboarding: interests' },
  { href: '/onboarding/about', label: 'Onboarding: about you' },
  { href: '/onboarding/preferences', label: 'Onboarding: preferences' },
  { href: '/profile/edit', label: 'Edit profile' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/create-event', label: 'Host a hangout' },
];

export function HomeScreen() {
  const router = useRouter();
  const groups = useMyGroups();
  const ink = '#20201C';

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={groups.isRefetching} onRefresh={() => void groups.refetch()} />}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <View className="flex-row items-center gap-4 pr-4">
              <Pressable accessibilityLabel="Notifications" onPress={() => router.push('/notifications')}>
                <Bell size={20} color={ink} />
              </Pressable>
              <Pressable accessibilityLabel="Host a hangout" onPress={() => router.push('/create-event')}>
                <Plus size={22} color={ink} />
              </Pressable>
            </View>
          ),
        }}
      />

      <View className="gap-3">
        <Heading>Your groups</Heading>
        {groups.isError ? <Muted>{groups.error.message}</Muted> : null}
        {groups.data?.map((group) => (
          <Pressable key={group.id} accessibilityRole="button" onPress={() => router.push(`/groups/${group.id}`)}>
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="font-body-semibold text-sm text-sage">{STATUS_LABEL[group.status]}</Text>
                <ChevronRight size={18} color="#8A8378" />
              </View>
              <Text numberOfLines={2} className="font-body text-base text-ink">
                {group.reasoning || "Open to see who's in it."}
              </Text>
            </Card>
          </Pressable>
        ))}
        {groups.data?.length === 0 ? <Muted>No groups yet. Meet a few people, then find your first group.</Muted> : null}
        <Button label="Find my group" icon={<Users size={18} color="#F7F3EC" />} onPress={() => router.push('/match')} />
      </View>

      <View className="gap-3">
        <Heading>Grow your circle</Heading>
        <ActionRow
          icon={<QrCode size={22} color={ink} />}
          title="Meet someone"
          subtitle="Show your code or scan theirs"
          onPress={() => router.push('/connect')}
        />
        <ActionRow
          icon={<CalendarPlus size={22} color={ink} />}
          title="Join an event"
          subtitle="Enter a room code or scan the event QR"
          onPress={() => router.push('/join')}
        />
      </View>

      {__DEV__ ? (
        <View className="gap-2 pt-4">
          <Heading>Developer</Heading>
          {DEV_LINKS.map(({ href, label }) => (
            <Link key={label} href={href} className="font-body text-base text-ember-ink">
              {label}
            </Link>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
