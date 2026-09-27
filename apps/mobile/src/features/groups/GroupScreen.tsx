// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
// CHANGED Sep 26: members past 1st degree are redacted (no name, no `via`) — see degrees.ts.
// CHANGED Sep 26 (wave 2): one screen for both kinds. A meetup shows its room code + QR, everyone present with a
// per-person "We met" (hidden once an edge exists), icebreakers, and "End meetup" (which connects everyone).
// CHANGED Sep 26 (wave 3): leaving a live meetup undoes only the connections that meetup made for you (edges tagged
// with its event id); people you already knew stay 1st degree. Both kinds still can't be left once wrapped up.
// CHANGED Sep 26 (wave 4): every member accepts or declines for themselves. A matched group stays "proposed"
// until everyone has said yes: you see Accept / Decline until you've answered, then "waiting on N" with a tick per
// person who's in. Chat and the plan open once it's confirmed. Any member can rename the group. "Why this group"
// never names anyone you haven't met (server-side redaction).
import type { Activity, GroupMember } from '@degrees/shared';
import { format, parseISO } from 'date-fns';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Clock,
  Image as ImageIcon,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
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
import { usePullToRefresh } from '@/lib/query';
import { useSessionStore } from '@/stores/session';
import { firstName, memberDegreeLabel, memberDisplayName } from './degrees';
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
  showAcceptance,
  groupId,
  isMeetup,
  eventId,
}: {
  member: GroupMember;
  index: number;
  canMeet: boolean;
  showAcceptance: boolean;
  groupId: string;
  isMeetup: boolean;
  eventId: string | null;
}) {
  const queryClient = useQueryClient();
  const degreeLabel = memberDegreeLabel(member);
  const name = member.degree === 0 ? 'You' : memberDisplayName(member);
  const tone = member.degree === 0 ? 'you' : member.revealed ? 'met' : 'unmet';
  // A lobby "We met" carries the meetup's event id, so leaving the meetup can undo it (server: leaveGroup). A
  // pre-existing edge with this person isn't overwritten — the server keeps the original row on conflict.
  const connect = useMutation({
    mutationFn: () =>
      api.createConnection({
        peerId: member.id!,
        context: isMeetup ? 'event' : 'group',
        eventId: isMeetup && eventId ? eventId : undefined,
      }),
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
          <DegreeBadge label={degreeLabel} tone={tone} />
        </View>
        {!member.revealed && member.degree > 0 ? (
          <Muted>You'll see who this is once you've hung out together.</Muted>
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
      {showAcceptance ? (
        member.accepted ? (
          <View className="flex-row items-center gap-1">
            <Check size={16} color="#5B7A6B" />
            <Text className="font-body-medium text-sm text-sage">In</Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-1">
            <Clock size={16} color="#8A8378" />
            <Text className="font-body-medium text-sm text-muted">Deciding</Text>
          </View>
        )
      ) : showMeet ? (
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
  historyCount,
  onPress,
}: {
  activity: Activity | null;
  activityStatus?: string | null;
  historyCount: number;
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
              <Text className="font-body-semibold text-xs text-sage">AI generating…</Text>
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
        {historyCount > 0 ? (
          <Muted>
            {historyCount} earlier {historyCount === 1 ? 'plan' : 'plans'} kept — open to compare or bring one back.
          </Muted>
        ) : null}
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
  const pull = usePullToRefresh(group.refetch);
  const data = group.data;
  // Wave 2: keeps a plan job advancing while this screen is open (see features/activity/useActivityJob).
  useActivityJob(id, data?.activityStatus === 'generating' || data?.activity?.status === 'generating');
  const isMeetup = data?.kind === 'meetup';
  const isProposed = data?.status === 'proposed' && !isMeetup;
  // Wave 4: your own answer is what gates the screen, not the group's status.
  const isInvited = isProposed && data?.myResponse === 'pending';
  const isWaiting = isProposed && data?.myResponse === 'accepted';
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
        router.dismissTo('/' as Href);
      }
    },
  });

  const rename = useMutation({
    mutationFn: (name: string) => api.renameGroup(id!, name),
    onSuccess: invalidate,
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      queryClient.removeQueries({ queryKey: queryKeys.group(id!) });
      // Back to Home (already under this screen), never a fresh '/index' push — that path was "Unmatched Route".
      router.dismissTo('/' as Href);
    },
  });

  const promptRename = () => {
    Alert.prompt(
      isMeetup ? 'Name this meetup' : 'Name this group',
      'Everyone in it sees the new name.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (text?: string) => { if (text?.trim()) rename.mutate(text.trim()); } },
      ],
      'plain-text',
      data?.name ?? '',
    );
  };

  const confirmLeave = () => {
    Alert.alert(
      isMeetup ? 'Leave this meetup?' : 'Leave this group?',
      isMeetup
        ? "You'll drop off the list and lose the chat. Connections you made at this meetup are undone — anyone you already knew before stays in your 1st degree."
        : "You'll drop off the list and lose the chat. Everyone else keeps it, and your 1st degree doesn't change.",
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
  const waitingOn = data ? data.members.length - data.acceptedCount : 0;
  const everyoneElsePassed = isProposed && others.length === 0;

  // "We met" is offered in a live meetup, or in a matched group once everyone has agreed to meet.
  const canMeet = Boolean(data) && !isProposed;

  return (
    <Screen refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}>
      <Stack.Screen options={{ title: isMeetup ? 'Meetup' : 'Your group' }} />
      {group.isPending ? <LoadingState label="Loading…" /> : null}
      {group.isError ? (
        <ErrorState message={group.error.message} onRetry={() => void group.refetch()} />
      ) : null}
      {data ? (
        <>
          <View className="gap-1">
            <View className="flex-row items-start gap-2">
              <Text className="flex-1 font-display text-2xl text-ink">{title}</Text>
              {!isCompleted ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rename"
                  hitSlop={8}
                  onPress={promptRename}
                  className="mt-1.5 h-8 w-8 items-center justify-center rounded-full bg-paper-raised"
                >
                  <Pencil size={14} color="#8A8378" />
                </Pressable>
              ) : null}
            </View>
            {rename.isError ? <Muted>{rename.error.message}</Muted> : null}
            {isMeetup && data.scheduledAt ? (
              <Muted>{format(parseISO(data.scheduledAt), 'EEEE, MMM d · h:mm a')}</Muted>
            ) : null}
            {isCompleted ? <Muted>{isMeetup ? 'Ended' : 'Wrapped up'} — chat and photos close 24h after.</Muted> : null}
          </View>

          {isInvited ? (
            <Card className="border-ember">
              <Heading>New group suggested for you</Heading>
              <Body>
                Take a look. Everyone decides for themselves — the group forms once all {data.members.length} say yes.
                {data.unrevealedCount > 0
                  ? ` ${data.unrevealedCount === 1 ? "One person here is" : `${data.unrevealedCount} people here are`} past your 1st degree; names unlock when it forms.`
                  : ''}
              </Body>
            </Card>
          ) : null}

          {isWaiting && !everyoneElsePassed ? (
            <Card className="border-sage/40 bg-paper-raised">
              <View className="flex-row items-center gap-2">
                <Clock size={16} color="#5B7A6B" />
                <Heading>You're in</Heading>
              </View>
              <Body>
                Waiting on {waitingOn} {waitingOn === 1 ? 'person' : 'people'} to decide. Chat and the plan open the
                moment everyone's in.
              </Body>
            </Card>
          ) : null}

          {everyoneElsePassed ? (
            <Card className="border-line bg-paper-raised">
              <Heading>Everyone else passed on this one</Heading>
              <Body>No hard feelings — run matching again for a fresh group.</Body>
              <Button label="Find another group" onPress={() => router.replace('/match')} />
            </Card>
          ) : null}

          {!isMeetup && data.reasoning && !everyoneElsePassed ? (
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

          {!everyoneElsePassed ? (
            <Card>
              <Heading>
                {isMeetup
                  ? `Here · ${data.members.length}`
                  : isProposed
                    ? `${data.acceptedCount} of ${data.members.length} in`
                    : `${data.members.length} people`}
              </Heading>
              {isMeetup && !isCompleted ? (
                <Muted>Tap "We met" for anyone you actually talked to. Ending the meetup connects everyone anyway.</Muted>
              ) : null}
              {!isMeetup && canMeet && !isCompleted ? (
                <Muted>Tap "We met" once you've actually hung out — that's what makes them 1st degree.</Muted>
              ) : null}
              {data.members.map((member, index) => (
                <MemberRow
                  key={member.id ?? `unrevealed-${index}`}
                  member={member}
                  index={index}
                  canMeet={canMeet}
                  showAcceptance={Boolean(isProposed)}
                  groupId={id!}
                  isMeetup={isMeetup}
                  eventId={data.eventId}
                />
              ))}
            </Card>
          ) : null}

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
                label="I'm in"
                className="flex-1"
                loading={respond.isPending && respond.variables === true}
                onPress={() => respond.mutate(true)}
              />
            </View>
          ) : null}
          {respond.isError ? <Muted>{respond.error.message}</Muted> : null}

          {isWaiting ? (
            <View className="gap-3 pt-2">
              <Button
                label="Never mind, leave"
                variant="ghost"
                icon={<LogOut size={16} color="#20201C" />}
                loading={respond.isPending && respond.variables === false}
                onPress={() => respond.mutate(false)}
              />
            </View>
          ) : null}

          {!isProposed ? (
            <>
              {isMeetup ? <Icebreakers groupId={id!} prompts={data.icebreakers} /> : null}

              <ActivityPreview
                activity={data.activity}
                activityStatus={data.activityStatus}
                historyCount={data.activityHistory.length}
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
                <Button
                  label="How did it go?"
                  variant="secondary"
                  icon={<Star size={18} color="#20201C" />}
                  onPress={() => router.push(`/groups/${id}/feedback`)}
                />
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
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
