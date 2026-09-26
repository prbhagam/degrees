// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md. Username login + post-login routing wired by Sahith (Sep 26).
// CHANGED Sep 26 (wave 2): password show/hide (Field); entering the app collapses the auth stack (enterApp) so a
// swipe from the left edge can't return here; a device that skipped onboarding goes straight in.
import { useState } from 'react';
import { authEmailFor } from '@degrees/shared';
import { useMutation } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, ErrorState, Field, Screen } from '@/components/ui';
import { consumePendingHref, enterApp, hasSkippedOnboarding } from '@/features/auth/session';
import { api } from '@/lib/api';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';
import { useSessionStore } from '@/stores/session';

export function LoginScreen() {
  const router = useRouter();
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: async () => {
      // No Supabase project configured (mock-mode dev): api.ts already sends a fixed dev token,
      // so there's nothing to authenticate against — just load the mock `me` and continue.
      if (!isSupabaseEnvironmentUnset()) {
        const { error } = await getSupabaseClient().auth.signInWithPassword({
          email: authEmailFor(username),
          password,
        });
        if (error) {
          throw new Error(
            error.code === 'invalid_credentials' ? 'Wrong username or password.' : error.message,
          );
        }
      }
      return api.getMe();
    },
    onSuccess: (me) => {
      setCurrentUser(me);
      // Unfinished profiles resume onboarding (unless this device already chose to skip); everyone else goes
      // where they were headed (e.g. a scanned event link), else home.
      if (me.hasCompletedProfile || hasSkippedOnboarding(me.id)) {
        enterApp(router, consumePendingHref());
      } else {
        router.replace('/onboarding/interests');
      }
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
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            placeholder="maya.chen"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
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
