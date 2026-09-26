// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md. Also reused as a settings screen
// from Profile (same screen, same primary action — a common enough pattern to not need a fork).
// CHANGED Sep 26 (wave 2): prefills saved values, "Skip for now" during onboarding, the group-size row no
// longer collapses (each stepper has its own labelled column), and finishing collapses the auth/onboarding
// stack so nothing can be swiped back to.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import type { Frequency } from '@degrees/shared';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorState, Muted, Screen, Stepper } from '@/components/ui';
import { queryKeys, useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';
import { useOnboardingFlow } from './flow';

const DEGREES = [
  { value: 1, label: 'Just my friends', desc: 'People you have met in person.', reach: '12' },
  { value: 2, label: 'Friends of friends', desc: 'One introduction away from you.', reach: '140', recommended: true },
  { value: 3, label: 'Wider network', desc: 'The whole reachable circle.', reach: '900' },
];

const DISTANCES = ['Walking distance', 'Same city', 'Anywhere'] as const;
type Distance = (typeof DISTANCES)[number];
const DISTANCE_MI: Record<Distance, number> = { 'Walking distance': 1, 'Same city': 15, Anywhere: 200 };
const COSTS = ['Free', '$', '$$', '$$$'] as const;
type Cost = (typeof COSTS)[number];
const COST_CENTS: Record<Cost, [number, number]> = {
  Free: [0, 0], '$': [0, 1500], '$$': [1000, 3500], '$$$': [3000, 8000],
};
const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'few_times_week', label: 'A few times a week' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

function distanceFor(maxTravelMi: number): Distance {
  if (maxTravelMi <= DISTANCE_MI['Walking distance']) return 'Walking distance';
  if (maxTravelMi <= DISTANCE_MI['Same city']) return 'Same city';
  return 'Anywhere';
}

function costFor(maxCents: number): Cost {
  if (maxCents <= 0) return 'Free';
  if (maxCents <= 1500) return '$';
  if (maxCents <= 3500) return '$$';
  return '$$$';
}

export function PreferencesScreen() {
  const flow = useOnboardingFlow('preferences');
  const me = useMe();
  const queryClient = useQueryClient();
  const router = useRouter();
  const segments = useSegments();
  // Opened from Profile as settings (not under /onboarding): no step counter, no skip, just save and go back.
  const inOnboarding = (segments[0] as string | undefined) === 'onboarding';

  const [degree, setDegree] = useState(2);
  const [groupMin, setGroupMin] = useState(3);
  const [groupMax, setGroupMax] = useState(6);
  const [distance, setDistance] = useState<Distance>('Same city');
  const [cost, setCost] = useState<Cost>('$');
  const [frequency, setFrequency] = useState<Frequency>('biweekly');
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !me.data) return;
    const saved = me.data.preferences;
    if (saved) {
      setDegree(saved.maxDegrees);
      setGroupMin(saved.groupSizeMin);
      setGroupMax(saved.groupSizeMax);
      setDistance(distanceFor(saved.maxTravelMi));
      setCost(costFor(saved.costMaxCents));
      setFrequency(saved.frequency);
    }
    setSeeded(true);
  }, [me.data, seeded]);

  const save = useMutation({
    mutationFn: () =>
      api.updatePreferences({
        costMinCents: COST_CENTS[cost][0],
        costMaxCents: COST_CENTS[cost][1],
        maxTravelMi: DISTANCE_MI[distance],
        frequency,
        groupSizeMin: groupMin,
        groupSizeMax: groupMax,
        maxDegrees: degree,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      if (inOnboarding) flow.next();
      else router.back();
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Preferences', headerBackButtonDisplayMode: 'minimal' }} />
      {inOnboarding ? <Muted>Step 3 of 3</Muted> : null}
      <Text className="mt-2 font-display text-2xl text-ink">How far should we reach?</Text>
      <Body className="mt-1 text-muted">The one dial that matters most — you can change this anytime.</Body>

      <View className="mt-4 gap-2.5">
        {DEGREES.map((option) => {
          const active = option.value === degree;
          return (
            <Pressable
              key={option.value}
              onPress={() => setDegree(option.value)}
              className={`flex-row items-center gap-3 rounded-l border bg-paper-raised p-3.5 ${active ? 'border-2 border-ink' : 'border-line'}`}
            >
              <View
                className={`h-10 w-10 items-center justify-center rounded-full ${active ? 'bg-ink' : 'bg-line'}`}
              >
                <Text className={`font-display text-[15px] ${active ? 'text-paper' : 'text-muted'}`}>
                  {option.value}°
                </Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="font-body-semibold text-sm text-ink">{option.label}</Text>
                  {option.recommended ? (
                    <View className="rounded-full bg-paper px-1.5 py-0.5">
                      <Text className="font-body-semibold text-[10px] text-sage">RECOMMENDED</Text>
                    </View>
                  ) : null}
                </View>
                <Muted>{option.desc}</Muted>
              </View>
              <View className="items-end">
                <Text className="font-display text-[15px] text-ink">{option.reach}</Text>
                <Muted>people</Muted>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Card className="mt-5">
        <View className="gap-3 border-b border-line pb-4">
          <Text className="font-body-semibold text-sm text-ink">Group size</Text>
          <View className="flex-row items-center justify-between">
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
          <Muted>{groupMin}–{groupMax} people per hangout</Muted>
        </View>

        <View className="gap-2 border-b border-line py-4">
          <Text className="font-body-semibold text-sm text-ink">Distance</Text>
          <View className="flex-row flex-wrap gap-2">
            {DISTANCES.map((label) => (
              <Chip key={label} label={label} selected={distance === label} onPress={() => setDistance(label)} />
            ))}
          </View>
        </View>

        <View className="gap-2 border-b border-line py-4">
          <Text className="font-body-semibold text-sm text-ink">Cost per hangout</Text>
          <View className="flex-row gap-2">
            {COSTS.map((label) => (
              <Chip key={label} label={label} selected={cost === label} onPress={() => setCost(label)} />
            ))}
          </View>
        </View>

        <View className="gap-2 pt-4">
          <Text className="font-body-semibold text-sm text-ink">How often</Text>
          <View className="flex-row flex-wrap gap-2">
            {FREQUENCIES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={frequency === option.value}
                onPress={() => setFrequency(option.value)}
              />
            ))}
          </View>
        </View>
      </Card>

      {save.isError ? <ErrorState message={save.error.message} /> : null}
      <Button label={inOnboarding ? 'Finish' : 'Save'} className="mt-5" loading={save.isPending} onPress={() => save.mutate()} />
      {inOnboarding ? <Button label="Skip for now" variant="ghost" onPress={flow.skip} /> : null}
    </Screen>
  );
}
