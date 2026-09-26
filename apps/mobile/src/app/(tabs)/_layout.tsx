// Owner: shared mobile scaffold (Charles) — the persistent bottom nav from the validated design
// (Home / Circle / Profile). Added Sep 26 — previously these 3 screens had no real navigation
// between them at all, only the __DEV__ links list in HomeScreen stood in for it.
import { Redirect, Tabs } from 'expo-router';
import { House, Network, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

// CHANGED Sep 26 — nothing anywhere redirected a signed-out user to /login; the app always booted
// straight to this tab group regardless of auth state (true since the very first commit of
// index.tsx, not a regression from adding the tab bar). With no Supabase project configured
// (mock-mode dev, no .env), auth is skipped entirely — there's nothing to sign in to.
function useAuthStatus(): AuthStatus {
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseEnvironmentUnset() ? 'authenticated' : 'checking',
  );

  useEffect(() => {
    if (isSupabaseEnvironmentUnset()) return;
    const client = getSupabaseClient();
    client.auth.getSession().then(({ data }) => {
      setStatus(data.session ? 'authenticated' : 'unauthenticated');
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'authenticated' : 'unauthenticated');
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return status;
}

export default function TabsLayout() {
  const authStatus = useAuthStatus();

  if (authStatus === 'checking') {
    return null;
  }
  if (authStatus === 'unauthenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#20201C',
        tabBarInactiveTintColor: '#8A8378',
        tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#E4DDD0' },
        headerStyle: { backgroundColor: '#F7F3EC' },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'Fraunces_700Bold', color: '#20201C', fontSize: 20 },
        headerTintColor: '#20201C',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Degrees',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="circle"
        options={{
          title: 'Your circle',
          tabBarLabel: 'Circle',
          tabBarIcon: ({ color, size }) => <Network color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
