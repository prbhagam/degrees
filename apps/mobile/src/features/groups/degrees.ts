// Owner: Pranav (Groups, Activities & Chat) — how degrees of separation read and look in the UI.
// CHANGED Sep 26: members past 1st degree are redacted server-side (no name, no `via` chain) —
// you only ever see three states: you, someone you've met, or someone you haven't met yet.
// CHANGED Sep 26 (wave 5, Sahith): hangoutTitle() — one title for the group screen, the chat header, and the
// Chats tab, so "Group chat" is never the header when the group has a name.
import type { GroupMember, GroupResponse } from '@degrees/shared';

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

export function ordinalDegree(degree: number): string {
  if (degree <= 0) return 'Degree 0';
  const suffix = degree === 1 ? 'st' : degree === 2 ? 'nd' : degree === 3 ? 'rd' : 'th';
  return `${degree}${suffix} degree`;
}

// Added Sep 26 (wave 3): the app speaks in degrees everywhere. You are degree 0; someone you've met is 1st degree;
// a friend of a friend is 2nd; and so on. Redacted members still show their degree — that's the one thing the
// design does let you know about someone you haven't met.
export function memberDegreeLabel(member: Pick<GroupMember, 'degree' | 'revealed' | 'met'>): string {
  if (member.degree === 0) return 'You';
  if (member.degree === 1 || member.met) return '1st degree';
  return `${ordinalDegree(member.degree)} · new`;
}

export function memberDisplayName(
  member: Pick<GroupMember, 'displayName' | 'revealed'>,
): string {
  return member.revealed ? (member.displayName ?? 'Someone') : 'Someone new';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Added Sep 26 (wave 5): what a group is called wherever it appears. The saved name wins; otherwise the people
// you can see, then how many you can't; 'Your group' only when nothing else is known.
export function hangoutTitle(
  data: Pick<GroupResponse, 'name' | 'members' | 'unrevealedCount' | 'kind'> | null | undefined,
): string {
  if (!data) return data === null ? 'Your group' : 'Chat';
  if (data.name) return data.name;
  const revealedOthers = data.members.filter((member) => member.degree !== 0 && member.revealed);
  if (revealedOthers.length > 0) {
    const names = revealedOthers.map((member) => firstName(member.displayName ?? 'Someone')).join(', ');
    return `You + ${names}${data.unrevealedCount > 0 ? ` + ${data.unrevealedCount} more` : ''}`;
  }
  if (data.unrevealedCount > 0) return `You + ${data.unrevealedCount} new people`;
  return data.kind === 'meetup' ? 'Meetup' : 'Your group';
}
