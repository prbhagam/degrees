// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26.
// CHANGED Sep 26 (wave 2): "Host a meetup". Collects when it happens (the join code expires 24h after that
// time, or after creation if unscheduled), then opens the meetup's group screen, which has the code + QR,
// the lobby, icebreakers, chat, plan, and photos. No separate lobby screen.
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addMinutes, format } from 'date-fns';
import { Stack, useRouter } from 'expo-router';
import { CalendarClock, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { queryKeys } from '@/features/groups/queries';
import { Button, ErrorState, Field, Muted, Screen, Stepper } from '@/components/ui';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session';

// Round "now" up to the next quarter hour for a sensible default.
function nextQuarterHour(): Date {
  const now = new Date();
  const remainder = 15 - (now.getMinutes() % 15);
  const rounded = addMinutes(now, remainder);
  rounded.setSeconds(0, 0);
  return rounded;
}

export function CreateEventScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveEvent = useSessionStore((state) => state.setActiveEvent);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupMin, setGroupMin] = useState(3);
  const [groupMax, setGroupMax] = useState(6);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(nextQuarterHour);
  const [showPicker, setShowPicker] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api.createEvent({
        name: name.trim(),
        description: description.trim() || undefined,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
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

  const onPick = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setScheduledAt(date);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Host a meetup' }} />
      <Text className="font-display text-2xl text-ink">Host a meetup</Text>
      <Muted className="mt-1.5">
        You'll get a code. Anyone who scans or types it in person joins — and when you end the meetup,
        everyone who came is connected.
      </Muted>

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

        <View className="gap-1.5">
          <Text className="font-body-semibold text-[13px] text-muted">When</Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowPicker((value) => !value)}
              className="flex-1 flex-row items-center gap-2 rounded-m border border-line bg-paper-raised px-4 py-3"
            >
              <CalendarClock size={18} color="#8A8378" />
              <Text className={`font-body text-base ${scheduledAt ? 'text-ink' : 'text-muted'}`}>
                {scheduledAt ? format(scheduledAt, 'EEE, MMM d · h:mm a') : 'Not scheduled (starts now)'}
              </Text>
            </Pressable>
            {scheduledAt ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear time"
                onPress={() => {
                  setScheduledAt(null);
                  setShowPicker(false);
                }}
                className="h-11 w-11 items-center justify-center rounded-m border border-line bg-paper-raised"
              >
                <X size={16} color="#20201C" />
              </Pressable>
            ) : null}
          </View>
          {showPicker ? (
            <View className="items-center rounded-m border border-line bg-paper-raised py-2">
              <DateTimePicker
                value={scheduledAt ?? nextQuarterHour()}
                mode="datetime"
                display="spinner"
                minuteInterval={5}
                minimumDate={new Date()}
                onChange={onPick}
              />
            </View>
          ) : null}
          <Muted>The join code stops working 24 hours after this.</Muted>
        </View>

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
