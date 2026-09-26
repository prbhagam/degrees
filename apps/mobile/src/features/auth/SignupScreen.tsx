// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import { useState } from 'react';
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
  const [name, setName] = useState('');
  const [pronoun, setPronoun] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const signup = useMutation({
    mutationFn: async () => {
      if (!isSupabaseEnvironmentUnset()) {
        const { error } = await getSupabaseClient().auth.signUp({ email, password });
        if (error) throw new Error(error.message);
      }
      // Creates the profile row now; Interests/About/Preferences fill in the rest as they go.
      await api.updateProfile({
        displayName: name,
        bio: '',
        aiParagraph: '',
        city: '',
        phone,
        pronouns: pronoun ?? undefined,
        tags: [],
      });
      return api.getMe();
    },
    onSuccess: (me) => {
      setCurrentUser(me);
      router.push('/onboarding/interests');
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Sign up', headerBackButtonDisplayMode: 'minimal' }} />
      <Text className="font-display text-2xl text-ink">Create your account</Text>
      <Body className="mt-1 text-muted">Takes about two minutes.</Body>

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
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Phone number"
          hint="Required — used to confirm you at events."
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="(404) 555-0148"
        />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      </View>

      {signup.isError ? <ErrorState message={signup.error.message} /> : null}

      <Button
        label="Continue"
        className="mt-6"
        loading={signup.isPending}
        disabled={!name || !phone}
        onPress={() => signup.mutate()}
      />

      <Link href="/login" className="mt-4 text-center font-body-semibold text-ember-ink">
        Already have an account? Log in
      </Link>
    </Screen>
  );
}
