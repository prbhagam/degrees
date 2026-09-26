// Owner: Charles (Onboarding & Profile) — Added Sep 26.
// CHANGED Sep 26 (wave 2): "Change photo" is real — expo-image-picker → Supabase Storage (avatars/<userId>/…,
// a public bucket) → the public URL is saved as photoUrl. Phone edits format as US numbers.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { formatUsPhone } from '@degrees/shared';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Button, Chip, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { pickImage, uploadAvatar } from '@/lib/upload';
import { useMe, queryKeys } from '@/features/groups/queries';

const PRONOUN_OPTIONS = ['She/her', 'He/him', 'They/them', 'Other'];

export function EditProfileScreen() {
  const router = useRouter();
  const me = useMe();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [pronoun, setPronoun] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Seed local state once the real profile loads — this screen edits a subset of fields and passes the rest of
  // `me` straight through unchanged, so it never wipes tags, the AI paragraph, or city just because this form
  // doesn't show them.
  useEffect(() => {
    if (me.data) {
      setName(me.data.displayName ?? '');
      setPronoun(me.data.pronouns);
      setBio(me.data.bio ?? '');
      setPhone(me.data.phone ? formatUsPhone(me.data.phone) : '');
      setPhotoUrl(me.data.photoUrl);
    }
  }, [me.data]);

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
    mutationFn: () => {
      const current = me.data!;
      return api.updateProfile({
        displayName: name,
        bio,
        aiParagraph: current.aiParagraph ?? '',
        city: current.city ?? '',
        phone,
        pronouns: pronoun ?? undefined,
        photoUrl: photoUrl ?? undefined,
        tags: current.tags,
      });
    },
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

      <View className="mt-6 gap-4">
        <Field label="Full name" value={name} onChangeText={setName} />

        <View>
          <Text className="font-body-semibold text-[13px] text-muted">Pronouns</Text>
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
          label="Bio — visible to 1st-degree connections"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={3}
        />

        <Field
          label="Phone number"
          value={phone}
          onChangeText={(text) => setPhone(formatUsPhone(text))}
          keyboardType="phone-pad"
          maxLength={14}
          placeholder="(404) 555-0148"
        />
      </View>

      {save.isError ? <ErrorState message={save.error.message} /> : null}
      <Button label="Save" className="mt-6" loading={save.isPending} onPress={() => save.mutate()} />
    </Screen>
  );
}
