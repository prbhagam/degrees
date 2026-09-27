// Owner: Charles (Onboarding & Profile) — Added Sep 26.
// CHANGED Sep 26 (wave 2): "Change photo" is real — expo-image-picker → Supabase Storage (avatars/<userId>/…,
// a public bucket) → the public URL is saved as photoUrl. Phone edits format as US numbers.
// CHANGED Sep 26 (wave 3): everything onboarding collected is editable here — interests, "rather skip" avoids,
// home base, and the in-your-words paragraph — not just name/bio/phone. Derived tags (what feedback taught the
// matcher) are server-owned and shown read-only.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { formatUsPhone } from '@degrees/shared';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Button, Chip, ErrorState, Field, LoadingState, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { pickImage, uploadAvatar } from '@/lib/upload';
import { useMe, queryKeys } from '@/features/groups/queries';
import { AVOID_OPTIONS, COMMON_INTERESTS, toggleLabel } from '@/features/onboarding/options';

const PRONOUN_OPTIONS = ['She/her', 'He/him', 'They/them', 'Other'];

function Label({ children }: { children: string }) {
  return <Text className="font-body-semibold text-[13px] text-muted">{children}</Text>;
}

export function EditProfileScreen() {
  const router = useRouter();
  const me = useMe();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [pronoun, setPronoun] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [yap, setYap] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [avoids, setAvoids] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Seed local state once the real profile loads. Seeding once (not on every refetch) keeps a background refetch
  // from wiping half-typed edits.
  useEffect(() => {
    if (seeded || !me.data) return;
    setName(me.data.displayName ?? '');
    setPronoun(me.data.pronouns);
    setBio(me.data.bio ?? '');
    setCity(me.data.city ?? '');
    setPhone(me.data.phone ? formatUsPhone(me.data.phone) : '');
    setPhotoUrl(me.data.photoUrl);
    setYap(me.data.aiParagraph ?? '');
    const saved = me.data.tags.filter((tag) => tag.kind === 'hobby' || tag.kind === 'activity').map((tag) => tag.label);
    setInterests(saved);
    setCustom(saved.filter((label) => !COMMON_INTERESTS.includes(label)));
    setAvoids(me.data.tags.filter((tag) => tag.kind === 'avoid').map((tag) => tag.label));
    setSeeded(true);
  }, [me.data, seeded]);

  const allInterests = [...COMMON_INTERESTS, ...custom];
  const derived = me.data?.tags.filter((tag) => tag.kind === 'derived').map((tag) => tag.label) ?? [];

  function addCustom() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const match = allInterests.find((label) => label.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      if (!interests.includes(match)) setInterests((current) => [...current, match]);
    } else {
      setCustom((current) => [...current, trimmed]);
      setInterests((current) => [...current, trimmed]);
    }
    setQuery('');
  }

  const changePhoto = useMutation({
    mutationFn: async () => {
      const image = await pickImage({ square: true });
      if (!image) return null;
      return uploadAvatar(me.data!.id, image);
    },
    onSuccess: (url) => {
      if (url) setPhotoUrl(url);
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api.updateProfile({
        displayName: name.trim(),
        bio,
        aiParagraph: yap,
        city: city.trim(),
        phone,
        pronouns: pronoun ?? undefined,
        photoUrl: photoUrl ?? undefined,
        // Derived tags are left out on purpose: the server keeps them regardless of what a profile edit sends.
        tags: [
          ...interests.map((label) => ({ label, kind: 'hobby' as const })),
          ...avoids.map((label) => ({ label, kind: 'avoid' as const })),
        ],
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      router.back();
    },
  });

  if (me.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading profile…" />
      </Screen>
    );
  }
  if (me.isError) {
    return (
      <Screen>
        <ErrorState message={me.error.message} onRetry={() => void me.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Edit profile',
          headerRight: () => (
            <Text onPress={() => save.mutate()} className="font-body-semibold text-ember-ink">
              Save
            </Text>
          ),
        }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change photo"
        onPress={() => changePhoto.mutate()}
        disabled={changePhoto.isPending}
        className="items-center gap-2"
      >
        <Avatar name={name || 'You'} photoUrl={photoUrl} size="lg" tone="you" />
        <Text className="font-body-semibold text-xs text-ember-ink">
          {changePhoto.isPending ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add a photo'}
        </Text>
      </Pressable>
      {changePhoto.isError ? <ErrorState message={changePhoto.error.message} /> : null}

      <View className="mt-6 gap-5">
        <Field label="Full name" value={name} onChangeText={setName} />

        <View>
          <Label>Pronouns</Label>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {PRONOUN_OPTIONS.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={pronoun === option}
                onPress={() => setPronoun(pronoun === option ? null : option)}
              />
            ))}
          </View>
        </View>

        <Field
          label="Bio — visible to your 1st degree"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={3}
        />

        <Field
          label="Home base"
          hint="Plans are centred here, within the distance you set in Degrees & preferences."
          value={city}
          onChangeText={setCity}
          placeholder="Midtown Atlanta"
        />

        <Field
          label="Phone number"
          value={phone}
          onChangeText={(text) => setPhone(formatUsPhone(text))}
          keyboardType="phone-pad"
          maxLength={14}
          placeholder="(404) 555-0148"
        />

        <View className="gap-2">
          <Label>Interests</Label>
          <Muted>What we match on when we reach past your 1st degree.</Muted>
          <View className="flex-row items-stretch gap-2">
            <View className="flex-1">
              <Field
                value={query}
                onChangeText={setQuery}
                placeholder="Add your own…"
                onSubmitEditing={addCustom}
                returnKeyType="done"
              />
            </View>
            <Button label="Add" onPress={addCustom} disabled={!query.trim()} className="px-5" />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {allInterests.map((label) => (
              <Chip
                key={label}
                label={label}
                selected={interests.includes(label)}
                dashed={custom.includes(label) && !interests.includes(label)}
                onPress={() => setInterests((current) => toggleLabel(current, label))}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Label>Rather skip</Label>
          <Muted>Hard rules for every plan you're in — pick "Alcohol" and no plan of yours will be a bar.</Muted>
          <View className="flex-row flex-wrap gap-2">
            {AVOID_OPTIONS.map((label) => (
              <Chip
                key={label}
                label={label}
                selected={avoids.includes(label)}
                onPress={() => setAvoids((current) => toggleLabel(current, label))}
              />
            ))}
          </View>
        </View>

        <Field
          label="In your words"
          hint="A paragraph about you. It feeds matching alongside your interests."
          value={yap}
          onChangeText={setYap}
          multiline
          numberOfLines={3}
          placeholder="I grew up skateboarding, got really into cooking during the pandemic..."
        />

        {derived.length > 0 ? (
          <View className="gap-2">
            <Label>Learned from your feedback</Label>
            <Muted>Degrees added these after hangouts. They can't be edited here.</Muted>
            <View className="flex-row flex-wrap gap-2">
              {derived.map((label) => (
                <Chip key={label} label={label} dashed />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {save.isError ? <ErrorState message={save.error.message} /> : null}
      <Button label="Save" className="mt-6" loading={save.isPending} onPress={() => save.mutate()} />
    </Screen>
  );
}
