// Owner: Charles (Onboarding & Profile) — the pickable tag lists, shared by onboarding and Edit profile (wave 3).
// Interests become `hobby` tags; "rather skip" choices become `avoid` tags, which the server treats as hard
// constraints on plans and icebreakers (never as interests).

export const COMMON_INTERESTS = [
  'Hiking', 'Board Games', 'Live Music', 'Cooking', 'Climbing', 'Basketball',
  'Photography', 'Trivia Night', 'Thrifting', 'Running', 'Karaoke', 'Film Club',
  'Coffee Crawls', 'Pickup Soccer',
];

export const AVOID_OPTIONS = [
  'Alcohol', 'Late nights', 'Large crowds', 'High-intensity activity', 'Loud venues', 'Smoking',
];

export function toggleLabel(current: string[], label: string): string[] {
  return current.includes(label) ? current.filter((item) => item !== label) : [...current, label];
}
