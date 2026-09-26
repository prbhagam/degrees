// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import type { RouteObject } from 'react-router';
import { ProfilePage } from './page.js';

export const profileRoutes = [
  { path: 'profile', element: <ProfilePage /> },
] satisfies RouteObject[];
