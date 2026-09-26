// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
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
import { ErrorState, LoadingState, Muted } from '@/features/groups/ui';
import { useMessages } from './useMessages';

// iOS navigation bar height below the status bar; the keyboard offset has to clear it.
const NAV_BAR_HEIGHT = 44;
const MAX_LENGTH = 2000;

function Bubble({
  message,
  mine,
  showName,
}: {
  message: Message;
  mine: boolean;
  showName: boolean;
}) {
  return (
    <View className={`max-w-[80%] gap-0.5 ${mine ? 'self-end' : 'self-start'}`}>
      {showName ? (
        <Text className="ml-3 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {firstName(message.senderName)}
        </Text>
      ) : null}
      <View
        className={`rounded-2xl px-3.5 py-2 ${mine ? 'rounded-br-md bg-violet-600' : 'rounded-bl-md bg-white dark:bg-neutral-800'}`}
      >
        <Text
          className={`text-base ${mine ? 'text-white' : 'text-neutral-900 dark:text-white'}`}
        >
          {message.body}
        </Text>
      </View>
      <Text
        className={`mx-3 text-[11px] text-neutral-400 ${mine ? 'text-right' : ''}`}
      >
        {format(parseISO(message.createdAt), 'h:mm a')}
      </Text>
    </View>
  );
}

export function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { messages, send, me } = useMessages(id);
  const [draft, setDraft] = useState('');

  const list = messages.data?.messages ?? [];
  // Inverted list: newest first, so the view starts at the bottom and stays there as messages arrive.
  const newestFirst = [...list].reverse();
  const canSend = draft.trim().length > 0 && !send.isPending;

  const submit = () => {
    const body = draft.trim();
    if (!body) {
      return;
    }
    send.mutate(body, { onSuccess: () => setDraft('') });
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={insets.top + NAV_BAR_HEIGHT}
      style={{ flex: 1 }}
      className="bg-neutral-50 dark:bg-neutral-950"
    >
      <Stack.Screen options={{ title: 'Group chat' }} />
      {messages.isPending ? <LoadingState label="Loading messages…" /> : null}
      {messages.isError ? (
        <View className="p-5">
          <ErrorState
            message={messages.error.message}
            onRetry={() => void messages.refetch()}
          />
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
            <View
              className="items-center py-10"
              style={{ transform: [{ scaleY: -1 }] }}
            >
              <Muted>Say hi and pick a time that works.</Muted>
            </View>
          }
          renderItem={({ item, index }) => {
            const mine = item.senderId === me?.id;
            const older = newestFirst[index + 1];
            return (
              <Bubble
                message={item}
                mine={mine}
                showName={!mine && older?.senderId !== item.senderId}
              />
            );
          }}
        />
      ) : null}

      {send.isError ? (
        <Text className="px-4 pb-1 text-sm text-red-600">
          {send.error.message}
        </Text>
      ) : null}
      <View
        className="flex-row items-end gap-2 border-t border-neutral-200 bg-white px-3 pt-2 dark:border-neutral-800 dark:bg-neutral-900"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message the group"
          placeholderTextColor="#a3a3a3"
          multiline
          maxLength={MAX_LENGTH}
          className="max-h-32 min-h-10 flex-1 rounded-2xl bg-neutral-100 px-4 py-2.5 text-base text-neutral-900 dark:bg-neutral-800 dark:text-white"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={!canSend}
          onPress={submit}
          className={`h-10 w-10 items-center justify-center rounded-full bg-violet-600 ${canSend ? '' : 'opacity-40'}`}
        >
          {send.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <SendHorizontal size={18} color="white" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
