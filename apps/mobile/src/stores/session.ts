// Owner: shared mobile scaffold (Charles) — see docs/ROLES.md.
import type { MeResponse } from '@degrees/shared';
import { create } from 'zustand';

interface SessionState {
  currentUser: MeResponse | null;
  activeGroupId: string | null;
  setCurrentUser: (currentUser: MeResponse | null) => void;
  setActiveGroupId: (activeGroupId: string | null) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  currentUser: null,
  activeGroupId: null,
  setCurrentUser: (currentUser) => set({ currentUser }),
  setActiveGroupId: (activeGroupId) => set({ activeGroupId }),
}));
