// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
// CHANGED Sep 26: members past 1st degree are redacted (no name, no `via`) — see degrees.ts.
// CHANGED Sep 26 (wave 2): one screen for both kinds. A meetup shows its room code + QR, everyone present with a
// per-person "We met" (hidden once an edge exists), icebreakers, and "End meetup" (which connects everyone).
// A matched group keeps accept/decline; once confirmed it gets the same per-person "We met" — completing a
// matched group no longer connects people by itself. Both get "Leave" until they wrap up.
import type { Activity, GroupMember } from '@degrees/shared';
import { format, parseISO } from 'date-fns';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Image as ImageIcon,
  LogOut,
  MapPin,
  MessageCircle,
  QrCode,
  RefreshCw,
  Sparkles,
  Star,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { formatPrice, formatStartsAt } from '@/features/activity/format';
import { useActivityJob } from '@/features/activity/useActivityJob';
import { joinLink } from '@/features/events/links';
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

function MemberRow({
  member,
  index,
  canMeet,
  groupId,
  isMeetup,
}: {
  member: GroupMember;
  index: number;
  canMeet: boolean;
  groupId: string;
  isMeetup: boolean;
}) {
  const queryClient = useQueryClient();
  const style = memberDegreeStyle(member);
  const name = member.degree === 0 ? 'You' : memberDisplayName(member);
  const tone = member.degree === 0 ? 'you' : member.revealed ? 'met' : 'unmet';
  const connect = useMutation({
    mutationFn: () => api.createConnection({ peerId: member.id!, context: isMeetup ? 'event' : 'group' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
    },
  });
  const showMeet = canMeet && member.degree > 0 && member.revealed && member.id;
  return (
    <View className="flex-row items-center gap-3 py-2" key={member.id ?? `unrevealed-${index}`}>
      <Avatar name={name} photoUrl={member.photoUrl} tone={tone} locked={!member.revealed && member.degree > 0} />
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-body-semibold text-base text-ink">{name}</Text>
          {member.degree > 0 && !isMeetup ? <DegreeBadge label={style.label} tone={tone} /> : null}
        </View>
        {!member.revealed && member.degree > 0 ? (
          <Muted>You'll see who they are once you've hung out together.</Muted>
        ) : null}
        {member.revealed && member.bio ? <Muted numberOfLines={2}>{member.bio}</Muted> : null}
        {member.sharedInterests.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5 pt-1">
            {member.sharedInterests.map((interest) => (
              <Chip key={interest} label={interest} />
            ))}
          </View>
        ) : null}
      </View>
      {showMeet ? (
        member.met ? (
          <View className="flex-row items-center gap-1">
            <Check size={16} color="#5B7A6B" />
            <Text className="font-body-medium text-sm text-sage">Met</Text>
          </View>
        ) : (
          <Button
            label="We met"
            variant="secondary"
            className="min-h-9 py-1.5"
            loading={connect.isPending}
            onPress={() => connect.mutate()}
          />
        )
      ) : null}
    </View>
  );
}

function ActivityPreview({
  activity,
  activityStatus,
  onPress,
}: {
  activity: Activity | null;
  activityStatus?: string | null;
  onPress: () => void;
}) {
  const isGenerating =
    activity?.status === 'generating' || activityStatus === 'generating';

  if (isGenerating) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Card className="border-sage/40 bg-paper-raised">
          <View className="flex-row items-center justify-between">
            <Heading>The plan</Heading>
            <View className="flex-row items-center gap-1.5 rounded-full bg-sage/20 px-2.5 py-0.5">
              <Sparkles size={12} color="#5B7A6B" />
              <Text className="font-body-semibold text-xs text-sage">AI Generating…</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-3 pt-1">
            <View className="h-11 w-11 items-center justify-center rounded-l bg-sage/10">
              <Sparkles size={22} color="#5B7A6B" />
            </View>
            <View className="flex-1">
              <Text className="font-body-semibold text-base text-ink">
                Finding the best spot…
              </Text>
              <Muted numberOfLines={1}>
                Degrees AI is curating a real hangout plan
              </Muted>
            </View>
            <ChevronRight size={20} color="#8A8378" />
          </View>
        </Card>
      </Pressable>
    );
  }

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

