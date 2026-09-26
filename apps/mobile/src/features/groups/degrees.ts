// Owner: Pranav (Groups, Activities & Chat) — how degrees of separation read and look in the UI.
import type { GroupMember } from '@degrees/shared';

interface DegreeStyle {
  label: string;
  avatar: string;
  avatarText: string;
  badge: string;
  badgeText: string;
}

const STYLES: DegreeStyle[] = [
  {
    label: 'You',
    avatar: 'bg-violet-600',
    avatarText: 'text-white',
    badge: 'bg-violet-100 dark:bg-violet-950',
    badgeText: 'text-violet-700 dark:text-violet-300',
  },
  {
    label: 'Met in person',
    avatar: 'bg-emerald-100 dark:bg-emerald-950',
    avatarText: 'text-emerald-800 dark:text-emerald-200',
    badge: 'bg-emerald-100 dark:bg-emerald-950',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
  },
  {
    label: '2nd degree',
    avatar: 'bg-sky-100 dark:bg-sky-950',
    avatarText: 'text-sky-800 dark:text-sky-200',
    badge: 'bg-sky-100 dark:bg-sky-950',
    badgeText: 'text-sky-800 dark:text-sky-300',
  },
  {
    label: '3rd degree',
    avatar: 'bg-amber-100 dark:bg-amber-950',
    avatarText: 'text-amber-800 dark:text-amber-200',
    badge: 'bg-amber-100 dark:bg-amber-950',
    badgeText: 'text-amber-800 dark:text-amber-300',
  },
];

export function degreeStyle(degree: number): DegreeStyle {
  return STYLES[Math.min(Math.max(degree, 0), STYLES.length - 1)]!;
}

// "You met Maya", "Maya knows Jordan", "through Chris → Sam". Null for the viewer.
export function pathSentence(member: GroupMember): string | null {
  if (member.degree === 0) {
    return null;
  }
  if (member.degree === 1) {
    return 'You’ve met in person';
  }
  const via = member.via;
  if (!via || via.length === 0) {
    return `${member.degree} degrees away`;
  }
  if (via.length === 1) {
    return `You both know ${via[0]!.displayName}`;
  }
  return `Through ${via.map(({ displayName }) => displayName).join(' → ')}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
