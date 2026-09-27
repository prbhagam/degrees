// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26 (wave 5, Sahith). The Chats tab: every group chat
// you can talk in (a meetup, or a matched group once everyone's in), newest message first. Chat itself is
// unchanged (ChatScreen + useMessages); this is just the door to it.
import type { HangoutSummary } from '@degrees/shared';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Stack, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { ErrorState, LoadingState, Muted, Screen, initials } from '@/components/ui';
import { firstName } from '@/features/groups/degrees';
import { useHangouts } from '@/features/groups/queries';
import { usePullToRefresh } from '@/lib/query';

function summaryTitle(hangout: HangoutSummary): string {
  if (hangout.name) return hangout.name;
  return hangout.memberCount > 0 ? `Group of ${hangout.memberCount}` : 'Your group';
}

function KindTag({ kind }: { kind: HangoutSummary['kind'] }) {
  const meetup = kind === 'meetup';
  return (
    <View className={`rounded-full px-1.5 py-0.5 ${meetup ? 'bg-ember/15' : 'bg-sage/15'}`}>
      <Text className={`font-body-semibold text-[10px] uppercase tracking-wider ${meetup ? 'text-ember-ink' : 'text-sage'}`}>
        {meetup ? 'Meetup' : 'Group'}
      </Text>
    </View>
  );
}

function ChatRow({ hangout, onPress }: { hangout: HangoutSummary; onPress: () => void }) {
  const title = summaryTitle(hangout);
  const last = hangout.lastMessage;
  const when = last?.createdAt ?? hangout.formedAt;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-l border border-line bg-paper-raised px-3.5 py-3"
    >
      <View className={`h-11 w-11 items-center justify-center rounded-full ${hangout.kind === 'meetup' ? 'bg-ember' : 'bg-sage'}`}>
        <Text className="font-body-bold text-base text-paper">{initials(title)}</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="flex-shrink font-body-semibold text-base text-ink">
            {title}
          </Text>
          <KindTag kind={hangout.kind} />
        </View>
        <Muted numberOfLines={1}>
          {last ? `${firstName(last.senderName)}: ${last.body}` : 'No messages yet — say hi'}
        </Muted>
      </View>
      <View className="items-end gap-1">
        {when ? <Muted>{formatDistanceToNowStrict(parseISO(when), { addSuffix: false })}</Muted> : null}
        <ChevronRight size={16} color="#8A8378" />
      </View>
    </Pressable>
  );
}

export function ChatsScreen() {
  const router = useRouter();
  const hangouts = useHangouts();
  const pull = usePullToRefresh(hangouts.refetch);

  const recency = (h: HangoutSummary) => h.lastMessage?.createdAt ?? h.formedAt ?? '';
  const chats = (hangouts.data?.hangouts ?? [])
    .filter((hangout) => hangout.chatOpen)
    .sort((a, b) => recency(b).localeCompare(recency(a)));

  return (
    <Screen refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}>
      <Stack.Screen options={{ title: 'Chats' }} />
      {hangouts.isPending ? <LoadingState label="Loading chats…" /> : null}
      {hangouts.isError ? <ErrorState message={hangouts.error.message} onRetry={() => void hangouts.refetch()} /> : null}
      {hangouts.data ? (
        chats.length === 0 ? (
          <Muted>Chats open once a group is confirmed or you're at a meetup.</Muted>
        ) : (
          <View className="gap-2.5">
            {chats.map((hangout) => (
              <ChatRow key={hangout.id} hangout={hangout} onPress={() => router.push(`/groups/${hangout.id}/chat`)} />
            ))}
          </View>
        )
      ) : null}
    </Screen>
  );
}
