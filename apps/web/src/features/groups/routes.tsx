// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import type { RouteObject } from 'react-router';
import { GroupPage } from './page.js';

export const groupRoutes = [
  { path: 'groups/:id', element: <GroupPage /> },
] satisfies RouteObject[];
