// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import type { RouteObject } from 'react-router';
import { JoinPage } from './pages.js';

export const eventRoutes = [
  { path: 'join', element: <JoinPage /> },
  { path: 'join/:roomCode', element: <JoinPage /> },
] satisfies RouteObject[];
