// Owner: Pranav (Groups, Activities & Chat) — the home hub: your hangouts, meet someone, join an event, find a group.
// Charles agreed to this living here; auth gating (redirect to /login) belongs in his scaffold.
// CHANGED Sep 26 (wave 2): one list of groups AND meetups (tagged), split into Active / Past, from
// GET /api/hangouts; polls once a minute while focused; pull-to-refresh; and a banner naming what's still
// missing from onboarding when it was skipped.
// CHANGED Sep 26 (wave 5, Sahith): the bell shows an ember dot while there's anything unread.
// CHANGED Sep 27 (wave 6, Sahith): anything waiting on your accept/decline sits at the very top ("Needs your reply");
// hangouts that ended in the last week and still want your feedback get their own "Awaiting feedback" section; the
// rest of the past is collapsed behind a toggle. Unnamed groups are titled by who's in them (summaryTitle), and the
// bell has breathing room from the screen edge.
import type { HangoutSummary } from '@degrees/shared';
import { format, parseISO } from 'date-fns';
import { Stack, useRouter, type Href } from 'expo-router';
import { AlertCircle, Bell, CalendarPlus, ChevronDown, ChevronRight, Plus, QrCode, Users } from 'lucide-react-native';
import { DegreesMark } from '@/components/DegreesMark';
import { usePullToRefresh } from '@/lib/query';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { summaryTitle } from '@/features/groups/degrees';
import { useHangouts, useMe } from '@/features/groups/queries';
import { useUnreadCount } from '@/features/notifications/queries';
import { Button, Card, HEADER_ICON_SIZE, HeaderIconButton, Heading, Muted, Screen } from '@/components/ui';

const STATUS_LABEL: Record<HangoutSummary['status'], string> = {
  proposed: 'Waiting on others',
  confirmed: 'Plans on',
  completed: 'Done',
};

function KindTag({ kind }: { kind: HangoutSummary['kind'] }) {
  const meetup = kind === 'meetup';
  return (
    <View className={`rounded-full px-2 py-0.5 ${meetup ? 'bg-ember/15' : 'bg-sage/15'}`}>
      <Text className={`font-body-semibold text-[11px] uppercase tracking-wider ${meetup ? 'text-ember-ink' : 'text-sage'}`}>
        {meetup ? 'Meetup' : 'Group'}
      </Text>
    </View>
  );
}

// A hangout that ended within this long, and that you haven't left feedback on, is "awaiting feedback".
const FEEDBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function awaitsFeedback(hangout: HangoutSummary, now = Date.now()): boolean {
  if (!hangout.isPast || hangout.feedbackGiven) return false;
  const ended = hangout.completedAt ?? hangout.scheduledAt ?? hangout.formedAt;
  return ended !== null && now - new Date(ended).getTime() <= FEEDBACK_WINDOW_MS;
}

function hangoutSubtitle(hangout: HangoutSummary): string {
  const parts: string[] = [];
  if (hangout.kind === 'meetup') {
    if (hangout.scheduledAt) parts.push(format(parseISO(hangout.scheduledAt), 'EEE MMM d, h:mm a'));
    if (hangout.roomCode) parts.push(`Code ${hangout.roomCode}`);
    parts.push(`${hangout.memberCount} ${hangout.memberCount === 1 ? 'person' : 'people'}`);
    if (hangout.completedAt) parts.push(hangout.feedbackGiven ? 'Ended' : 'Ended · leave feedback');
  } else if (hangout.needsResponse) {
    parts.push('New match — needs your reply');
  } else if (hangout.status === 'proposed') {
    const waiting = hangout.memberCount - hangout.acceptedCount;
    parts.push(`You're in · waiting on ${waiting} ${waiting === 1 ? 'person' : 'people'}`);
  } else {
    parts.push(STATUS_LABEL[hangout.status]);
    if (hangout.status === 'completed' && !hangout.feedbackGiven) parts.push('Leave feedback');
  }
  return parts.join(' · ');
}

