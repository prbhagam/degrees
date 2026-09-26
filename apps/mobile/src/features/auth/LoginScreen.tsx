// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, ErrorState, Field, Screen, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';
import { useSessionStore } from '@/stores/session';

export function LoginScreen() {
  const router = useRouter();
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: async () => {
      // No Supabase project configured (mock-mode dev): api.ts already sends a fixed dev token,
      // so there's nothing to authenticate against — just load the mock `me` and continue.
      if (!isSupabaseEnvironmentUnset()) {
        const { error } = await getSupabaseClient().auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw new Error(error.message);
      }
      return api.getMe();
    },
    onSuccess: (me) => {
      setCurrentUser(me);
      router.replace('/');
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Log in', headerShown: false }} />
      <View className="flex-1 justify-center gap-8">
        <View>
          <Text className="font-display text-3xl text-ink">Welcome back.</Text>
          <Body className="mt-2 text-muted">Real friends. Real hangouts. No swiping.</Body>
        </View>

        <View className="gap-4">
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
          />
        </View>

        {login.isError ? <ErrorState message={login.error.message} /> : null}

        <Button label="Log in" loading={login.isPending} onPress={() => login.mutate()} />

        <Link href="/signup" className="text-center font-body-semibold text-ember-ink">
          New here? Create account
        </Link>
      </View>
    </Screen>
  );
}
