// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26 (wave 5, Sahith). "When" for the plan: the calendar
// moved here from Host a meetup. Anyone proposes a time, everyone says which they're free for, and any member
// locks one in (groups.scheduled_at). Times are per group, so this shows whether or not a plan exists yet, and
// the group can talk it through in chat. Realtime on group_times/group_time_votes (useGroup) keeps it live.
// CHANGED Sep 27 (Sahith): a plan for a real event (a game, a show — `activity.startsAt`) has a hard date, so the
// server locks the event's start in as the group's time (syncEventTime) and this card shows it as fixed: no
// proposing or locking other times, just "I can make it". The picker is WhenPicker (day chips + calendar, time chips
// + wheel), replacing a single datetime spinner that clipped and ignored the app's colours.
import type { GroupResponse, TimeSlot, TimesResponse } from '@degrees/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import { CalendarClock, Check, Lock, MessageCircle, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Muted } from '@/components/ui';
import { firstName } from '@/features/groups/degrees';
import { queryKeys, useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';
import { nextQuarterHour, WhenPicker } from './WhenPicker';

const formatSlot = (iso: string) => format(parseISO(iso), 'EEE, MMM d · h:mm a');

function TimeRow({
  slot,
  mine,
  busy,
  onVote,
  onChoose,
  onDelete,
  fixed = false,
}: {
  slot: TimeSlot;
  mine: boolean;
  busy: boolean;
  fixed?: boolean;
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
          {slot.note && !slot.fromEvent ? <Muted>{slot.note}</Muted> : null}
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
          label={fixed ? (slot.imAvailable ? "I'm in ✓" : 'I can make it') : slot.imAvailable ? 'Free ✓' : "I'm free"}
          variant={slot.imAvailable ? 'primary' : 'secondary'}
          className="min-h-9 flex-1 py-1.5"
          disabled={busy}
          onPress={() => onVote(!slot.imAvailable)}
        />
        {fixed ? null : <Button
          label={slot.chosen ? 'Locked in' : 'Lock in'}
          variant="ghost"
          className="min-h-9 flex-1 py-1.5"
          icon={<Lock size={14} color="#20201C" />}
          disabled={busy || slot.chosen}
          onPress={onChoose}
        />}
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

  const times = [...group.times].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  // The plan is a real event with a future start: that's the time, full stop.
  const eventStart =
    group.activity?.startsAt && new Date(group.activity.startsAt).getTime() > Date.now() ? group.activity.startsAt : null;
  const eventSlot = eventStart ? times.find((slot) => slot.fromEvent || slot.chosen) : undefined;
  const inPast = when.getTime() <= Date.now();

  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <CalendarClock size={16} color="#5B7A6B" />
        <Heading>When</Heading>
      </View>
      {eventStart ? (
        <>
          <Text className="font-body-semibold text-base text-ink">Set by the event · {formatSlot(eventStart)}</Text>
          <Muted>This plan is a real event, so its start time is locked in for everyone. Say whether you can make it.</Muted>
          {eventSlot ? (
            <TimeRow
              slot={eventSlot}
              mine={false}
              busy={busy}
              fixed
              onVote={(available) => vote.mutate({ timeId: eventSlot.id, available })}
              onChoose={() => undefined}
              onDelete={() => undefined}
            />
          ) : null}
        </>
      ) : group.scheduledAt ? (
        <Text className="font-body-semibold text-base text-ink">Locked in · {formatSlot(group.scheduledAt)}</Text>
      ) : (
        <Muted>No time yet. Propose one, and everyone marks the ones they're free for.</Muted>
      )}

      {eventStart ? null : times.map((slot) => (
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

      {eventStart ? null : proposing ? (
        <View className="gap-3 border-t border-line pt-3">
          <WhenPicker value={when} onChange={setWhen} />
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. after class" maxLength={120} />
          <View className="flex-row gap-2">
            <Button label="Cancel" variant="ghost" className="flex-1" onPress={() => setProposing(false)} />
            <Button
              label="Propose"
              className="flex-1"
              loading={propose.isPending}
              disabled={inPast}
              onPress={() => propose.mutate()}
            />
          </View>
          {inPast ? <Muted>That time has already passed. Pick a later one.</Muted> : null}
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
