// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';

export function ProfilePage() {
  const profile = useQuery({ queryKey: ['me'], queryFn: api.getMe });
  if (profile.isPending) return <p>Loading profile mock…</p>;
  if (profile.isError) return <p>{profile.error.message}</p>;
  return (
    <section>
      <h1 className="text-2xl font-semibold">{profile.data.displayName}</h1>
      <p>@{profile.data.username}</p>
      <p>{profile.data.city}</p>
    </section>
  );
}
