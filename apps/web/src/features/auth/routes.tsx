// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import type { RouteObject } from 'react-router';
import { LoginPage, SignupPage } from './pages.js';

export const authRoutes = [
  { path: 'login', element: <LoginPage /> },
  { path: 'signup', element: <SignupPage /> },
] satisfies RouteObject[];
