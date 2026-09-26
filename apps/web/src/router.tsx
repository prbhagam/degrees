// Owner: shared web scaffold (Charles) — feature owners only edit their own routes.tsx; this file stays stable.
import { createBrowserRouter, Link } from 'react-router';
import { App } from './App.js';
import { activityRoutes } from './features/activity/routes.js';
import { authRoutes } from './features/auth/routes.js';
import { chatRoutes } from './features/chat/routes.js';
import { eventRoutes } from './features/events/routes.js';
import { feedbackRoutes } from './features/feedback/routes.js';
import { groupRoutes } from './features/groups/routes.js';
import { onboardingRoutes } from './features/onboarding/routes.js';
import { profileRoutes } from './features/profile/routes.js';

const demoGroupId = '30000000-0000-4000-8000-000000000001';

function HomePage() {
  const links = [
    '/login',
    '/signup',
    '/onboarding/interests',
    '/onboarding/preferences',
    '/profile',
    `/groups/${demoGroupId}/feedback`,
    '/join',
    '/join/HACKGT',
    `/groups/${demoGroupId}`,
    `/groups/${demoGroupId}/activity`,
    `/groups/${demoGroupId}/chat`,
  ];
  return (
    <section>
      <h1 className="text-2xl font-semibold">Degrees developer navigation</h1>
      <p className="my-3">Every feature boundary is wired and ready for its owner.</p>
      <ul className="list-disc space-y-1 pl-6">
        {links.map((path) => (
          <li key={path}>
            <Link to={path}>{path}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      ...authRoutes,
      ...onboardingRoutes,
      ...profileRoutes,
      ...feedbackRoutes,
      ...eventRoutes,
      ...groupRoutes,
      ...activityRoutes,
      ...chatRoutes,
    ],
  },
]);
