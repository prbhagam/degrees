// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md. Username signup via the server wired by Sahith (Sep 26).
// CHANGED Sep 26 (wave 2): phone formats as (404) 555-0148 while typing (US only for now), password has a
// show/hide toggle (Field), and onboarding is entered with replace so it isn't left under the app.
import { useState } from 'react';
import { authEmailFor, formatUsPhone, signupRequestSchema } from '@degrees/shared';
import { useMutation } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Chip, ErrorState, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';
import { useSessionStore } from '@/stores/session';

const PRONOUN_OPTIONS = ['She/her', 'He/him', 'They/them', 'Other'];

export function SignupScreen() {
  const router = useRouter();
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);
  const setOnboardingSkippedBy = useSessionStore((state) => state.setOnboardingSkippedBy);
  const [name, setName] = useState('');
  const [pronoun, setPronoun] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const signup = useMutation({
    mutationFn: async () => {
      const parsed = signupRequestSchema.safeParse({
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
          email: authEmailFor(parsed.data.username),
          password,
        });
        if (error) throw new Error(error.message);
      }
      return api.getMe();
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
      <Body className="mt-1 text-muted">Takes about two minutes. You start at degree 0 — everyone else is measured from you.</Body>

      <View className="mt-6 gap-4">
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
          label="Username"
          hint="What you'll log in with. Lowercase letters, numbers, dots, underscores."
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
        disabled={!name || !phone || !username || !password}
        onPress={() => signup.mutate()}
      />

      <Link href="/login" replace className="mt-4 text-center font-body-semibold text-ember-ink">
        Already have an account? Log in
      </Link>
    </Screen>
  );
}
