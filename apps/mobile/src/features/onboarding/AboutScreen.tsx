// Owner: Charles (Onboarding & Profile) — Added Sep 26 (bio, AI paragraph, avoids).
// CHANGED Sep 26 (wave 2): prefills from the saved profile, keeps the interests saved in step 1, sends accepted
// generated tags as `hobby` (the server drops `derived` from clients), "Skip for now", and steps advance with
// replace.
// CHANGED Sep 27 (wave 6, Sahith): "Generate tags" is real. It was a hard-coded list (the same four tags for every
// paragraph); now it posts the paragraph to POST /api/profile/tags (Gemini, server-side), shows the interests it
// found (known labels reused so they match everyone else's), and pre-selects any "rather skip" options it mentions.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorState, Field, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { queryKeys, useMe } from '@/features/groups/queries';
import { useOnboardingFlow } from './flow';
import { AVOID_OPTIONS, COMMON_INTERESTS } from './options';

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

  const generate = useMutation({
    mutationFn: () => {
      const saved = (me.data?.tags ?? [])
        .filter((tag) => tag.kind === 'hobby' || tag.kind === 'activity')
        .map((tag) => tag.label);
      return api.extractTags({
        text: yap,
        knownInterests: [...new Set([...COMMON_INTERESTS, ...saved])],
        avoidOptions: AVOID_OPTIONS,
      });
    },
    onSuccess: ({ interests, avoids: mentioned }) => {
      setGenerated(interests);
      setAcceptedGenerated(interests);
      if (mentioned.length > 0) setAvoids((current) => [...new Set([...current, ...mentioned])]);
    },
  });

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
          label="Bio — visible to your 1st degree (people you've met)"
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
            label={generated ? 'Generate again' : 'Generate tags from this'}
            variant="ghost"
            className="mt-2.5"
            loading={generate.isPending}
            disabled={!yap.trim()}
            onPress={() => generate.mutate()}
          />
          {generate.isError ? <Muted className="mt-2">{generate.error.message}</Muted> : null}
          {generated && generated.length === 0 ? (
            <Muted className="mt-2">Nothing to tag in that yet. Mention a few things you like doing.</Muted>
          ) : null}
          {generated && generated.length > 0 ? (
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
          <Muted className="mt-1">Hard rules for every plan you're in — pick "Alcohol" and none of your plans will be a bar.</Muted>
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
