// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26.
// CHANGED Sep 26 (wave 2): "Host a meetup". Opens the meetup's group screen, which has the code + QR, the lobby,
// icebreakers, chat, plan, and photos. No separate lobby screen.
// CHANGED Sep 26 (wave 5, Sahith): no calendar here. You host a meetup when you're already with the people, so it
// starts now and the code works for 24 hours. Scheduling lives on the generated plan (TimesCard), where the group
// talks through when they're free.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { queryKeys } from '@/features/groups/queries';
import { Button, ErrorState, Field, Muted, Screen, Stepper } from '@/components/ui';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session';

export function CreateEventScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveEvent = useSessionStore((state) => state.setActiveEvent);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupMin, setGroupMin] = useState(3);
  const [groupMax, setGroupMax] = useState(6);

  const create = useMutation({
    mutationFn: () =>
      api.createEvent({
        name: name.trim(),
        description: description.trim() || undefined,
        groupSizeMin: groupMin,
        groupSizeMax: groupMax,
      }),
    onSuccess: async ({ roomCode }) => {
      // The host is already a member; joining their own code just resolves the backing group id.
      const joined = await api.joinEvent(roomCode);
      setActiveEvent({ id: joined.eventId, name: joined.name, groupId: joined.groupId });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hangouts });
      router.replace(`/groups/${joined.groupId}`);
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Host a meetup' }} />
      <Text className="font-display text-2xl text-ink">Host a meetup</Text>
      <Muted className="mt-1.5">
        You'll get a code. Anyone who scans or types it in person joins — and when you end the meetup,
        everyone who came becomes each other's 1st degree.
      </Muted>
      <Muted className="mt-1">Starts now. The code works for 24 hours.</Muted>

      <View className="mt-5 gap-4">
        <Field label="What is it?" value={name} onChangeText={setName} placeholder="Friday Bouldering Session" />
        <Field
          label="The plan (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Casual bouldering, all levels welcome, tacos after."
          multiline
          numberOfLines={2}
        />

        <View className="gap-2">
          <Text className="font-body-semibold text-[13px] text-muted">Target group size</Text>
          <View className="flex-row items-center justify-between rounded-m border border-line bg-paper-raised px-4 py-3">
            <View className="items-center gap-1">
              <Muted>Min</Muted>
              <Stepper value={groupMin} min={2} max={groupMax} onDecrement={() => setGroupMin((v) => Math.max(2, v - 1))} onIncrement={() => setGroupMin((v) => Math.min(groupMax, v + 1))} />
            </View>
            <Muted>to</Muted>
            <View className="items-center gap-1">
              <Muted>Max</Muted>
              <Stepper value={groupMax} min={groupMin} max={20} onDecrement={() => setGroupMax((v) => Math.max(groupMin, v - 1))} onIncrement={() => setGroupMax((v) => Math.min(20, v + 1))} />
            </View>
          </View>
        </View>
      </View>

      {create.isError ? <ErrorState message={create.error.message} /> : null}
      <Button label="Create meetup" className="mt-6" loading={create.isPending} disabled={!name.trim()} onPress={() => create.mutate()} />
    </Screen>
  );
}
