// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md. Login + post-login routing wired by Sahith (Sep 26).
// CHANGED Sep 27: log in with your email (it used to be a username mapped to `<username>@degrees.demo`). The seeded
// demo accounts log in with their full address, e.g. maya.chen@degrees.demo.
// CHANGED Sep 27: …or with their username. Anything with an "@" after the first character is an email and goes
// straight to Supabase; otherwise it's a username, which POST /api/auth/login turns into a session (only the server
// can see which email a username belongs to).
// CHANGED Sep 26 (wave 2): password show/hide (Field); entering the app collapses the auth stack (enterApp) so a
// swipe from the left edge can't return here; a device that skipped onboarding goes straight in.
// CHANGED Sep 27: focusing a field left the screen pushed up after the keyboard closed. Screen's
// automaticallyAdjustKeyboardInsets scrolls the focused field clear of the keyboard, but when the keyboard hides RN
// only resets the inset, not the scroll offset (RCTScrollViewComponentView _keyboardWillChangeFrame), and this form
// is shorter than the screen, so it sat scrolled past its end until dragged. Login now shrinks around the keyboard
// instead (KeyboardAvoidingView) and never auto-scrolls, so it settles back to centre. Return moves email → password
// → log in.
import { useRef, useState } from 'react';
import { emailSchema, loginRequestSchema } from '@degrees/shared';
import { useMutation } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Text, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, ErrorState, Field, Screen } from '@/components/ui';
import { consumePendingHref, enterApp, hasSkippedOnboarding } from '@/features/auth/session';
import { api } from '@/lib/api';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';
import { useSessionStore } from '@/stores/session';

export function LoginScreen() {
  const router = useRouter();
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const login = useMutation({
    mutationFn: async () => {
      // No Supabase project configured (mock-mode dev): api.ts already sends a fixed dev token,
      // so there's nothing to authenticate against — just load the mock `me` and continue.
      if (!isSupabaseEnvironmentUnset()) {
        const typed = identifier.trim();
        if (!typed) throw new Error('Enter your email or username.');
        if (typed.lastIndexOf('@') > 0) {
          const parsedEmail = emailSchema.safeParse(typed);
          if (!parsedEmail.success) {
            throw new Error(parsedEmail.error.issues[0]?.message ?? 'Enter a valid email address.');
          }
          const { error } = await getSupabaseClient().auth.signInWithPassword({
            email: parsedEmail.data,
            password,
          });
          if (error) {
            throw new Error(
              error.code === 'invalid_credentials' ? 'Wrong email or password.' : error.message,
            );
          }
        } else {
          const parsedLogin = loginRequestSchema.safeParse({ username: typed, password });
          if (!parsedLogin.success) {
            throw new Error(parsedLogin.error.issues[0]?.message ?? 'Enter a valid username.');
          }
          const session = await api.login(parsedLogin.data);
          const { error } = await getSupabaseClient().auth.setSession({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
          });
          if (error) throw new Error(error.message);
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
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-paper">
      <Screen
        automaticallyAdjustKeyboardInsets={false}
        // Safe-area padding by hand ("never") so the centred form's container is exactly the visible height.
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="grow px-5"
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 48 }}
      >
        <Stack.Screen options={{ title: 'Log in', headerShown: false }} />
        <View className="flex-1 justify-center gap-8">
          <View>
            <Text className="font-display text-3xl text-ink">Welcome back.</Text>
            <Body className="mt-2 text-muted">Real friends, a few degrees apart. No swiping.</Body>
          </View>

          <View className="gap-4">
            <Field
              label="Email or username"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              // "username" (not "emailAddress") is the field iOS pairs with the password for saved logins, and a
              // saved login may be either.
              autoComplete="username"
              keyboardType="email-address"
              textContentType="username"
              placeholder="you@example.com or @handle"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="••••••••"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!login.isPending) login.mutate();
              }}
            />
          </View>

          {login.isError ? <ErrorState message={login.error.message} /> : null}

          <Button label="Log in" loading={login.isPending} onPress={() => login.mutate()} />

          <Link href="/signup" className="text-center font-body-semibold text-ember-ink">
            New here? Create account
          </Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
