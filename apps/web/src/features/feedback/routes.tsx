// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import type { RouteObject } from 'react-router';
import { FeedbackPage } from './page.js';

export const feedbackRoutes = [
  { path: 'groups/:id/feedback', element: <FeedbackPage /> },
] satisfies RouteObject[];
