// Owner: shared mobile scaffold (Charles) — see docs/ROLES.md.
import type { MeResponse } from '@degrees/shared';
import type { Href } from 'expo-router';
import { create } from 'zustand';

interface ActiveEvent {
  id: string;
  name: string;
}

export interface SessionState {
  currentUser: MeResponse | null;
  activeGroupId: string | null;
  // Added Sep 26: which event the person last joined in person — a connection made via QR must be
  // tied to a shared event, not floating free, so ConnectScreen reads this before it will show a code.
  activeEvent: ActiveEvent | null;
  setCurrentUser: (currentUser: MeResponse | null) => void;
  setActiveGroupId: (activeGroupId: string | null) => void;
  setActiveEvent: (activeEvent: ActiveEvent | null) => void;
  // Added Sep 26 (auth): whether a Supabase session exists, and where a signed-out visit was headed
  // (e.g. a scanned join/HACKGT link) so login or onboarding can send them there afterwards.
  authStatus: 'loading' | 'signedIn' | 'signedOut';
  pendingHref: Href | null;
  setAuthStatus: (authStatus: SessionState['authStatus']) => void;
  setPendingHref: (pendingHref: Href | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
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
}));
