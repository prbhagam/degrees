// Owner: shared mobile scaffold (Charles) — providers + root Stack. Feature owners add screens as files
// under src/app/ that re-export from src/features/<feature>/, so this file should rarely change.
// CHANGED Sep 26 (wave 2): the query cache persists to disk (PersistQueryClientProvider), the app refetches on
// foreground, and the auth/onboarding screens can't be swiped back to from inside the app.
import '../global.css';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  PublicSans_400Regular,
  PublicSans_500Medium,
  PublicSans_600SemiBold,
  PublicSans_700Bold,
} from '@expo-google-fonts/public-sans';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { AuthGate, useAuthSubscription } from '@/features/auth/session';
import { persistOptions, queryClient, subscribeQueryFocus } from '@/lib/query';
import { useSessionStore } from '@/stores/session';

SplashScreen.preventAutoHideAsync();
subscribeQueryFocus();

// Screens that are entry points, not history: once you're past them there's nothing to go "back" to.
const NO_BACK = { gestureEnabled: false, headerBackVisible: false } as const;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    PublicSans_400Regular,
    PublicSans_500Medium,
    PublicSans_600SemiBold,
    PublicSans_700Bold,
  });

  useAuthSubscription();
  const authLoading = useSessionStore((state) => state.authStatus === 'loading');
  // Wave 4: the animated splash takes over from the (plain paper) native splash and lifts off ~1.5s later.
  const [splashDone, setSplashDone] = useState(false);
  // Stable identity: a fresh closure here on every render of this (root) component would restart
  // DegreesMark's animation effect on each render (onDone is in its dependency array), corrupting the timing.
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  // The splash stays up until the saved session is restored, so no screen renders signed-out first.
  useEffect(() => {
    if (fontsLoaded && !authLoading) SplashScreen.hideAsync();
  }, [fontsLoaded, authLoading]);

  if (!fontsLoaded || authLoading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: '#F7F3EC' },
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: 'Fraunces_700Bold', color: '#20201C', fontSize: 20 },
          headerTintColor: '#20201C',
          contentStyle: { backgroundColor: '#F7F3EC' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, ...NO_BACK }} />
        <Stack.Screen name="login" options={NO_BACK} />
        <Stack.Screen name="onboarding/interests" options={NO_BACK} />
        {/* about/preferences keep their back gesture: stepping back within onboarding is fine, and
            preferences doubles as a settings screen pushed from Profile. */}
      </Stack>
      <AuthGate />
      <StatusBar style="auto" />
      {!splashDone ? <AnimatedSplash onDone={handleSplashDone} /> : null}
    </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
