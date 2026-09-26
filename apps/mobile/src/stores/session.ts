// Owner: shared mobile scaffold (Charles) — see docs/ROLES.md.
import type { MeResponse } from '@degrees/shared';
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
}

export const useSessionStore = create<SessionState>()((set) => ({
  currentUser: null,
  activeGroupId: null,
  activeEvent: null,
  setCurrentUser: (currentUser) => set({ currentUser }),
  setActiveGroupId: (activeGroupId) => set({ activeGroupId }),
  setActiveEvent: (activeEvent) => set({ activeEvent }),
}));
