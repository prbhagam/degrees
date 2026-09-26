// Owner: shared mobile scaffold (Charles) — see docs/ROLES.md.
// CHANGED Sep 26 (wave 2): activeEvent and the "skipped onboarding" flag persist on device (expo-sqlite), so a
// relaunch still knows which meetup you're at and doesn't drag a skipper back through onboarding every start.
import type { MeResponse } from '@degrees/shared';
import type { Href } from 'expo-router';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { deviceStorage, SESSION_STORE_KEY } from '@/lib/storage';

interface ActiveEvent {
  id: string;
  name: string;
  // Added Sep 26 (wave 2): the meetup's backing group, where the lobby now lives.
  groupId?: string;
}

export interface SessionState {
  currentUser: MeResponse | null;
  activeGroupId: string | null;
  // Which event the person last joined in person — a connection made via QR must be tied to a shared event, not
  // floating free, so ConnectScreen reads this before it will show a code.
  activeEvent: ActiveEvent | null;
  setCurrentUser: (currentUser: MeResponse | null) => void;
  setActiveGroupId: (activeGroupId: string | null) => void;
  setActiveEvent: (activeEvent: ActiveEvent | null) => void;
  // Whether a Supabase session exists, and where a signed-out visit was headed (e.g. a scanned join/HACKGT link)
  // so login or onboarding can send them there afterwards.
  authStatus: 'loading' | 'signedIn' | 'signedOut';
  pendingHref: Href | null;
  setAuthStatus: (authStatus: SessionState['authStatus']) => void;
  setPendingHref: (pendingHref: Href | null) => void;
  // Added Sep 26 (wave 2): the user id that chose "Skip for now" in onboarding on this device. The gate then
  // lets them into the app and Home nags instead; matching still refuses until the profile is complete.
  onboardingSkippedBy: string | null;
  setOnboardingSkippedBy: (userId: string | null) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      currentUser: null,
      activeGroupId: null,
      activeEvent: null,
      setCurrentUser: (currentUser) => set({ currentUser }),
      setActiveGroupId: (activeGroupId) => set({ activeGroupId }),
      setActiveEvent: (activeEvent) => set({ activeEvent }),
      authStatus: 'loading',
      pendingHref: null,
      setAuthStatus: (authStatus) => set({ authStatus }),
      setPendingHref: (pendingHref) => set({ pendingHref }),
      onboardingSkippedBy: null,
      setOnboardingSkippedBy: (onboardingSkippedBy) => set({ onboardingSkippedBy }),
    }),
    {
      name: SESSION_STORE_KEY,
      storage: createJSONStorage(() => deviceStorage),
      // Only device-level facts persist; auth status and the current user are re-derived on every launch.
      partialize: (state) => ({
        activeEvent: state.activeEvent,
        onboardingSkippedBy: state.onboardingSkippedBy,
      }),
    },
  ),
);
