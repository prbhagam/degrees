// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import type { RouteObject } from 'react-router';
import { ActivityPage } from './page.js';

export const activityRoutes = [
  { path: 'groups/:id/activity', element: <ActivityPage /> },
] satisfies RouteObject[];
