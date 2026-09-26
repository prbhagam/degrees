// Owner: shared web scaffold (Charles) — see docs/ROLES.md.
import { NavLink, Outlet } from 'react-router';

const links = [
  ['/', 'Home'],
  ['/login', 'Login'],
  ['/onboarding/interests', 'Onboarding'],
  ['/profile', 'Profile'],
  ['/join', 'Join'],
  ['/groups/30000000-0000-4000-8000-000000000001', 'Group'],
] as const;

export function App() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex flex-wrap items-center gap-4 border-b pb-4">
        <strong>Degrees</strong>
        <nav className="flex flex-wrap gap-3 text-sm">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
