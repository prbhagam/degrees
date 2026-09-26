// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import type { RouteObject } from 'react-router';
import { ChatPage } from './page.js';

export const chatRoutes = [
  { path: 'groups/:id/chat', element: <ChatPage /> },
] satisfies RouteObject[];
