// Owner: Christian (Server & Infra) — Added Sep 26.
// CHANGED Sep 26 (wave 5, Sahith): the server writes these now (added to a group, exchange asks, "We met",
// changes to a meetup or plan), so the feed marks itself read on open, has copy for every payload shape, opens
// the right screen per type, and links to the per-kind settings (gear, top right).
import type { Notification } from '@degrees/shared';
import { useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Stack, useRouter, type Href } from 'expo-router';
import { Settings2 } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { queryKeys } from '@/features/groups/queries';
import { api } from '@/lib/api';
import { usePullToRefresh } from '@/lib/query';
import { useNotifications } from './queries';

type Copy = { title: string; subtitle: string };
const text = (value: unknown, fallback = '') => (typeof value === 'string' && value ? value : fallback);
const count = (value: unknown) => (typeof value === 'number' ? value : null);

function eventChangedCopy(p: Record<string, unknown>): Copy {
  const name = text(p.name, 'A meetup');
  const detail = text(p.detail);
  switch (p.change) {
    case 'renamed':
      return { title: `Renamed to ${detail || name}`, subtitle: 'Same people, new name' };
    case 'time': {
      let when = detail;
      try {
        if (detail) when = format(parseISO(detail), 'EEE, MMM d · h:mm a');
      } catch {
        // keep the raw detail
      }
      return { title: `${name}: time locked in`, subtitle: when || 'Open the plan' };
    }
    case 'plan':
      return { title: `${name}: new plan${detail ? ` — ${detail}` : ''}`, subtitle: 'Open the plan' };
    case 'ended':
      return { title: `${name} ended`, subtitle: 'Chat and photos stay open for 24 hours' };
    default:
      return { title: `${name} changed`, subtitle: 'Take a look' };
  }
}

const COPY: Record<Notification['type'], (payload: Record<string, unknown>) => Copy> = {
  hangout_invited: (p) => {
    const members = count(p.memberCount);
    return {
      title: "You've been added to a new group",
      subtitle: members ? `${members} people · tap to respond` : 'Tap to respond',
    };
  },
  hangout_forming: (p) => ({ title: "Everyone's in — your group is on", subtitle: text(p.name, 'Open it to plan something') }),
  message_received: (p) => ({ title: `New message from ${text(p.senderName, 'someone')}`, subtitle: 'Open the group chat' }),
  feedback_prompt: (p) => ({ title: 'Rate your last hangout', subtitle: text(p.name) }),
  exchange_requested: (p) => ({ title: `${text(p.peerName, 'Someone')} wants to exchange numbers`, subtitle: 'Open Your circle to respond' }),
  exchange_accepted: (p) => ({ title: `${text(p.peerName, 'Someone')} agreed to exchange numbers`, subtitle: 'Open Your circle to see their number' }),
  connection_added: (p) => {
    const n = count(p.count);
    if (n !== null) {
      return {
        title: `${n} ${n === 1 ? 'person' : 'people'} from ${text(p.eventName, 'the meetup')} ${n === 1 ? 'is' : 'are'} now your 1st degree`,
        subtitle: 'See them in Your circle',
      };
    }
    return { title: `${text(p.peerName, 'Someone')} is now your 1st degree`, subtitle: 'See who else you know' };
  },
  event_changed: eventChangedCopy,
};

function targetFor(notification: Notification): Href {
  const groupId = notification.payload.groupId;
  const id = typeof groupId === 'string' ? groupId : null;
  switch (notification.type) {
    case 'hangout_invited':
    case 'hangout_forming':
    case 'message_received':
      return id ? { pathname: '/groups/[id]', params: { id } } : ('/' as Href);
    case 'feedback_prompt':
      return id ? { pathname: '/groups/[id]/feedback', params: { id } } : ('/' as Href);
    case 'exchange_requested':
    case 'exchange_accepted':
    case 'connection_added':
      return '/circle';
    case 'event_changed': {
      const change = notification.payload.change;
      if (!id) return '/' as Href;
      return change === 'plan' || change === 'time'
        ? { pathname: '/groups/[id]/activity', params: { id } }
        : { pathname: '/groups/[id]', params: { id } };
    }
  }
}

export function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const notifications = useNotifications();
  const pull = usePullToRefresh(notifications.refetch);

  // Opening the feed reads it: mark everything read once per visit (and once more if new rows land while open).
  const marking = useRef(false);
  const unread = notifications.data?.some((notification) => !notification.read) ?? false;
  useEffect(() => {
    if (!unread || marking.current) return;
    marking.current = true;
    void api
      .markNotificationsRead()
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }))
      .catch((error: unknown) => {
        if (__DEV__) console.warn('[notifications] mark read failed', error);
      })
      .finally(() => {
        marking.current = false;
      });
  }, [unread, queryClient]);

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />
      }
    >
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notification settings"
              hitSlop={8}
              onPress={() => router.push('/notifications/settings')}
            >
              <Settings2 size={20} color="#20201C" />
            </Pressable>
          ),
        }}
      />
      {notifications.isPending ? <LoadingState label="Loading…" /> : null}
      {notifications.isError ? (
        <ErrorState message={notifications.error.message} onRetry={() => void notifications.refetch()} />
      ) : null}
      {notifications.data ? (
        <View>
          {notifications.data.length === 0 ? <Muted>Nothing yet.</Muted> : null}
          {notifications.data.map((notification) => {
            const copy = (COPY[notification.type] ?? (() => ({ title: 'Something happened', subtitle: 'Take a look' })))(
              notification.payload,
            );
            return (
              <Pressable
                key={notification.id}
                onPress={() => router.push(targetFor(notification))}
                className="flex-row items-center gap-3 border-b border-line py-3.5"
              >
                {!notification.read ? <View className="h-2 w-2 rounded-full bg-ember" /> : <View className="w-2" />}
                <View className="flex-1">
                  <Text className="font-body-semibold text-sm text-ink">{copy.title}</Text>
                  <Muted className="mt-0.5">{copy.subtitle}</Muted>
                </View>
                <Muted>{formatDistanceToNowStrict(parseISO(notification.createdAt), { addSuffix: true })}</Muted>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}
