// Owner: Charles (Onboarding & Profile) — Added Sep 26 (bio, AI paragraph, avoids).
// CHANGED Sep 26 (wave 2): prefills from the saved profile, keeps the interests saved in step 1, sends accepted
// generated tags as `hobby` (the server drops `derived` from clients), "Skip for now", and steps advance with
// replace. "Generate tags" is still canned — a real endpoint is Christian's (docs/ROLES.md).
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorState, Field, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { queryKeys, useMe } from '@/features/groups/queries';
import { useOnboardingFlow } from './flow';

const AVOID_OPTIONS = [
  'Alcohol', 'Late nights', 'Large crowds', 'High-intensity activity', 'Loud venues', 'Smoking',
];

// Canned demo output — a real build would call the server, which calls Gemini.
const GENERATED_TAGS = ['Skateboarding', 'Cooking', 'Road Trips', 'Vintage Finds'];

export function AboutScreen() {
  const flow = useOnboardingFlow('about');
  const me = useMe();
  const queryClient = useQueryClient();

  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [yap, setYap] = useState('');
  const [generated, setGenerated] = useState<string[] | null>(null);
  const [acceptedGenerated, setAcceptedGenerated] = useState<string[]>([]);
  const [avoids, setAvoids] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !me.data) return;
    setBio(me.data.bio ?? '');
    setCity(me.data.city ?? '');
    setYap(me.data.aiParagraph ?? '');
    setAvoids(me.data.tags.filter((tag) => tag.kind === 'avoid').map((tag) => tag.label));
    setSeeded(true);
  }, [me.data, seeded]);

  const save = useMutation({
    mutationFn: () => {
      const current = me.data!;
      const interests = current.tags
        .filter((tag) => tag.kind === 'hobby' || tag.kind === 'activity')
        .map((tag) => tag.label);
      const labels = new Set(interests.map((label) => label.toLowerCase()));
      return api.updateProfile({
        displayName: current.displayName ?? '',
        bio,
        aiParagraph: yap,
        city: city.trim(),
        phone: current.phone ?? '',
        pronouns: current.pronouns ?? undefined,
        photoUrl: current.photoUrl ?? undefined,
        tags: [
          ...interests.map((label) => ({ label, kind: 'hobby' as const })),
          ...acceptedGenerated
            .filter((label) => !labels.has(label.toLowerCase()))
            .map((label) => ({ label, kind: 'hobby' as const })),
          ...avoids.map((label) => ({ label, kind: 'avoid' as const })),
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
      <Stack.Screen options={{ title: 'About you', headerBackButtonDisplayMode: 'minimal' }} />
      <Muted>Step 2 of 3</Muted>
      <Text className="mt-2 font-display text-2xl text-ink">Tell us about you.</Text>

      <View className="mt-5 gap-6">
        <Field
          label="Bio — visible to people you've met (1st degree)"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={3}
          placeholder="Third-year CS major, always down for climbing or a new taco spot."
        />

        <Field
          label="Home base"
          hint="Required — this is what we center activity suggestions on."
          value={city}
          onChangeText={setCity}
          placeholder="Midtown Atlanta"
        />

        <Card>
          <Text className="font-body-semibold text-sm text-ink">Or just talk it through</Text>
          <Muted className="mt-1">Write a paragraph about yourself — we'll turn it into tags.</Muted>
          <View className="mt-2.5">
            <Field
              value={yap}
              onChangeText={setYap}
              multiline
              numberOfLines={3}
              placeholder="I grew up skateboarding, got really into cooking during the pandemic..."
            />
          </View>
          <Button
            label="Generate tags from this"
            variant="ghost"
            className="mt-2.5"
            onPress={() => {
              setGenerated(GENERATED_TAGS);
              setAcceptedGenerated(GENERATED_TAGS);
            }}
          />
          {generated ? (
            <View className="mt-3 flex-row flex-wrap gap-2 border-t border-line pt-3">
              {generated.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  selected={acceptedGenerated.includes(label)}
                  onPress={() =>
                    setAcceptedGenerated((current) =>
                      current.includes(label)
                        ? current.filter((item) => item !== label)
                        : [...current, label],
                    )
                  }
                />
              ))}
            </View>
          ) : null}
        </Card>

        <View>
          <Text className="font-body-semibold text-[13px] text-muted">
            Anything you'd rather skip? <Text className="font-body">(optional)</Text>
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {AVOID_OPTIONS.map((label) => (
              <Chip
                key={label}
                label={label}
                selected={avoids.includes(label)}
                onPress={() =>
                  setAvoids((current) =>
                    current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
                  )
                }
              />
            ))}
          </View>
        </View>
      </View>

      {save.isError ? <ErrorState message={save.error.message} /> : null}
      <Button
        label="Next"
        className="mt-6"
        loading={save.isPending}
        disabled={!city.trim() || !me.data}
        onPress={() => save.mutate()}
      />
      <Button label="Skip for now" variant="ghost" onPress={flow.skip} />
    </Screen>
  );
}
