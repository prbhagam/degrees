// Owner: Christian (Server & Infra) — Added Sep 26.
import type { Notification } from '@degrees/shared';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Stack, useRouter, type Href } from 'expo-router';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { useNotifications } from './queries';

const COPY: Record<Notification['type'], (payload: Record<string, unknown>) => { title: string; subtitle: string }> = {
  hangout_invited: (p) => ({ title: 'New hangout suggested for you', subtitle: String(p.name ?? 'Take a look') }),
  hangout_forming: (p) => ({ title: 'Your group is forming', subtitle: String(p.name ?? '') }),
  message_received: (p) => ({ title: `New message from ${p.senderName ?? 'someone'}`, subtitle: 'Open the group chat' }),
  feedback_prompt: (p) => ({ title: 'Rate your last hangout', subtitle: String(p.name ?? '') }),
  exchange_requested: (p) => ({ title: `${p.peerName ?? 'Someone'} wants to exchange numbers`, subtitle: 'Open 1st degree to respond' }),
  exchange_accepted: (p) => ({ title: `${p.peerName ?? 'Someone'} agreed to exchange numbers`, subtitle: 'Open 1st degree to see their number' }),
  connection_added: (p) => ({ title: `${p.peerName ?? 'Someone'} is now your 1st degree`, subtitle: 'See who else you know' }),
};

function targetFor(notification: Notification): Href {
  const groupId = notification.payload.groupId;
  const id = typeof groupId === 'string' ? groupId : null;
  switch (notification.type) {
    case 'hangout_invited':
    case 'hangout_forming':
    case 'message_received':
      return id ? { pathname: '/groups/[id]', params: { id } } : '/index';
    case 'feedback_prompt':
    case 'exchange_requested':
    case 'exchange_accepted':
      return id ? { pathname: '/groups/[id]/feedback', params: { id } } : '/index';
    case 'connection_added':
      return '/circle';
  }
}

export function NotificationsScreen() {
  const router = useRouter();
  const notifications = useNotifications();

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={notifications.isRefetching} onRefresh={() => void notifications.refetch()} />
      }
    >
      <Stack.Screen options={{ title: 'Notifications' }} />
      {notifications.isPending ? <LoadingState label="Loading…" /> : null}
      {notifications.isError ? (
        <ErrorState message={notifications.error.message} onRetry={() => void notifications.refetch()} />
      ) : null}
      {notifications.data ? (
        <View>
          {notifications.data.length === 0 ? <Muted>Nothing yet.</Muted> : null}
          {notifications.data.map((notification) => {
            const copy = COPY[notification.type](notification.payload);
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
