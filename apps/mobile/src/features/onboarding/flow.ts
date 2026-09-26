// Owner: Charles (Onboarding & Profile) — onboarding navigation helpers, added Sep 26 (wave 2).
// Three steps (interests → about → preferences). Each can be skipped: the app records that on this device and
// lets the person in, Home nags about what's missing, and matching refuses until it's done. `returnTo` carries
// where to go afterwards when a step was opened to unblock something (e.g. /match), else the pending deep link
// or home. Steps advance with replace so none of them stays under the app for a back-swipe.
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { consumePendingHref, enterApp } from '@/features/auth/session';
import { queryKeys } from '@/features/groups/queries';
import { useSessionStore } from '@/stores/session';

export type OnboardingStep = 'interests' | 'about' | 'preferences';
const NEXT: Record<OnboardingStep, OnboardingStep | null> = {
  interests: 'about',
  about: 'preferences',
  preferences: null,
};

export function useOnboardingFlow(step: OnboardingStep) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const currentUser = useSessionStore((state) => state.currentUser);
  const setOnboardingSkippedBy = useSessionStore((state) => state.setOnboardingSkippedBy);

  const destination = (): Href => (returnTo ? (returnTo as Href) : consumePendingHref());

  const leave = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    enterApp(router, destination());
  };

  return {
    returnTo,
    // Move to the next step, or into the app after the last one. Opened to unblock something (returnTo set)?
    // Go straight back after this one step — if another step is still missing, the caller (e.g. /match) gets
    // another 409 and sends the person to that step next.
    next: () => {
      const following = NEXT[step];
      if (following && !returnTo) {
        router.replace(`/onboarding/${following}`);
        return;
      }
      if (!following) setOnboardingSkippedBy(null);
      leave();
    },
    skip: () => {
      if (currentUser) setOnboardingSkippedBy(currentUser.id);
      leave();
    },
  };
}
