// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
// CHANGED Sep 26: members past 1st degree are redacted (no name, no `via`) — see degrees.ts.
// Added: Invited (status "proposed") gets a real accept/decline, and a "Mark as done" action.
import type { Activity, GroupMember } from '@degrees/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Sparkles,
  Star,
} from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { formatPrice, formatStartsAt } from '@/features/activity/format';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session';
import { firstName, memberDegreeStyle, memberDisplayName } from './degrees';
import { queryKeys, useGroup } from './queries';
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
} from '@/components/ui';

function MemberRow({ member, index }: { member: GroupMember; index: number }) {
  const style = memberDegreeStyle(member);
  const name = member.degree === 0 ? 'You' : memberDisplayName(member);
  const tone = member.degree === 0 ? 'you' : member.revealed ? 'met' : 'unmet';
  return (
    <View className="flex-row gap-3 py-2" key={member.id ?? `unrevealed-${index}`}>
      <Avatar name={name} tone={tone} locked={!member.revealed && member.degree > 0} />
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-body-semibold text-base text-ink">{name}</Text>
          {member.degree > 0 ? <DegreeBadge label={style.label} tone={tone} /> : null}
        </View>
        {!member.revealed && member.degree > 0 ? (
          <Muted>You'll see who they are once you've hung out together.</Muted>
        ) : null}
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
        <Body>Nothing planned yet. Let Degrees find a real place that fits everyone.</Body>
        <Button label="Plan something" onPress={onPress} />
      </Card>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <Heading>The plan</Heading>
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-l bg-paper">
            <MapPin size={22} color="#5B7A6B" />
          </View>
          <View className="flex-1">
            <Text className="font-body-semibold text-base text-ink">{activity.title}</Text>
            <Muted>
              {activity.venue} · {formatPrice(activity.priceCents)} ·{' '}
              {formatStartsAt(activity.startsAt)}
            </Muted>
          </View>
          <ChevronRight size={20} color="#8A8378" />
        </View>
      </Card>
    </Pressable>
  );
}

export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const group = useGroup(id);
  const queryClient = useQueryClient();
  const setActiveGroupId = useSessionStore((state) => state.setActiveGroupId);

  useEffect(() => {
    if (id) {
      setActiveGroupId(id);
    }
  }, [id, setActiveGroupId]);

  const respond = useMutation({
    mutationFn: (accept: boolean) => api.respondToGroup(id!, accept),
    onSuccess: (_, accept) => {
      if (accept) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.group(id!) });
      } else {
        router.replace('/');
      }
    },
  });

  const complete = useMutation({
    mutationFn: () => api.completeGroup(id!),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.group(id!) }),
  });

  const others = group.data?.members.filter((member) => member.degree !== 0) ?? [];
  const revealedOthers = others.filter((member) => member.revealed);
  const title =
    revealedOthers.length > 0
      ? `You + ${revealedOthers.map((m) => firstName(m.displayName ?? 'Someone')).join(', ')}${
          group.data && group.data.unrevealedCount > 0 ? ` + ${group.data.unrevealedCount} more` : ''
        }`
      : group.data && group.data.unrevealedCount > 0
        ? `You + ${group.data.unrevealedCount} new people`
        : 'Your group';

  const isInvited = group.data?.status === 'proposed';
  const isCompleted = Boolean(group.data?.completedAt);

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={group.isRefetching} onRefresh={() => void group.refetch()} />
      }
    >
      <Stack.Screen options={{ title: 'Your group' }} />
      {group.isPending ? <LoadingState label="Loading your group…" /> : null}
      {group.isError ? (
        <ErrorState message={group.error.message} onRetry={() => void group.refetch()} />
      ) : null}
      {group.data ? (
        <>
          <Text className="font-display text-2xl text-ink">{title}</Text>

          {isInvited ? (
            <Card className="border-ember">
              <Heading>New hangout suggested for you</Heading>
              <Body>Take a look — you can say no, no hard feelings.</Body>
            </Card>
          ) : null}

          {group.data.reasoning ? (
            <Card className="border-line bg-paper-raised">
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color="#5B7A6B" />
                <Heading>Why this group</Heading>
              </View>
              <Body>{group.data.reasoning}</Body>
            </Card>
          ) : null}

          <Card>
            <Heading>{`${group.data.members.length} people`}</Heading>
            {group.data.members.map((member, index) => (
              <MemberRow key={member.id ?? `unrevealed-${index}`} member={member} index={index} />
            ))}
          </Card>

          {isInvited ? (
            <View className="flex-row gap-3">
              <Button
                label="Decline"
                variant="secondary"
                className="flex-1"
                loading={respond.isPending && respond.variables === false}
                onPress={() => respond.mutate(false)}
              />
              <Button
                label="Accept"
                className="flex-1"
                loading={respond.isPending && respond.variables === true}
                onPress={() => respond.mutate(true)}
              />
            </View>
          ) : (
            <>
              <ActivityPreview
                activity={group.data.activity}
                onPress={() => router.push(`/groups/${id}/activity`)}
              />

              {isCompleted ? (
                <Card>
                  <Muted>This hangout has wrapped up. The plan above is what you did.</Muted>
                </Card>
              ) : (
                <Button
                  label="Mark hangout as done"
                  variant="ghost"
                  loading={complete.isPending}
                  onPress={() => complete.mutate()}
                />
              )}

              <View className="gap-3">
                <Button
                  label="Group chat"
                  icon={<MessageCircle size={18} color="#F7F3EC" />}
                  onPress={() => router.push(`/groups/${id}/chat`)}
                />
                <Button
                  label="Photos"
                  variant="secondary"
                  icon={<ImageIcon size={18} color="#20201C" />}
                  onPress={() => router.push(`/groups/${id}/photos`)}
                />
                <Button
                  label="How did it go?"
                  variant="secondary"
                  icon={<Star size={18} color="#20201C" />}
                  onPress={() => router.push(`/groups/${id}/feedback`)}
                />
              </View>
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
