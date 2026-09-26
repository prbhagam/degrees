// Owner: Charles (Onboarding & Profile) — Added Sep 26 (bio, AI paragraph, avoids).
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorState, Field, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/features/groups/queries';

const AVOID_OPTIONS = [
  'Alcohol', 'Late nights', 'Large crowds', 'High-intensity activity', 'Loud venues', 'Smoking',
];

// Canned demo output — a real build would call the server, which calls Gemini.
const GENERATED_TAGS = ['Skateboarding', 'Cooking', 'Road Trips', 'Vintage Finds'];

export function AboutScreen() {
  const router = useRouter();
  const { tags: tagsParam } = useLocalSearchParams<{ tags?: string }>();
  const interestTags = (tagsParam ?? '').split('|').filter(Boolean);
  const me = useMe();

  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [yap, setYap] = useState('');
  const [generated, setGenerated] = useState<string[] | null>(null);
  const [acceptedGenerated, setAcceptedGenerated] = useState<string[]>([]);
  const [avoids, setAvoids] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: () =>
      api.updateProfile({
        displayName: me.data?.displayName ?? '',
        bio,
        aiParagraph: yap,
        city,
        phone: me.data?.phone ?? '',
        pronouns: me.data?.pronouns ?? undefined,
        photoUrl: me.data?.photoUrl ?? undefined,
        tags: [
          ...interestTags.map((label) => ({ label, kind: 'hobby' as const })),
          ...acceptedGenerated.map((label) => ({ label, kind: 'derived' as const })),
          ...avoids.map((label) => ({ label, kind: 'avoid' as const })),
        ],
      }),
    onSuccess: () => router.push('/onboarding/preferences'),
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
        disabled={!city.trim()}
        onPress={() => save.mutate()}
      />
    </Screen>
  );
}
