// Owner: Pranav (Groups, Activities & Chat) — the home hub: your groups, meet someone, join an event, find a group.
// Charles agreed to this living here; auth gating (redirect to /login) belongs in his scaffold.
import { Link, useRouter, type Href } from 'expo-router';
import { CalendarPlus, ChevronRight, QrCode, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useMyGroups, type GroupSummary } from '@/features/groups/queries';
import { Button, Card, Heading, Muted, Screen } from '@/features/groups/ui';

const STATUS_LABEL: Record<GroupSummary['status'], string> = {
  proposed: 'New match',
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
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950">
          {icon}
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-neutral-900 dark:text-white">
            {title}
          </Text>
          <Muted>{subtitle}</Muted>
        </View>
        <ChevronRight size={20} color="#a3a3a3" />
      </Card>
    </Pressable>
  );
}

// Charles's screens, reachable until the real navigation for them exists.
const DEV_LINKS: { href: Href; label: string }[] = [
  { href: '/login', label: 'Log in' },
  { href: '/signup', label: 'Sign up' },
  { href: '/onboarding/interests', label: 'Onboarding: interests' },
  { href: '/onboarding/preferences', label: 'Onboarding: preferences' },
  { href: '/profile', label: 'Profile' },
];

export function HomeScreen() {
  const router = useRouter();
  const groups = useMyGroups();
  const violet = '#7c3aed';

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={groups.isRefetching}
          onRefresh={() => void groups.refetch()}
        />
      }
    >
      <View className="gap-3">
        <Heading>Your groups</Heading>
        {groups.isError ? <Muted>{groups.error.message}</Muted> : null}
        {groups.data?.map((group) => (
          <Pressable
            key={group.id}
            accessibilityRole="button"
            onPress={() => router.push(`/groups/${group.id}`)}
          >
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                  {STATUS_LABEL[group.status]}
                </Text>
                <ChevronRight size={18} color="#a3a3a3" />
              </View>
              <Text
                numberOfLines={2}
                className="text-base text-neutral-800 dark:text-neutral-200"
              >
                {group.reasoning || 'Open to see who’s in it.'}
              </Text>
            </Card>
          </Pressable>
        ))}
        {groups.data?.length === 0 ? (
          <Muted>
            No groups yet. Meet a few people, then find your first group.
          </Muted>
        ) : null}
        <Button
          label="Find my group"
          icon={<Users size={18} color="white" />}
          onPress={() => router.push('/match')}
        />
      </View>

      <View className="gap-3">
        <Heading>Grow your graph</Heading>
        <ActionRow
          icon={<QrCode size={22} color={violet} />}
          title="Meet someone"
          subtitle="Show your code or scan theirs"
          onPress={() => router.push('/connect')}
        />
        <ActionRow
          icon={<CalendarPlus size={22} color={violet} />}
          title="Join an event"
          subtitle="Enter a room code or scan the event QR"
          onPress={() => router.push('/join')}
        />
      </View>

      {__DEV__ ? (
        <View className="gap-2 pt-4">
          <Heading>Developer</Heading>
          {DEV_LINKS.map(({ href, label }) => (
            <Link key={label} href={href} className="text-base text-violet-600">
              {label}
            </Link>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
