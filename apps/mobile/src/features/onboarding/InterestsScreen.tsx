// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
// CHANGED Sep 26 (wave 2): prefills from the saved profile, saves interests on Next (so a skip after this step
// still keeps them), "Skip for now", and the search/add row is aligned (the Add button no longer carries a
// top margin meant for a label the field doesn't have).
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Chip, ErrorState, Field, Muted, Screen } from '@/components/ui';
import { queryKeys, useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';
import { useOnboardingFlow } from './flow';
import { COMMON_INTERESTS } from './options';

export function InterestsScreen() {
  const flow = useOnboardingFlow('interests');
  const me = useMe();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seed once from what's already saved (hobby/activity tags), so reopening this step doesn't wipe them.
  useEffect(() => {
    if (seeded || !me.data) return;
    const saved = me.data.tags
      .filter((tag) => tag.kind === 'hobby' || tag.kind === 'activity')
      .map((tag) => tag.label);
    setSelected(saved);
    setCustom(saved.filter((label) => !COMMON_INTERESTS.includes(label)));
    setSeeded(true);
  }, [me.data, seeded]);

  const all = [...COMMON_INTERESTS, ...custom];

  function toggle(label: string) {
    setSelected((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  function addCustom() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const match = all.find((label) => label.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      if (!selected.includes(match)) toggle(match);
    } else {
      setCustom((current) => [...current, trimmed]);
      setSelected((current) => [...current, trimmed]);
    }
    setQuery('');
  }

  // Interests are saved here (not only at the end of About) so a skip after this step keeps them. Every other
  // profile field is passed through from `me` untouched.
  const save = useMutation({
    mutationFn: () => {
      const current = me.data!;
      return api.updateProfile({
        displayName: current.displayName ?? '',
        bio: current.bio ?? '',
        aiParagraph: current.aiParagraph ?? '',
        city: current.city ?? '',
        phone: current.phone ?? '',
        pronouns: current.pronouns ?? undefined,
        photoUrl: current.photoUrl ?? undefined,
        tags: [
          ...selected.map((label) => ({ label, kind: 'hobby' as const })),
          ...current.tags.filter((tag) => tag.kind === 'avoid'),
        ],
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      flow.next();
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Interests', headerBackButtonDisplayMode: 'minimal' }} />
      <Muted>Step 1 of 3</Muted>
      <Text className="mt-2 font-display text-2xl text-ink">What are you into?</Text>
      <Body className="mt-1 text-muted">
        Pick a few, or add your own. This is what Degrees matches on when it reaches past your 1st degree.
      </Body>

      <View className="mt-4 flex-row items-stretch gap-2">
        <View className="flex-1">
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Search or add your own..."
            onSubmitEditing={addCustom}
            returnKeyType="done"
          />
        </View>
        <Button label="Add" onPress={addCustom} disabled={!query.trim()} className="px-5" />
      </View>
      <Muted className="mt-1.5">
        Common interests match you with a group faster. Specific ones still save to your profile.
      </Muted>

      <View className="mt-5 flex-row flex-wrap gap-2.5">
        {all.map((label) => (
          <Chip
            key={label}
            label={label}
            selected={selected.includes(label)}
            dashed={custom.includes(label) && !selected.includes(label)}
            onPress={() => toggle(label)}
          />
        ))}
      </View>

      <Muted className="mt-6">{selected.length} selected</Muted>
      {save.isError ? <ErrorState message={save.error.message} /> : null}
      <Button
        label="Next"
        className="mt-3"
        loading={save.isPending}
        disabled={selected.length === 0 || !me.data}
        onPress={() => save.mutate()}
      />
      <Button label="Skip for now" variant="ghost" onPress={flow.skip} />
    </Screen>
  );
}