function Icebreakers({ groupId, prompts }: { groupId: string; prompts: string[] }) {
  const queryClient = useQueryClient();
  const generate = useMutation({
    mutationFn: () => api.generateIcebreakers(groupId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) }),
  });
  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Sparkles size={16} color="#5B7A6B" />
          <Heading>Icebreakers</Heading>
        </View>
        {prompts.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="New icebreakers" onPress={() => generate.mutate()} disabled={generate.isPending}>
            <RefreshCw size={16} color={generate.isPending ? '#C9C2B6' : '#8A8378'} />
          </Pressable>
        ) : null}
      </View>
      {prompts.length === 0 ? (
        <>
          <Body>Written for exactly who's here — something to say that isn't "so, what's your major?"</Body>
          <Button label="Break the ice" variant="secondary" loading={generate.isPending} onPress={() => generate.mutate()} />
        </>
      ) : (
        prompts.map((prompt, index) => (
          <View key={prompt} className="flex-row gap-3">
            <Text className="font-display text-base text-sage">{index + 1}</Text>
            <Body className="flex-1">{prompt}</Body>
          </View>
        ))
      )}
      {generate.isError ? <Muted>{generate.error.message}</Muted> : null}
    </Card>
  );
}

export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveGroupId = useSessionStore((state) => state.setActiveGroupId);
  const setActiveEvent = useSessionStore((state) => state.setActiveEvent);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (id) {
      setActiveGroupId(id);
    }
  }, [id, setActiveGroupId]);

  const group = useGroup(id, { live: true });
  const data = group.data;
  // Wave 2: keeps a plan job advancing while this screen is open (see features/activity/useActivityJob).
  useActivityJob(id, data?.activityStatus === 'generating' || data?.activity?.status === 'generating');
  const isMeetup = data?.kind === 'meetup';
  const isInvited = data?.status === 'proposed' && !isMeetup;
  const isCompleted = Boolean(data?.completedAt);

  // Being in a live meetup makes it the event a QR-formed connection is tied to (ConnectScreen). The id is the
  // `events` row, which is what POST /connections' eventId references — not the group id.
  useEffect(() => {
    if (data && isMeetup && !isCompleted && data.eventId) {
      setActiveEvent({ id: data.eventId, name: data.name ?? 'Meetup', groupId: data.id });
    }
  }, [data, isMeetup, isCompleted, setActiveEvent]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.group(id!) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.hangouts });
  };

  const respond = useMutation({
    mutationFn: (accept: boolean) => api.respondToGroup(id!, accept),
    onSuccess: (_, accept) => {
      if (accept) invalidate();
      else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.hangouts });
        router.replace('/index');
      }
    },
  });

  const complete = useMutation({
    mutationFn: () => api.completeGroup(id!),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
    },
  });

  const leave = useMutation({
    mutationFn: () => api.leaveGroup(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.hangouts });
      queryClient.removeQueries({ queryKey: queryKeys.group(id!) });
      router.replace('/index');
    },
  });

  const confirmLeave = () => {
    Alert.alert(
      isMeetup ? 'Leave this meetup?' : 'Leave this group?',
      "You'll drop off the list and lose the chat. Everyone else keeps it.",
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => leave.mutate() },
      ],
    );
  };

  const confirmEnd = () => {
    Alert.alert(
      isMeetup ? 'End the meetup?' : 'Mark the hangout done?',
      isMeetup
        ? 'Everyone here gets connected to each other, the code closes, and chat + photos stay open for 24 hours.'
        : 'Chat and photos stay open for 24 hours, then this moves to your history.',
      [
        { text: 'Not yet', style: 'cancel' },
        { text: isMeetup ? 'End meetup' : 'Mark done', onPress: () => complete.mutate() },
      ],
    );
  };

  const others = data?.members.filter((member) => member.degree !== 0) ?? [];
  const revealedOthers = others.filter((member) => member.revealed);
  const title = data?.name
    ? data.name
    : revealedOthers.length > 0
      ? `You + ${revealedOthers.map((m) => firstName(m.displayName ?? 'Someone')).join(', ')}${
          data && data.unrevealedCount > 0 ? ` + ${data.unrevealedCount} more` : ''
        }`
      : data && data.unrevealedCount > 0
        ? `You + ${data.unrevealedCount} new people`
        : 'Your group';

  // "We met" is offered in a live meetup, or in a matched group once everyone has agreed to meet.
  const canMeet = Boolean(data) && !isInvited;

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={group.isRefetching} onRefresh={() => void group.refetch()} />
      }
    >
      <Stack.Screen options={{ title: isMeetup ? 'Meetup' : 'Your group' }} />
      {group.isPending ? <LoadingState label="Loading…" /> : null}
      {group.isError ? (
        <ErrorState message={group.error.message} onRetry={() => void group.refetch()} />
      ) : null}
      {data ? (
        <>
          <View className="gap-1">
            <Text className="font-display text-2xl text-ink">{title}</Text>
            {isMeetup && data.scheduledAt ? (
              <Muted>{format(parseISO(data.scheduledAt), 'EEEE, MMM d · h:mm a')}</Muted>
            ) : null}
            {isCompleted ? <Muted>{isMeetup ? 'Ended' : 'Wrapped up'} — chat and photos close 24h after.</Muted> : null}
          </View>

          {isInvited ? (
            <Card className="border-ember">
              <Heading>New hangout suggested for you</Heading>
              <Body>Take a look — you can say no, no hard feelings.</Body>
            </Card>
          ) : null}

          {!isMeetup && data.reasoning ? (
            <Card className="border-line bg-paper-raised">
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color="#5B7A6B" />
                <Heading>Why this group</Heading>
              </View>
              <Body>{data.reasoning}</Body>
            </Card>
          ) : null}

          {isMeetup && !isCompleted ? (
            <Card className="items-center">
              {data.roomCode ? (
                <>
                  {showQr ? (
                    <View className="rounded-l bg-paper-raised p-4">
                      <QRCode value={joinLink(data.roomCode)} size={200} />
                    </View>
                  ) : null}
                  <Text className="font-display text-2xl tracking-[6px] text-ink">{data.roomCode}</Text>
                  <Muted>
                    {data.codeExpiresAt
                      ? `Code works until ${format(parseISO(data.codeExpiresAt), 'EEE h:mm a')}`
                      : 'Share this code with people here.'}
                  </Muted>
                  <Button
                    label={showQr ? 'Hide QR code' : 'Show QR code'}
                    variant="ghost"
                    icon={<QrCode size={16} color="#20201C" />}
                    onPress={() => setShowQr((value) => !value)}
                  />
                </>
              ) : (
                <Muted>The join code has expired — nobody new can join, but everyone here is in.</Muted>
              )}
            </Card>
          ) : null}

          <Card>
            <Heading>{isMeetup ? `Here · ${data.members.length}` : `${data.members.length} people`}</Heading>
            {isMeetup && !isCompleted ? (
              <Muted>Tap "We met" for anyone you actually talked to. Ending the meetup connects everyone anyway.</Muted>
            ) : null}
            {!isMeetup && canMeet && !isCompleted ? (
              <Muted>Tap "We met" once you've actually hung out — that's what puts them in your circle.</Muted>
            ) : null}
            {data.members.map((member, index) => (
              <MemberRow
                key={member.id ?? `unrevealed-${index}`}
                member={member}
                index={index}
                canMeet={canMeet}
                groupId={id!}
                isMeetup={isMeetup}
              />
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
              {isMeetup ? <Icebreakers groupId={id!} prompts={data.icebreakers} /> : null}

              <ActivityPreview
                activity={data.activity}
                activityStatus={data.activityStatus}
                onPress={() => router.push(`/groups/${id}/activity`)}
              />

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
                {!isMeetup ? (
                  <Button
                    label="How did it go?"
                    variant="secondary"
                    icon={<Star size={18} color="#20201C" />}
                    onPress={() => router.push(`/groups/${id}/feedback`)}
                  />
                ) : null}
              </View>

              {!isCompleted ? (
                <View className="gap-3 pt-2">
                  {/* Any member can end it (docs: "host or any member marks the hangout done"). */}
                  <Button
                    label={isMeetup ? 'End meetup' : 'Mark hangout as done'}
                    variant="ghost"
                    loading={complete.isPending}
                    onPress={confirmEnd}
                  />
                  {complete.isError ? <Muted>{complete.error.message}</Muted> : null}
                  <Button
                    label={isMeetup ? 'Leave meetup' : 'Leave group'}
                    variant="ghost"
                    icon={<LogOut size={16} color="#20201C" />}
                    loading={leave.isPending}
                    onPress={confirmLeave}
                  />
                  {leave.isError ? <Muted>{leave.error.message}</Muted> : null}
                </View>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
