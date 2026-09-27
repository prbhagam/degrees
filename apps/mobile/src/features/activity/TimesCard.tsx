// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26 (wave 5, Sahith). "When" for the plan: the calendar
// moved here from Host a meetup. Anyone proposes a time, everyone says which they're free for, and any member
// locks one in (groups.scheduled_at). Times are per group, so this shows whether or not a plan exists yet, and
// the group can talk it through in chat. Realtime on group_times/group_time_votes (useGroup) keeps it live.
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import type { GroupResponse, TimeSlot, TimesResponse } from '@degrees/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addMinutes, format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { CalendarClock, Check, Lock, MessageCircle, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Muted } from '@/components/ui';
import { firstName } from '@/features/groups/degrees';
import { queryKeys, useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';

// Round "now" up to the next quarter hour for a sensible default.
function nextQuarterHour(): Date {
  const now = new Date();
  const remainder = 15 - (now.getMinutes() % 15);
  const rounded = addMinutes(now, remainder);
  rounded.setSeconds(0, 0);
  return rounded;
}

const formatSlot = (iso: string) => format(parseISO(iso), 'EEE, MMM d · h:mm a');

function TimeRow({
  slot,
  mine,
  busy,
  onVote,
  onChoose,
  onDelete,
}: {
  slot: TimeSlot;
  mine: boolean;
  busy: boolean;
  onVote: (available: boolean) => void;
  onChoose: () => void;
  onDelete: () => void;
}) {
  const free = slot.availableNames.map(firstName);
  return (
    <View className={`gap-2 rounded-m border px-3.5 py-3 ${slot.chosen ? 'border-sage bg-sage/10' : 'border-line bg-paper'}`}>
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            {slot.chosen ? <Check size={16} color="#5B7A6B" /> : null}
            <Text className="font-body-semibold text-base text-ink">{formatSlot(slot.startsAt)}</Text>
          </View>
          {slot.note ? <Muted>{slot.note}</Muted> : null}
          <Muted>{free.length > 0 ? `Free: ${free.join(', ')}` : 'Nobody yet'}</Muted>
        </View>
        {mine && !slot.chosen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove this time"
            hitSlop={8}
            disabled={busy}
            onPress={onDelete}
            className="h-8 w-8 items-center justify-center rounded-full bg-paper-raised"
          >
            <Trash2 size={14} color="#8A8378" />
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row gap-2">
        <Button
          label={slot.imAvailable ? 'Free ✓' : "I'm free"}
          variant={slot.imAvailable ? 'primary' : 'secondary'}
          className="min-h-9 flex-1 py-1.5"
          disabled={busy}
          onPress={() => onVote(!slot.imAvailable)}
        />
        <Button
          label={slot.chosen ? 'Locked in' : 'Lock in'}
          variant="ghost"
          className="min-h-9 flex-1 py-1.5"
          icon={<Lock size={14} color="#20201C" />}
          disabled={busy || slot.chosen}
          onPress={onChoose}
        />
      </View>
    </View>
  );
}

export function TimesCard({ groupId, group }: { groupId: string; group: GroupResponse }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [proposing, setProposing] = useState(false);
  const [when, setWhen] = useState<Date>(nextQuarterHour);
  const [note, setNote] = useState('');

  // Every time route answers with the full list; write it straight into the group so the card updates at once,
  // then let the refetch settle scheduledAt (and Home).
  const applyTimes = ({ times }: TimesResponse) => {
    queryClient.setQueryData<GroupResponse>(queryKeys.group(groupId), (previous) =>
      previous ? { ...previous, times } : previous,
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.hangouts });
  };

  const propose = useMutation({
    mutationFn: () => api.proposeTime(groupId, { startsAt: when.toISOString(), note: note.trim() || undefined }),
    onSuccess: (response) => {
      applyTimes(response);
      setProposing(false);
      setNote('');
      setWhen(nextQuarterHour());
    },
  });
  const vote = useMutation({
    mutationFn: ({ timeId, available }: { timeId: string; available: boolean }) =>
      api.voteTime(groupId, timeId, { available }),
    onSuccess: applyTimes,
  });
  const choose = useMutation({
    mutationFn: (timeId: string) => api.chooseTime(groupId, timeId),
    onSuccess: applyTimes,
  });
  const remove = useMutation({
    mutationFn: (timeId: string) => api.deleteTime(groupId, timeId),
    onSuccess: applyTimes,
  });
  const busy = vote.isPending || choose.isPending || remove.isPending;
  const error = propose.error ?? vote.error ?? choose.error ?? remove.error;

  const confirmDelete = (slot: TimeSlot) => {
    Alert.alert('Remove this time?', `${formatSlot(slot.startsAt)} comes off the list for everyone.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(slot.id) },
    ]);
  };

  // datetimepicker 9: onChange is deprecated in favour of onValueChange (a date, always) + onDismiss.
  const onPick = (_event: DateTimePickerChangeEvent, date: Date) => setWhen(date);

  const times = [...group.times].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <CalendarClock size={16} color="#5B7A6B" />
        <Heading>When</Heading>
      </View>
      {group.scheduledAt ? (
        <Text className="font-body-semibold text-base text-ink">Locked in · {formatSlot(group.scheduledAt)}</Text>
      ) : (
        <Muted>No time yet. Propose one, and everyone marks the ones they're free for.</Muted>
      )}

      {times.map((slot) => (
        <TimeRow
          key={slot.id}
          slot={slot}
          mine={slot.proposedById === me.data?.id}
          busy={busy}
          onVote={(available) => vote.mutate({ timeId: slot.id, available })}
          onChoose={() => choose.mutate(slot.id)}
          onDelete={() => confirmDelete(slot)}
        />
      ))}

      {proposing ? (
        <View className="gap-3">
          <View className="items-center rounded-m border border-line bg-paper py-2">
            <DateTimePicker
              value={when}
              mode="datetime"
              display="spinner"
              minuteInterval={15}
              minimumDate={new Date()}
              onValueChange={onPick}
            />
          </View>
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. after class" maxLength={120} />
          <View className="flex-row gap-2">
            <Button label="Cancel" variant="ghost" className="flex-1" onPress={() => setProposing(false)} />
            <Button label="Propose" className="flex-1" loading={propose.isPending} onPress={() => propose.mutate()} />
          </View>
        </View>
      ) : (
        <Button label="Propose a time" variant="secondary" onPress={() => setProposing(true)} />
      )}

      <Button
        label="Talk it through in chat"
        variant="ghost"
        icon={<MessageCircle size={16} color="#20201C" />}
        onPress={() => router.push(`/groups/${groupId}/chat`)}
      />
      {error ? <Muted>{error.message}</Muted> : null}
    </Card>
  );
}
