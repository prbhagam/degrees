// Owner: Pranav (Groups, Activities & Chat) — how degrees of separation read and look in the UI.
// CHANGED Sep 26: members past 1st degree are redacted server-side (no name, no `via` chain) —
// you only ever see three states: you, someone you've met, or someone you haven't met yet.
import type { GroupMember } from '@degrees/shared';

interface DegreeStyle {
  label: string;
  avatar: string;
  avatarText: string;
  badge: string;
  badgeText: string;
}

const YOU: DegreeStyle = {
  label: 'You',
  avatar: 'bg-ink',
  avatarText: 'text-paper',
  badge: 'bg-ink',
  badgeText: 'text-paper',
};

const MET: DegreeStyle = {
  label: 'Met in person',
  avatar: 'bg-sage',
  avatarText: 'text-paper',
  badge: 'border border-line bg-paper-raised',
  badgeText: 'text-sage',
};

const UNMET: DegreeStyle = {
  label: "Haven't met yet",
  avatar: 'border-2 border-dashed border-line bg-paper',
  avatarText: 'text-muted',
  badge: 'border border-line bg-paper',
  badgeText: 'text-muted',
};

export function memberDegreeStyle(
  member: Pick<GroupMember, 'degree' | 'revealed'>,
): DegreeStyle {
  if (member.degree === 0) return YOU;
  return member.revealed ? MET : UNMET;
}

export function memberDisplayName(
  member: Pick<GroupMember, 'displayName' | 'revealed'>,
): string {
  return member.revealed ? (member.displayName ?? 'Someone') : 'Someone new';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
