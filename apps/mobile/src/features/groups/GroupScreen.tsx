// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import type { Activity, GroupMember } from '@degrees/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronRight,
  MapPin,
  MessageCircle,
  Sparkles,
  Star,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { formatPrice, formatStartsAt } from '@/features/activity/format';
import { useSessionStore } from '@/stores/session';
import { firstName, pathSentence } from './degrees';
import { useGroup } from './queries';
import {
  Avatar,
  Body,
  Button,
  Card,
  Chip,
  DegreeBadge,
  ErrorState,
  Heading,
  LoadingState,
  Muted,
  Screen,
} from './ui';

function MemberRow({ member }: { member: GroupMember }) {
  const path = pathSentence(member);
  return (
    <View className="flex-row gap-3 py-2">
      <Avatar name={member.displayName} degree={member.degree} />
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-base font-semibold text-neutral-900 dark:text-white">
            {member.degree === 0 ? 'You' : member.displayName}
          </Text>
          {member.degree > 0 ? <DegreeBadge degree={member.degree} /> : null}
        </View>
        {path ? <Muted>{path}</Muted> : null}
        {member.sharedInterests.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5 pt-1">
            {member.sharedInterests.map((interest) => (
              <Chip key={interest} label={interest} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ActivityPreview({
  activity,
  onPress,
}: {
  activity: Activity | null;
  onPress: () => void;
}) {
  if (!activity) {
    return (
      <Card>
        <Heading>The plan</Heading>
        <Body>
          Nothing planned yet. Let Degrees find a real place that fits everyone.
        </Body>
        <Button label="Plan something" onPress={onPress} />
      </Card>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <Heading>The plan</Heading>
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950">
            <MapPin size={22} color="#7c3aed" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-neutral-900 dark:text-white">
              {activity.title}
            </Text>
            <Muted>
              {activity.venue} · {formatPrice(activity.priceCents)} ·{' '}
              {formatStartsAt(activity.startsAt)}
            </Muted>
          </View>
          <ChevronRight size={20} color="#a3a3a3" />
        </View>
      </Card>
    </Pressable>
  );
}

export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const group = useGroup(id);
  const setActiveGroupId = useSessionStore((state) => state.setActiveGroupId);

  useEffect(() => {
    if (id) {
      setActiveGroupId(id);
    }
  }, [id, setActiveGroupId]);

  const others =
    group.data?.members.filter((member) => member.degree !== 0) ?? [];
  const title =
    others.length > 0
      ? `You + ${others.map(({ displayName }) => firstName(displayName)).join(', ')}`
      : 'Your group';

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={group.isRefetching}
          onRefresh={() => void group.refetch()}
        />
      }
    >
      <Stack.Screen options={{ title: 'Your group' }} />
      {group.isPending ? <LoadingState label="Loading your group…" /> : null}
      {group.isError ? (
        <ErrorState
          message={group.error.message}
          onRetry={() => void group.refetch()}
        />
      ) : null}
      {group.data ? (
        <>
          <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
            {title}
          </Text>

          {group.data.reasoning ? (
            <Card className="border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40">
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color="#7c3aed" />
                <Heading>Why this group</Heading>
              </View>
              <Body>{group.data.reasoning}</Body>
            </Card>
          ) : null}

          <Card>
            <Heading>{`${group.data.members.length} people`}</Heading>
            {group.data.members.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </Card>

          <ActivityPreview
            activity={group.data.activity}
            onPress={() => router.push(`/groups/${id}/activity`)}
          />

          <View className="gap-3">
            <Button
              label="Group chat"
              icon={<MessageCircle size={18} color="white" />}
              onPress={() => router.push(`/groups/${id}/chat`)}
            />
            <Button
              label="How did it go?"
              variant="secondary"
              icon={<Star size={18} color="#737373" />}
              onPress={() => router.push(`/groups/${id}/feedback`)}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
