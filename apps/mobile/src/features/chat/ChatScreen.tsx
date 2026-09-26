// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
// CHANGED Sep 26: restyled to ember/paper; chat now goes read-only 24h after the hangout is marked
// done (see GroupScreen's "Mark hangout as done") — see docs/ARCHITECTURE.md.
import type { Message } from '@degrees/shared';
import { format, parseISO } from 'date-fns';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SendHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firstName } from '@/features/groups/degrees';
import { useGroup } from '@/features/groups/queries';
import { ErrorState, LoadingState, Muted } from '@/components/ui';
import { useMessages } from './useMessages';

// iOS navigation bar height below the status bar; the keyboard offset has to clear it.
const NAV_BAR_HEIGHT = 44;
const MAX_LENGTH = 2000;
const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;

function Bubble({ message, mine, showName }: { message: Message; mine: boolean; showName: boolean }) {
  return (
    <View className={`max-w-[80%] gap-0.5 ${mine ? 'self-end' : 'self-start'}`}>
      {showName ? <Text className="ml-3 font-body-medium text-xs text-muted">{firstName(message.senderName)}</Text> : null}
      <View className={`rounded-2xl px-3.5 py-2 ${mine ? 'rounded-br-md bg-ink' : 'rounded-bl-md border border-line bg-paper-raised'}`}>
        <Text className={`font-body text-base ${mine ? 'text-paper' : 'text-ink'}`}>{message.body}</Text>
      </View>
      <Text className={`mx-3 text-[11px] text-muted ${mine ? 'text-right' : ''}`}>
        {format(parseISO(message.createdAt), 'h:mm a')}
      </Text>
    </View>
  );
}

export function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { messages, send, me } = useMessages(id);
  const group = useGroup(id);
  const [draft, setDraft] = useState('');

  const completedAt = group.data?.completedAt;
  const ended = Boolean(completedAt);
  const archived = Boolean(completedAt && Date.now() - new Date(completedAt).getTime() > ARCHIVE_GRACE_MS);

  const list = messages.data?.messages ?? [];
  // Inverted list: newest first, so the view starts at the bottom and stays there as messages arrive.
  const newestFirst = [...list].reverse();
  const canSend = draft.trim().length > 0 && !send.isPending && !archived;

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    send.mutate(body, { onSuccess: () => setDraft('') });
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={insets.top + NAV_BAR_HEIGHT}
      style={{ flex: 1 }}
      className="bg-paper"
    >
      <Stack.Screen options={{ title: 'Group chat' }} />
      {messages.isPending ? <LoadingState label="Loading messages…" /> : null}
      {messages.isError ? (
        <View className="p-5">
          <ErrorState message={messages.error.message} onRetry={() => void messages.refetch()} />
        </View>
      ) : null}

      {ended ? (
        <View className="mx-4 mt-3 rounded-m border border-line bg-[#F0EDE5] px-3.5 py-3">
          <Muted>
            {archived
              ? "Archived — read-only now. Exchange contact info in Feedback to keep talking."
              : 'This hangout ended — chat archives in 24 hours.'}
          </Muted>
        </View>
      ) : null}

      {messages.data ? (
        <FlatList
          inverted
          data={newestFirst}
          keyExtractor={(message) => message.id}
          contentContainerClassName="gap-2 px-4 py-4"
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            // Inverted lists render the empty component upside down; flip it back.
            <View className="items-center py-10" style={{ transform: [{ scaleY: -1 }] }}>
              <Muted>Say hi and pick a time that works.</Muted>
            </View>
          }
          renderItem={({ item, index }) => {
            const mine = item.senderId === me?.id;
            const older = newestFirst[index + 1];
            return (
              <Bubble message={item} mine={mine} showName={!mine && older?.senderId !== item.senderId} />
            );
          }}
        />
      ) : null}

      {send.isError ? <Text className="px-4 pb-1 font-body text-sm text-ember-ink">{send.error.message}</Text> : null}

      {!archived ? (
        <View
          className="flex-row items-end gap-2 border-t border-line bg-paper-raised px-3 pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message the group"
            placeholderTextColor="#8A8378"
            multiline
            maxLength={MAX_LENGTH}
            className="max-h-32 min-h-10 flex-1 rounded-2xl bg-paper px-4 py-2.5 font-body text-base text-ink"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!canSend}
            onPress={submit}
            className={`h-10 w-10 items-center justify-center rounded-full bg-ink ${canSend ? '' : 'opacity-40'}`}
          >
            {send.isPending ? <ActivityIndicator color="#F7F3EC" /> : <SendHorizontal size={18} color="#F7F3EC" />}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
