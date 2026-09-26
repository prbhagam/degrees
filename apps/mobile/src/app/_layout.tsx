// Owner: shared mobile scaffold (Charles) — providers + root Stack. Feature owners add screens as files
// under src/app/ that re-export from src/features/<feature>/, so this file should rarely change.
import '../global.css';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
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
import { AuthGate, useAuthSubscription } from '@/features/auth/session';
import { queryClient } from '@/lib/query';
import { useSessionStore } from '@/stores/session';

SplashScreen.preventAutoHideAsync();

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

  // The splash stays up until the saved session is restored, so no screen renders signed-out first.
  useEffect(() => {
    if (fontsLoaded && !authLoading) SplashScreen.hideAsync();
  }, [fontsLoaded, authLoading]);

  if (!fontsLoaded || authLoading) return null;

  return (
    <QueryClientProvider client={queryClient}>
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <AuthGate />
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