function HangoutRow({ hangout, onPress }: { hangout: HangoutSummary; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card className={hangout.isPast ? 'opacity-70' : hangout.needsResponse ? 'border-ember' : ''}>
        <View className="flex-row items-center justify-between">
          <KindTag kind={hangout.kind} />
          <ChevronRight size={18} color="#8A8378" />
        </View>
        <Text numberOfLines={1} className="font-body-semibold text-base text-ink">
          {summaryTitle(hangout)}
        </Text>
        <Muted>{hangoutSubtitle(hangout)}</Muted>
        {hangout.kind === 'matched' && hangout.reasoning ? (
          <Text numberOfLines={2} className="font-body text-sm text-ink">
            {hangout.reasoning}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

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

// Which onboarding step to send an unfinished profile to, in walk order.
export function missingStepHref(status: { interests: boolean; about: boolean; preferences: boolean }, returnTo?: string): Href {
  const params = returnTo ? { returnTo } : {};
  if (!status.interests) return { pathname: '/onboarding/interests', params };
  if (!status.about) return { pathname: '/onboarding/about', params };
  return { pathname: '/onboarding/preferences', params };
}

function ProfileNag({ status }: { status: { interests: boolean; about: boolean; preferences: boolean } }) {
  const router = useRouter();
  const missing = [
    !status.interests ? 'interests' : null,
    !status.about ? 'home base' : null,
    !status.preferences ? 'preferences' : null,
  ].filter((part): part is string => part !== null);
  if (missing.length === 0) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(missingStepHref(status))}>
      <Card className="border-ember bg-ember/10">
        <View className="flex-row items-center gap-2">
          <AlertCircle size={16} color="#B5461A" />
          <Text className="font-body-semibold text-sm text-ember-ink">Finish setting up</Text>
        </View>
        <Text className="font-body text-sm text-ink">
          You haven't set up your {missing.join(', ')}. Matching can't work without that — tap to finish.
        </Text>
      </Card>
    </Pressable>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const hangouts = useHangouts();
  const me = useMe();
  const unread = useUnreadCount();
  const ink = '#20201C';
  const pull = usePullToRefresh(() => Promise.all([hangouts.refetch(), me.refetch()]));

  const [showPast, setShowPast] = useState(false);
  const list = hangouts.data?.hangouts ?? [];
  const needsReply = list.filter((hangout) => !hangout.isPast && hangout.needsResponse);
  const active = list.filter((hangout) => !hangout.isPast && !hangout.needsResponse);
  const awaitingFeedback = list.filter((hangout) => awaitsFeedback(hangout));
  const past = list.filter((hangout) => hangout.isPast && !awaitsFeedback(hangout));
  const open = (hangout: HangoutSummary) => router.push(`/groups/${hangout.id}`);

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <Stack.Screen
        options={{
          // Wave 4: the mark sits with the title; "+" is gone (Host a meetup is right below).
          // Wave 6 follow-up: no padding here — the tab layout insets both header sides the same on every phone.
          headerLeft: () => <DegreesMark size={24} />,
          headerRight: () => (
            <HeaderIconButton label="Notifications" onPress={() => router.push('/notifications')}>
              <View>
                <Bell size={HEADER_ICON_SIZE} color={ink} />
                {unread > 0 ? (
                  <View className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-paper bg-ember" />
                ) : null}
              </View>
            </HeaderIconButton>
          ),
        }}
      />

      {needsReply.length > 0 ? (
        <View className="gap-3">
          <Heading>Needs your reply</Heading>
          {needsReply.map((hangout) => (
            <HangoutRow key={hangout.id} hangout={hangout} onPress={() => open(hangout)} />
          ))}
        </View>
      ) : null}

      {me.data ? <ProfileNag status={me.data.profileStatus} /> : null}

      <View className="gap-3">
        <Heading>Your hangouts</Heading>
        {hangouts.isError ? <Muted>{hangouts.error.message}</Muted> : null}
        {active.map((hangout) => (
          <HangoutRow key={hangout.id} hangout={hangout} onPress={() => open(hangout)} />
        ))}
        {hangouts.data && active.length === 0 && needsReply.length === 0 ? (
          <Muted>Nothing on right now. Meet a few people, then find your first group.</Muted>
        ) : null}
        <Button label="Find my group" icon={<Users size={18} color="#F7F3EC" />} onPress={() => router.push('/match')} />
      </View>

      {awaitingFeedback.length > 0 ? (
        <View className="gap-3">
          <Heading>Awaiting feedback</Heading>
          {awaitingFeedback.map((hangout) => (
            <HangoutRow
              key={hangout.id}
              hangout={hangout}
              onPress={() => router.push(`/groups/${hangout.id}/feedback`)}
            />
          ))}
        </View>
      ) : null}

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
          title="Join a meetup"
          subtitle="Enter a room code or scan the event QR"
          onPress={() => router.push('/join')}
        />
        <ActionRow
          icon={<Plus size={22} color={ink} />}
          title="Host a meetup"
          subtitle="Get a code people can join in person"
          onPress={() => router.push('/create-event')}
        />
      </View>

      {past.length > 0 ? (
        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showPast }}
            onPress={() => setShowPast((value) => !value)}
            className="flex-row items-center justify-between py-1"
          >
            <Heading>{`Past · ${past.length}`}</Heading>
            <View className="flex-row items-center gap-1">
              <Muted>{showPast ? 'Hide' : 'Show'}</Muted>
              <View style={{ transform: [{ rotate: showPast ? '180deg' : '0deg' }] }}>
                <ChevronDown size={16} color="#8A8378" />
              </View>
            </View>
          </Pressable>
          {showPast
            ? past.map((hangout) => <HangoutRow key={hangout.id} hangout={hangout} onPress={() => open(hangout)} />)
            : null}
        </View>
      ) : null}
    </Screen>
  );
}
