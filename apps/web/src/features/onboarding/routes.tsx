// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import type { RouteObject } from 'react-router';
import { InterestsPage, PreferencesPage } from './pages.js';

export const onboardingRoutes = [
  { path: 'onboarding/interests', element: <InterestsPage /> },
  { path: 'onboarding/preferences', element: <PreferencesPage /> },
] satisfies RouteObject[];
