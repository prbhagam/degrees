// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26.
// After creating the event this hands off to JoinRoomScreen (join/[roomCode]) — the host joins
// their own event via the fresh room code, which already has the QR + live attendee list + "We
// met" flow built. No separate lobby screen needed.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, ErrorState, Field, Muted, Screen, Stepper } from '@/components/ui';
import { api } from '@/lib/api';

export function CreateEventScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupMin, setGroupMin] = useState(3);
  const [groupMax, setGroupMax] = useState(6);

  const create = useMutation({
    mutationFn: () =>
      api.createEvent({
        name,
        description: description || undefined,
        groupSizeMin: groupMin,
        groupSizeMax: groupMax,
      }),
    onSuccess: ({ roomCode }) => router.replace(`/join/${roomCode}`),
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Host a hangout' }} />
      <Text className="font-display text-2xl text-ink">Host a hangout</Text>
      <Muted className="mt-1.5">
        We'll generate a code — anyone who scans it in person joins this event.
      </Muted>

      <View className="mt-5 gap-4">
        <Field label="Event name" value={name} onChangeText={setName} placeholder="Friday Bouldering Session" />
        <Field
          label="What's the plan? (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Casual bouldering, all levels welcome, tacos after."
          multiline
          numberOfLines={2}
        />
        <View>
          <Text className="font-body-semibold text-[13px] text-muted">Target group size</Text>
          <View className="mt-2 flex-row items-center gap-3">
            <Stepper value={groupMin} min={2} max={groupMax} onDecrement={() => setGroupMin((v) => Math.max(2, v - 1))} onIncrement={() => setGroupMin((v) => Math.min(groupMax, v + 1))} />
            <Muted>to</Muted>
            <Stepper value={groupMax} min={groupMin} max={20} onDecrement={() => setGroupMax((v) => Math.max(groupMin, v - 1))} onIncrement={() => setGroupMax((v) => Math.min(20, v + 1))} />
          </View>
        </View>
      </View>

      {create.isError ? <ErrorState message={create.error.message} /> : null}
      <Button label="Generate code" className="mt-6" loading={create.isPending} disabled={!name} onPress={() => create.mutate()} />
    </Screen>
  );
}
