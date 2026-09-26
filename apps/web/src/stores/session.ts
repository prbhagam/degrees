// Owner: shared web scaffold (Charles) — see docs/ROLES.md.
import { create } from 'zustand';
import type { MeResponse } from '@degrees/shared';

interface SessionState {
  currentUser: MeResponse | null;
  activeGroupId: string | null;
  setCurrentUser: (user: MeResponse | null) => void;
  setActiveGroupId: (groupId: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  currentUser: null,
  activeGroupId: null,
  setCurrentUser: (currentUser) => set({ currentUser }),
  setActiveGroupId: (activeGroupId) => set({ activeGroupId }),
}));
