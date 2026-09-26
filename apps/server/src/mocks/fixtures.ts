// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import type {
  Activity,
  AnalyzeFeedbackOutput,
  GraphResponse,
  GroupResponse,
  JoinEventResponse,
  MatchRunResponse,
  MeResponse,
  MessagesResponse,
} from '@degrees/shared';

export const REQUESTER_ID = '10000000-0000-4000-8000-000000000001';
export const DEMO_EVENT_ID = '20000000-0000-4000-8000-000000000001';
export const DEMO_EVENT_CODE = 'HACKGT';
export const DEMO_GROUP_ID = '30000000-0000-4000-8000-000000000001';

interface MockPerson {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  city: string;
  interests: readonly string[];
}

export const people = [
  {
    id: REQUESTER_ID,
    username: 'avery.codes',
    displayName: 'Avery Chen',
    bio: 'CS student who likes tiny concerts and ambitious side projects.',
    city: 'Atlanta',
    interests: ['indie music', 'bouldering', 'hackathons'],
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    username: 'maya.makes',
    displayName: 'Maya Patel',
    bio: 'Industrial designer, ceramics beginner, and BeltLine regular.',
    city: 'Atlanta',
    interests: ['ceramics', 'design', 'coffee'],
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    username: 'chris.atl',
    displayName: 'Chris Brooks',
    bio: 'HackGT volunteer and pickup soccer organizer.',
    city: 'Atlanta',
    interests: ['hackathons', 'soccer', 'live music'],
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    username: 'jordan.eats',
    displayName: 'Jordan Kim',
    bio: 'Exploring Atlanta one dumpling and trivia night at a time.',
    city: 'Atlanta',
    interests: ['food', 'trivia', 'photography'],
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    username: 'nia.outdoors',
    displayName: 'Nia Robinson',
    bio: 'Urban gardener and weekend trail finder.',
    city: 'Atlanta',
    interests: ['gardening', 'hiking', 'community service'],
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    username: 'leo.builds',
    displayName: 'Leo Garcia',
    bio: 'Robotics student with a weakness for arcade cabinets.',
    city: 'Atlanta',
    interests: ['robotics', 'arcades', 'bouldering'],
  },
  {
    id: '10000000-0000-4000-8000-000000000007',
    username: 'samira.reads',
    displayName: 'Samira Okafor',
    bio: 'Poetry reader, amateur baker, and campus radio host.',
    city: 'Atlanta',
    interests: ['poetry', 'baking', 'indie music'],
  },
  {
    id: '10000000-0000-4000-8000-000000000008',
    username: 'devon.frames',
    displayName: 'Devon Lee',
    bio: 'Film student documenting the best corners of Atlanta.',
    city: 'Atlanta',
    interests: ['film', 'photography', 'coffee'],
  },
] as const satisfies readonly MockPerson[];

export const meFixture = {
  id: REQUESTER_ID,
  username: 'avery.codes',
  displayName: 'Avery Chen',
  bio: 'CS student who likes tiny concerts and ambitious side projects.',
  city: 'Atlanta',
  hasCompletedProfile: true,
} satisfies MeResponse;

export const graphFixture = {
  nodes: [
    { id: REQUESTER_ID, displayName: 'Avery Chen', degree: 0 },
    { id: people[1].id, displayName: 'Maya Patel', degree: 1 },
    { id: people[2].id, displayName: 'Chris Brooks', degree: 1 },
    { id: people[3].id, displayName: 'Jordan Kim', degree: 2 },
    { id: people[5].id, displayName: 'Leo Garcia', degree: 2 },
  ],
  edges: [
    { a: REQUESTER_ID, b: people[1].id },
    { a: REQUESTER_ID, b: people[2].id },
    { a: people[1].id, b: people[3].id },
    { a: people[2].id, b: people[5].id },
  ],
} satisfies GraphResponse;

export const eventFixture = {
  eventId: DEMO_EVENT_ID,
  name: 'HackGT Opening Mixer',
  attendees: people.slice(0, 6).map(({ id, displayName }) => ({
    id,
    displayName,
  })),
} satisfies JoinEventResponse;

export const activityFixture = {
  title: 'Duckpin Bowling and Food Hall Hangout',
  venue: 'The Painted Duck',
  address: '976 Brady Ave NW, Atlanta, GA 30318',
  lat: 33.7817,
  lng: -84.4124,
  priceCents: 2500,
  startsAt: '2026-09-27T23:00:00.000Z',
  source: 'maps',
  sourceUrl: 'https://maps.google.com/?q=The+Painted+Duck+Atlanta',
  reasoning:
    'A casual activity with food nearby gives everyone an easy way to talk.',
} satisfies Activity;

export const matchFixture = {
  groupId: DEMO_GROUP_ID,
  members: [
    {
      id: REQUESTER_ID,
      displayName: 'Avery Chen',
      degree: 0,
      sharedInterests: ['hackathons'],
      via: [],
    },
    {
      id: people[1].id,
      displayName: 'Maya Patel',
      degree: 1,
      sharedInterests: ['coffee'],
      via: [],
    },
    {
      id: people[3].id,
      displayName: 'Jordan Kim',
      degree: 2,
      sharedInterests: ['Atlanta food'],
      via: [{ id: people[1].id, displayName: people[1].displayName }],
    },
    {
      id: people[5].id,
      displayName: 'Leo Garcia',
      degree: 2,
      sharedInterests: ['bouldering'],
      via: [{ id: people[2].id, displayName: people[2].displayName }],
    },
  ],
  reasoning:
    'You already know Maya, Maya knows Jordan, and Chris connects you to Leo. The group shares hands-on activities and low-key Atlanta outings.',
} satisfies MatchRunResponse;

export const groupFixture = {
  id: DEMO_GROUP_ID,
  status: 'confirmed',
  reasoning: matchFixture.reasoning,
  members: matchFixture.members,
  activity: activityFixture,
} satisfies GroupResponse;

export const messagesFixture = {
  messages: [
    {
      id: '4101',
      senderId: people[1].id,
      senderName: 'Maya Patel',
      body: 'The Painted Duck plan looks great!',
      createdAt: '2026-09-26T14:05:00.000Z',
    },
    {
      id: '4102',
      senderId: REQUESTER_ID,
      senderName: 'Avery Chen',
      body: 'I can meet by the front entrance at 7.',
      createdAt: '2026-09-26T14:07:00.000Z',
    },
    {
      id: '4103',
      senderId: people[3].id,
      senderName: 'Jordan Kim',
      body: 'Perfect. I am taking MARTA from campus.',
      createdAt: '2026-09-26T14:09:00.000Z',
    },
    {
      id: '4104',
      senderId: people[5].id,
      senderName: 'Leo Garcia',
      body: 'Does anyone want to grab food there first?',
      createdAt: '2026-09-26T14:12:00.000Z',
    },
    {
      id: '4105',
      senderId: people[1].id,
      senderName: 'Maya Patel',
      body: 'Yes — I will arrive fifteen minutes early.',
      createdAt: '2026-09-26T14:14:00.000Z',
    },
  ],
} satisfies MessagesResponse;

export const feedbackAnalysisFixture = {
  tags: [
    { label: 'duckpin bowling', kind: 'derived' },
    { label: 'small group outings', kind: 'derived' },
  ],
  sentiment: 'positive',
} satisfies AnalyzeFeedbackOutput;
