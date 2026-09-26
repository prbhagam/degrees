// Owner: Charles (Onboarding & Profile) — auth session + gate, added by Sahith (Sep 26).
// A redirect gate rather than Stack.Protected: on SDK 57 a failed guard falls back to "the first available
// screen", and every route would have to be listed in the root layout. This covers every route by default,
// including new ones and deep links (degrees://join/HACKGT), and remembers where a signed-out visit was going.
import { useEffect, useRef } from 'react';
import {
  useGlobalSearchParams,
  usePathname,
  useRouter,
  useSegments,
  type Href,
} from 'expo-router';
import { api, setUnauthorizedHandler } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from '@/lib/supabase';
import { useSessionStore } from '@/stores/session';

const AUTH_SCREENS = new Set(['login', 'signup']);

// Where to go after login or onboarding: the remembered deep link, else home. Clears it.
export function consumePendingHref(): Href {
  const { pendingHref, setPendingHref } = useSessionStore.getState();
  setPendingHref(null);
  return pendingHref ?? '/';
}

// Restores the saved session on launch and tracks sign-in/out. Mock-mode dev (no Supabase env) counts as
// signed in, because api.ts sends a dev token the mock server accepts.
export function useAuthSubscription(): void {
  const setAuthStatus = useSessionStore((state) => state.setAuthStatus);
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);

  useEffect(() => {
    if (isSupabaseEnvironmentUnset()) {
      setAuthStatus('signedIn');
      return;
    }
    const supabase = getSupabaseClient();
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setAuthStatus(data.session ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (active) setAuthStatus('signedOut');
      });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthStatus(session ? 'signedIn' : 'signedOut');
      if (event === 'SIGNED_OUT') {
        // Nothing cached from the last account may leak into the next one.
        queryClient.clear();
        setCurrentUser(null);
      } else if (event === 'SIGNED_IN') {
        void queryClient.invalidateQueries();
      }
    });
    // CHANGED Sep 26 — a 401 (server rejects the token: deleted user, expired, malformed) used to
    // just fail whichever screen made the call, with the stale local session left in place — every
    // other screen's own query then failed the exact same way, forever, since getSession() only
    // ever reads the locally persisted session and never asks the server whether it's still good.
    // Signing out here is what actually invalidates it locally; onAuthStateChange above then does
    // the cleanup and the effect below sends the user to /login.
    setUnauthorizedHandler(() => {
      void supabase.auth.signOut();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [setAuthStatus, setCurrentUser]);
}

// Renders nothing. Sends signed-out visits to /login (remembering the target), and once per sign-in sends a
// profile that isn't finished yet to onboarding.
export function AuthGate(): null {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const authStatus = useSessionStore((state) => state.authStatus);
  const setPendingHref = useSessionStore((state) => state.setPendingHref);
  const setCurrentUser = useSessionStore((state) => state.setCurrentUser);
  const checkedProfile = useRef(false);

  const first = segments[0] as string | undefined;
  const onAuthScreen = first !== undefined && AUTH_SCREENS.has(first);
  const onOnboarding = first === 'onboarding';

  useEffect(() => {
    if (authStatus !== 'signedOut') return;
    checkedProfile.current = false;
    if (onAuthScreen) return;
    if (pathname !== '/') {
      setPendingHref({ pathname, params } as Href);
    }
    router.replace('/login');
    // pathname/params are read at redirect time on purpose; segments changing is what re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, onAuthScreen, router, setPendingHref]);

  useEffect(() => {
    if (authStatus !== 'signedIn' || checkedProfile.current || isSupabaseEnvironmentUnset()) return;
    checkedProfile.current = true;
    // Login and signup route themselves; this covers a cold start mid-onboarding.
    if (onAuthScreen || onOnboarding) return;
    api
      .getMe()
      .then((me) => {
        setCurrentUser(me);
        if (!me.hasCompletedProfile) router.replace('/onboarding/interests');
      })
      .catch((error: unknown) => {
        console.warn('[auth] could not load the profile after sign-in:', error);
      });
  }, [authStatus, onAuthScreen, onOnboarding, router, setCurrentUser]);

  return null;
}
