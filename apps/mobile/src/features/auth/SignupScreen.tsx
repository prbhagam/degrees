// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md. Signup via the server wired by Sahith (Sep 26).
// CHANGED Sep 27: signup collects a real email (the login) alongside the username (the @handle); the account's
// auth email is that address, no longer `<username>@degrees.demo`.
// CHANGED Sep 26 (wave 2): phone formats as (404) 555-0148 while typing (US only for now), password has a
// show/hide toggle (Field), and onboarding is entered with replace so it isn't left under the app.
// CHANGED Sep 27 (wave 6): an optional profile photo up top. It's picked before the account exists and uploaded right
// after sign-in (the avatars bucket only takes writes into your own folder), then saved with PUT /api/profile/photo.
// A failed upload doesn't block signup; Edit profile can set it later. The form scrolls clear of the keyboard now
// (Screen: automaticallyAdjustKeyboardInsets).
import { useState } from 'react';
import { formatUsPhone, signupRequestSchema } from '@degrees/shared';
import { useMutation } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { Image, Pressable, Text, View } from 'react-native';
import { Body, Button, Chip, ErrorState, Field, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { pickImage, uploadAvatar, type PickedImage } from '@/lib/upload';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';
import { useSessionStore } from '@/stores/session';

const PRONOUN_OPTIONS = ['She/her', 'He/him', 'They/them', 'Other'];

export function SignupScreen() {
  const router = useRouter();
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);
  const setOnboardingSkippedBy = useSessionStore((state) => state.setOnboardingSkippedBy);
  const [name, setName] = useState('');
  const [pronoun, setPronoun] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const choosePhoto = async () => {
    setPhotoError(null);
    try {
      const picked = await pickImage({ square: true });
      if (picked) setPhoto(picked);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Could not open your photos.');
    }
  };

  const signup = useMutation({
    mutationFn: async () => {
      const parsed = signupRequestSchema.safeParse({
        email,
        username,
        password,
        displayName: name,
        phone,
        pronouns: pronoun ?? undefined,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
      }
      // The server creates the account (already confirmed) and the profile row in one step;
      // Interests/About/Preferences fill in the rest.
      await api.signup(parsed.data);
      if (!isSupabaseEnvironmentUnset()) {
        const { error } = await getSupabaseClient().auth.signInWithPassword({
          email: parsed.data.email,
          password,
        });
        if (error) throw new Error(error.message);
      }
      const me = await api.getMe();
      if (photo) {
        try {
          const photoUrl = await uploadAvatar(me.id, photo);
          await api.updatePhoto({ photoUrl });
          return { ...me, photoUrl };
        } catch (error) {
          console.warn('[signup] profile photo upload failed; continuing without it:', error);
        }
      }
      return me;
    },
    onSuccess: (me) => {
      setCurrentUser(me);
      setOnboardingSkippedBy(null);
      router.replace('/onboarding/interests');
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Sign up', headerBackButtonDisplayMode: 'minimal' }} />
      <Text className="font-display text-2xl text-ink">Create your account</Text>
      <Body className="mt-1 text-muted">Takes about two minutes.</Body>

      <View className="mt-6 items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={photo ? 'Change profile photo' : 'Add a profile photo'}
          onPress={() => void choosePhoto()}
          className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line bg-paper-raised"
        >
          {photo ? (
            <Image source={{ uri: photo.uri }} className="h-24 w-24" accessibilityIgnoresInvertColors />
          ) : (
            <Camera size={26} color="#8A8378" />
          )}
        </Pressable>
        <Muted>{photo ? 'Tap to change' : 'Add a photo (optional)'}</Muted>
        {photoError ? <Muted className="text-ember-ink">{photoError}</Muted> : null}
      </View>

      <View className="mt-4 gap-4">
        <Field label="Full name" value={name} onChangeText={setName} placeholder="Alexandra Okonkwo-Bennett" />

        <View>
          <Text className="font-body-semibold text-[13px] text-muted">
            Pronouns <Text className="font-body text-muted">(optional)</Text>
          </Text>
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
          label="Email"
          hint="What you'll log in with."
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="alex@example.com"
        />
        <Field
          label="Username"
          hint="How friends see you, as @username. Lowercase letters, numbers, dots, underscores."
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="alex.okonkwo"
        />
        <Field
          label="Phone number"
          hint="Required — used to confirm you at events. US numbers for now."
          value={phone}
          onChangeText={(text) => setPhone(formatUsPhone(text))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          maxLength={14}
          placeholder="(404) 555-0148"
        />
        <Field
          label="Password"
          hint="At least 8 characters."
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
        />
      </View>

      {signup.isError ? <ErrorState message={signup.error.message} /> : null}

      <Button
        label="Continue"
        className="mt-6"
        loading={signup.isPending}
        disabled={!name || !email || !phone || !username || !password}
        onPress={() => signup.mutate()}
      />

      <Link href="/login" replace className="mt-4 text-center font-body-semibold text-ember-ink">
        Already have an account? Log in
      </Link>
    </Screen>
  );
}
