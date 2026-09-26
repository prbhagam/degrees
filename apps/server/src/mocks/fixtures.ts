// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import type {
  Activity,
  AnalyzeFeedbackOutput,
  GraphResponse,
  GroupResponse,
  HangoutsResponse,
  IcebreakersResponse,
  JoinEventResponse,
  MatchRunResponse,
  MeResponse,
  MessagesResponse,
  Notification,
  NotificationsResponse,
  Photo,
  PhotosResponse,
  UpdatePreferencesRequest,
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
  aiParagraph: '',
  city: 'Atlanta',
  phone: '+1-404-555-0101',
  pronouns: 'they/them',
  photoUrl: null,
  tags: people[0].interests.map((label) => ({ label, kind: 'hobby' as const })),
  hasCompletedProfile: true,
  profileStatus: { interests: true, about: true, preferences: true },
  preferences: {
    costMinCents: 0,
    costMaxCents: 3000,
    maxTravelMi: 10,
    frequency: 'biweekly',
    groupSizeMin: 3,
    groupSizeMax: 6,
    maxDegrees: 2,
  },
} satisfies MeResponse;

export const preferencesFixture = meFixture.preferences satisfies UpdatePreferencesRequest;

// CHANGED Sep 26: the circle view only ever shows 1st-degree connections (Jordan and Leo are
// degree 2 in matchFixture below — proposed groupmates, not yet met — so they never appear here),
// plus `mutualEdges` between two of the viewer's own connections who also know each other.
export const graphFixture = {
  nodes: [
    { id: people[1].id, displayName: 'Maya Patel', bio: people[1].bio, photoUrl: null, metAt: 'HackGT Opening Mixer' },
    { id: people[2].id, displayName: 'Chris Brooks', bio: people[2].bio, photoUrl: null, metAt: 'HackGT Opening Mixer' },
  ],
  edges: [
    { a: REQUESTER_ID, b: people[1].id },
    { a: REQUESTER_ID, b: people[2].id },
  ],
  mutualEdges: [{ a: people[1].id, b: people[2].id }],
} satisfies GraphResponse;

// CHANGED Sep 26 (wave 2): a meetup is backed by a group (DEMO_MEETUP_GROUP_ID); Maya and Chris are already
// 1st-degree in graphFixture, so the lobby shows them as met rather than offering "We met" again.
export const DEMO_MEETUP_GROUP_ID = '30000000-0000-4000-8000-000000000002';
export const eventFixture = {
  eventId: DEMO_EVENT_ID,
  groupId: DEMO_MEETUP_GROUP_ID,
  name: 'HackGT Opening Mixer',
  hostId: people[2].id,
  scheduledAt: '2026-09-26T22:00:00.000Z',
  codeExpiresAt: '2026-09-27T22:00:00.000Z',
  endedAt: null,
  attendees: people.slice(0, 6).map(({ id, displayName, bio }, index) => ({
    id,
    displayName,
    bio,
    photoUrl: null,
    alreadyMet: index === 1 || index === 2,
  })),
} satisfies JoinEventResponse;

export const icebreakersFixture = {
  icebreakers: [
    'Avery and Leo both boulder — what was the first climb that actually scared you?',
    "Maya's into ceramics and Jordan shoots photos: what's something you made recently that you're weirdly proud of?",
    'Chris and Avery have both done hackathons — best 3am decision you ever made at one?',
    "What's one spot in Atlanta you'd take a visitor to first?",
    'If this group had a weekly tradition, what should it be?',
  ],
} satisfies IcebreakersResponse;

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

