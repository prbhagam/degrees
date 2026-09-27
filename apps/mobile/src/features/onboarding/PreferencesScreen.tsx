// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md. Also reused as a settings screen
// from Profile (same screen, same primary action — a common enough pattern to not need a fork).
// CHANGED Sep 26 (wave 2): prefills saved values, "Skip for now" during onboarding, the group-size row no
// longer collapses (each stepper has its own labelled column), and finishing collapses the auth/onboarding
// stack so nothing can be swiped back to.
// CHANGED Sep 27 (wave 6, Sahith): the degree dial shows real headcounts (GET /api/graph/reach) instead of a made-up
// 12 / 140 / 900. A new account with no connections sees an honest 0 plus what's typical here once you've met people.
// Group size is four presets, not two steppers capped at an arbitrary 20: matched groups never pass
// MATCHED_GROUP_MAX (the matcher's hard cap), so "No preference" is the whole range; meetups have no cap at all.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MATCHED_GROUP_MAX, type Frequency, type ReachCount } from '@degrees/shared';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorState, Muted, Screen } from '@/components/ui';
import { queryKeys, useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';
import { useOnboardingFlow } from './flow';

// You are degree 0. Each step out is one "we met in person" edge further from you.
const DEGREES = [
  { value: 1, label: '1st degree only', desc: 'Only people you have met in person.' },
  { value: 2, label: 'Up to 2nd degree', desc: 'Your 1st degree, plus the people they have met.', recommended: true },
  { value: 3, label: 'Up to 3rd degree', desc: 'Three introductions out — the whole reachable graph.' },
];

function countAt(counts: ReachCount[] | null | undefined, degree: number): number | null {
  return counts?.find((count) => count.degree === degree)?.people ?? null;
}

// Wave 6: sizes as presets (counting you). The largest stops at the matcher's cap; "No preference" is 2 to the cap.
const SIZES = [
  { key: 'small', label: 'Small', range: [2, 4] },
  { key: 'medium', label: 'Medium', range: [4, 6] },
  { key: 'big', label: 'Big', range: [6, MATCHED_GROUP_MAX] },
  { key: 'any', label: 'No preference', range: [2, MATCHED_GROUP_MAX] },
] as const;
type SizeKey = (typeof SIZES)[number]['key'];

// Older saves came from the steppers (any min/max up to 20): pick the preset whose range overlaps it most.
function sizeFor(min: number, max: number): SizeKey {
  const hi = Math.min(max, MATCHED_GROUP_MAX);
  const lo = Math.min(min, hi);
  if (lo <= 2 && hi >= MATCHED_GROUP_MAX) return 'any';
  let best: SizeKey = 'medium';
  let bestOverlap = -Infinity;
  for (const size of SIZES) {
    if (size.key === 'any') continue;
    const overlap = Math.min(hi, size.range[1]) - Math.max(lo, size.range[0]);
    if (overlap > bestOverlap) {
      best = size.key;
      bestOverlap = overlap;
    }
  }
  return best;
}

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
  // Opened from Profile as settings (`mode=settings`): no step counter, no skip, just save and go back.
  // Wave 3: this used to key off the URL segment, but the route is /onboarding/preferences either way, so a
  // settings save ran the onboarding exit (collapse the stack, replace with a home path the router didn't know)
  // and landed on "Unmatched Route".
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const inOnboarding = mode !== 'settings';

  const [degree, setDegree] = useState(2);
  const [size, setSize] = useState<SizeKey>('medium');
  const [distance, setDistance] = useState<Distance>('Same city');
  const [cost, setCost] = useState<Cost>('$');
  const [frequency, setFrequency] = useState<Frequency>('biweekly');
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !me.data) return;
    const saved = me.data.preferences;
    if (saved) {
      setDegree(saved.maxDegrees);
      setSize(sizeFor(saved.groupSizeMin, saved.groupSizeMax));
      setDistance(distanceFor(saved.maxTravelMi));
      setCost(costFor(saved.costMaxCents));
      setFrequency(saved.frequency);
    }
    setSeeded(true);
  }, [me.data, seeded]);

  const reach = useQuery({ queryKey: queryKeys.reach, queryFn: api.getReach });
  const hasConnections = (countAt(reach.data?.mine, 1) ?? 0) > 0;
  const [groupMin, groupMax] = SIZES.find((option) => option.key === size)!.range;

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
      <Stack.Screen options={{ title: 'Degrees & preferences', headerBackButtonDisplayMode: 'minimal' }} />
      {inOnboarding ? <Muted>Step 3 of 3</Muted> : null}
      <Text className="mt-2 font-display text-2xl text-ink">How many degrees out should we reach?</Text>
      <Body className="mt-1 text-muted">
        People you've met are your 1st degree; their friends are your 2nd. This is the dial that matters most —
        change it anytime.
      </Body>

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
                <Text className="font-display text-[15px] text-ink">
                  {countAt(reach.data?.mine, option.value) ?? '–'}
                </Text>
                {reach.data && !hasConnections && countAt(reach.data.typical, option.value) !== null ? (
                  <Muted>~{countAt(reach.data.typical, option.value)} typical</Muted>
                ) : (
                  <Muted>people</Muted>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {reach.data && !hasConnections ? (
        <Muted className="mt-2">
          You haven't met anyone on Degrees yet, so every ring is empty. Scan one person's code and they fill in
          {reach.data.typical ? ' — "typical" is what people here reach once they have.' : '.'}
        </Muted>
      ) : null}

      <Card className="mt-5">
        <View className="gap-3 border-b border-line pb-4">
          <Text className="font-body-semibold text-sm text-ink">Group size</Text>
          <View className="flex-row flex-wrap gap-2">
            {SIZES.map((option) => (
              <Chip key={option.key} label={option.label} selected={size === option.key} onPress={() => setSize(option.key)} />
            ))}
          </View>
          <Muted>
            {size === 'any'
              ? `Whatever fits — matched groups go up to ${MATCHED_GROUP_MAX}. Meetups have no limit.`
              : `${groupMin}–${groupMax} people per hangout, counting you. A good group can land just outside it.`}
          </Muted>
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
