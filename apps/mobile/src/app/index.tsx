// Owner: shared mobile scaffold (Charles) — dev navigation to every placeholder; replace with the real home.
import { Link, type Href } from 'expo-router';
import { ScrollView, Text } from 'react-native';

const DEMO_GROUP_ID = '30000000-0000-4000-8000-000000000001';

const links: { href: Href; label: string }[] = [
  { href: '/login', label: 'Log in (auth)' },
  { href: '/signup', label: 'Sign up (auth)' },
  { href: '/onboarding/interests', label: 'Interests (onboarding)' },
  { href: '/onboarding/preferences', label: 'Preferences (onboarding)' },
  { href: '/profile', label: 'Profile' },
  { href: '/join', label: 'Join an event (events)' },
  { href: '/join/HACKGT', label: 'Join HACKGT (events deep link)' },
  { href: `/groups/${DEMO_GROUP_ID}`, label: 'Group' },
  { href: `/groups/${DEMO_GROUP_ID}/activity`, label: 'Activity' },
  { href: `/groups/${DEMO_GROUP_ID}/chat`, label: 'Chat' },
  { href: `/groups/${DEMO_GROUP_ID}/feedback`, label: 'Feedback' },
];

export default function DevHome() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-4 p-6"
    >
      <Text className="text-base text-neutral-500">
        Developer navigation — every feature route is wired and ready for its
        owner.
      </Text>
      {links.map(({ href, label }) => (
        <Link key={label} href={href} className="text-lg text-blue-600">
          {label}
        </Link>
      ))}
    </ScrollView>
  );
}