// CHANGED Sep 26 — BREAKING: Jordan and Leo are degree-2 proposed groupmates the viewer hasn't
// met yet, so they're redacted (no id, no name) instead of carrying a `via` chain. The reasoning
// text still describes them in the aggregate ("a mutual connection") without naming who.
export const matchFixture = {
  groupId: DEMO_GROUP_ID,
  members: [
    {
      id: REQUESTER_ID,
      displayName: 'Avery Chen',
      bio: people[0].bio,
      photoUrl: null,
      degree: 0,
      sharedInterests: ['hackathons'],
      revealed: true,
      met: false,
    },
    {
      id: people[1].id,
      displayName: 'Maya Patel',
      bio: people[1].bio,
      photoUrl: null,
      degree: 1,
      sharedInterests: ['coffee'],
      revealed: true,
      met: true,
    },
    {
      id: null,
      displayName: null,
      bio: null,
      photoUrl: null,
      degree: 2,
      sharedInterests: ['Atlanta food'],
      revealed: false,
      met: false,
    },
    {
      id: null,
      displayName: null,
      bio: null,
      photoUrl: null,
      degree: 2,
      sharedInterests: ['bouldering'],
      revealed: false,
      met: false,
    },
  ],
  unrevealedCount: 2,
  reasoning:
    'You already know Maya, and two more people from your wider network share hands-on activities and low-key Atlanta outings with you.',
} satisfies MatchRunResponse;

// CHANGED Sep 26: unlike matchFixture above (a still-proposed match, redacted), this group is
// `confirmed` — accepting is itself a commitment to meet, so Jordan and Leo (degree 2, the same
// two people redacted in matchFixture) are revealed here with real name + bio, matching
// messagesFixture below where they're already named senders.
export const groupFixture = {
  id: DEMO_GROUP_ID,
  status: 'confirmed',
  reasoning: matchFixture.reasoning,
  members: [
    {
      id: REQUESTER_ID,
      displayName: 'Avery Chen',
      bio: people[0].bio,
      photoUrl: null,
      degree: 0,
      sharedInterests: ['hackathons'],
      revealed: true,
      met: false,
    },
    {
      id: people[1].id,
      displayName: 'Maya Patel',
      bio: people[1].bio,
      photoUrl: null,
      degree: 1,
      sharedInterests: ['coffee'],
      revealed: true,
      met: true,
    },
    {
      id: people[3].id,
      displayName: 'Jordan Kim',
      bio: people[3].bio,
      photoUrl: null,
      degree: 2,
      sharedInterests: ['Atlanta food'],
      revealed: true,
      met: false,
    },
    {
      id: people[5].id,
      displayName: 'Leo Garcia',
      bio: people[5].bio,
      photoUrl: null,
      degree: 2,
      sharedInterests: ['bouldering'],
      revealed: true,
      met: false,
    },
  ],
  unrevealedCount: 0,
  activity: activityFixture,
  completedAt: null,
  kind: 'matched',
  name: null,
  hostId: null,
  scheduledAt: null,
  roomCode: null,
  codeExpiresAt: null,
  icebreakers: [],
} satisfies GroupResponse;

// Added Sep 26 (wave 2): the home list — the demo group plus a wrapped-up meetup for the "past" section.
export const hangoutsFixture = {
  hangouts: [
    {
      id: DEMO_GROUP_ID,
      kind: 'matched',
      name: null,
      status: 'confirmed',
      reasoning: matchFixture.reasoning,
      memberCount: 4,
      formedAt: '2026-09-26T13:00:00.000Z',
      scheduledAt: null,
      completedAt: null,
      roomCode: null,
      hostId: null,
      isPast: false,
    },
    {
      id: DEMO_MEETUP_GROUP_ID,
      kind: 'meetup',
      name: 'HackGT Opening Mixer',
      status: 'completed',
      reasoning: '',
      memberCount: 6,
      formedAt: '2026-09-25T22:00:00.000Z',
      scheduledAt: '2026-09-25T22:00:00.000Z',
      completedAt: '2026-09-26T01:00:00.000Z',
      roomCode: null,
      hostId: people[2].id,
      isPast: true,
    },
  ],
} satisfies HangoutsResponse;

export const photosFixture = {
  photos: [] as Photo[],
} satisfies PhotosResponse;

export const notificationsFixture = {
  notifications: [
    {
      id: 'n1',
      type: 'hangout_invited',
      payload: { groupId: DEMO_GROUP_ID, name: 'Duckpin Bowling and Food Hall Hangout' },
      read: false,
      createdAt: '2026-09-26T12:00:00.000Z',
    },
    {
      id: 'n2',
      type: 'message_received',
      payload: { groupId: DEMO_GROUP_ID, senderName: 'Maya Patel' },
      read: false,
      createdAt: '2026-09-26T14:05:00.000Z',
    },
  ] satisfies Notification[],
} satisfies NotificationsResponse;

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
