// Contract made real: all four owners import this and Christian merges changes; changing it is a four-person conversation (docs/API-CONTRACTS.md).
import type { z } from 'zod';
import type {
  activitySchema,
  analyzeFeedbackOutputSchema,
  createConnectionRequestSchema,
  createEventRequestSchema,
  exchangeRequestSchema,
  feedbackRequestSchema,
  generateIcebreakersOutputSchema,
  hangoutKindSchema,
  notificationTypeSchema,
  respondRequestSchema,
  addPhotoRequestSchema,
  sendMessageRequestSchema,
  signupRequestSchema,
  updatePreferencesRequestSchema,
  updateProfileRequestSchema,
} from './schemas';

// CHANGED Sep 26: added biweekly + few_times_week (see schemas.ts).
export type Frequency =
  'daily' | 'few_times_week' | 'weekly' | 'biweekly' | 'monthly';
export type ConnectionContext = 'qr' | 'event' | 'group' | 'manual';
export type TagKind = 'hobby' | 'activity' | 'derived' | 'avoid';
export type GroupStatus = 'proposed' | 'confirmed' | 'completed';
export type ActivitySource = 'maps' | 'ticketmaster';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type FeedbackRelationship = 'great' | 'fine' | 'not_for_me';
export type NotificationType = z.infer<typeof notificationTypeSchema>;
// Added Sep 26 (wave 2): a group is matched (auto-generated, non-joinable) or a meetup (joinable by room code /
// QR, people who actually met in person). Same container either way — see docs/DATA-MODEL.md.
export type HangoutKind = z.infer<typeof hangoutKindSchema>;

// CONTRACT GAP: assumed nullable database profile fields stay nullable in GET /api/me; confirm at H0.
// CHANGED Sep 26: added phone/pronouns/photoUrl (collected at signup), and aiParagraph/tags — these
// were previously write-only (PUT /profile took them but GET /me never returned them), which meant
// any client that re-PUTs after fetching /me silently wipes them. Closing that gap here rather than
// working around it in the edit-profile screen.
export interface MeResponse {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  aiParagraph: string | null;
  city: string | null;
  phone: string | null;
  pronouns: string | null;
  photoUrl: string | null;
  tags: { label: string; kind: TagKind }[];
  hasCompletedProfile: boolean;
  // Added Sep 26 (wave 2): what onboarding still needs. Matching (POST /match/run) requires all three; hosting
  // or joining a meetup never does. hasCompletedProfile is now "every step done".
  profileStatus: ProfileStatus;
  // Added Sep 26 (wave 2): saved preferences, so the preferences screen prefills. Null until first saved.
  preferences: UpdatePreferencesRequest | null;
}

export interface ProfileStatus {
  interests: boolean;
  about: boolean;
  preferences: boolean;
}

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type UpdatePreferencesRequest = z.infer<
  typeof updatePreferencesRequestSchema
>;
export type CreateConnectionRequest = z.infer<
  typeof createConnectionRequestSchema
>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;
export type ExchangeRequest = z.infer<typeof exchangeRequestSchema>;
export type RespondRequest = z.infer<typeof respondRequestSchema>;
export type AddPhotoRequest = z.infer<typeof addPhotoRequestSchema>;

export interface OkResponse {
  ok: true;
}

// Added Sep 26 — POST /api/auth/signup. The client signs in with the password right after.
export interface SignupResponse extends OkResponse {
  userId: string;
}

export interface CreateConnectionResponse extends OkResponse {
  edgeCreated: boolean;
}

// CHANGED Sep 26: the graph view only ever shows 1st-degree connections (people actually met in
// person) — this is not a browsable directory of the wider matching pool. `mutualEdges` are edges
// between two of the viewer's own 1st-degree connections who also know each other.
export interface GraphResponse {
  // CHANGED Sep 26: added bio/photoUrl for Circle's tap-to-view-profile — safe to include because
  // every node here is already a 1st-degree connection (exploreFrom(viewerId, 1)), never a stranger.
  nodes: {
    id: string;
    displayName: string;
    bio: string | null;
    photoUrl: string | null;
    metAt: string | null;
  }[];
  edges: { a: string; b: string }[];
  mutualEdges: { a: string; b: string }[];
}

export interface JoinEventResponse {
  eventId: string;
  // Added Sep 26 (wave 2): the meetup's backing group — chat, plan, photos, icebreakers, and leave all live there.
  groupId: string;
  name: string;
  hostId: string | null;
  scheduledAt: string | null;
  codeExpiresAt: string | null;
  endedAt: string | null;
  // CHANGED Sep 26: bio/photoUrl added — the event lobby shows everyone present, not gated on the
  // connections graph. This does not itself form a connection edge; that's still the explicit
  // "We met" action per attendee (JoinRoomScreen / POST /connections).
  attendees: {
    id: string;
    displayName: string;
    bio: string | null;
    photoUrl: string | null;
    // Added Sep 26 (wave 2): a connections edge already exists with the viewer, so "We met" isn't offered again.
    alreadyMet: boolean;
  }[];
}

// CHANGED Sep 26 — BREAKING: previously every member's real displayName + a `via` chain was sent
// to the client regardless of degree. The validated design says you never see anyone past 1st
// degree until you've actually met them — so the server now redacts identity for degree > 1:
// `id`/`displayName` are null and `revealed` is false. `via` is gone; nobody sees the chain to
// someone they haven't met. Flag for Sahith (matching output) and Pranav (GroupScreen/MatchScreen
// currently assume every member has a real name).
export interface GroupMember {
  id: string | null;
  displayName: string | null;
  // CHANGED Sep 26: bio/photoUrl for the "basic info" the design calls for once a group is
  // confirmed (see `revealed`'s doc below) — null whenever displayName is null.
  bio: string | null;
  photoUrl: string | null;
  degree: number;
  sharedInterests: string[];
  // CHANGED Sep 26: revealed is no longer purely graph-degree. Accepting into a group is itself
  // treated as committing to meet, so revealed is also true once the group leaves 'proposed' —
  // otherwise GroupScreen and ChatScreen would show a real name to people who haven't met while
  // the match is still a live proposal (the actual thing the redaction rule protects), then
  // contradict each other once you're both chatting to coordinate a meetup you already agreed to.
  revealed: boolean;
  // Added Sep 26 (wave 2): a connections edge exists between the viewer and this member (degree 1). Drives the
  // per-person "We met" action, which is now the ONLY way a matched group forms edges (completing a matched
  // group no longer auto-connects everyone; ending a meetup still does).
  met: boolean;
}

export interface MatchRunResponse {
  groupId: string;
  members: GroupMember[];
  // Count of proposed members who are degree > 1 and therefore not named above.
  unrevealedCount: number;
  reasoning: string;
}

export type Activity = z.infer<typeof activitySchema>;
export type ActivityStatus = 'generating' | 'ready' | 'failed';

// Added Sep 26 (wave 2, legacy Netlify plan): plan generation is a resumable job of single-call stages, each run by
// one POST /groups/:id/activity/advance inside its own function budget. `stage` is what runs on the next advance.
export type ActivityJobStage = 'grounded' | 'grounded_lite' | 'places' | 'ticketmaster' | 'fixture';

export interface ActivityJobResponse {
  status: ActivityStatus;
  stage: ActivityJobStage | null;
  activity: Activity | null;
}

export interface GroupResponse {
  id: string;
  status: GroupStatus;
  reasoning: string;
  members: GroupMember[];
  unrevealedCount: number;
  activity: Activity | null;
  // Christian (PR #22): 'generating' while the background plan runs; null when there's no activity row.
  activityStatus: ActivityStatus | null;
  // Set once the host (or any member) marks the hangout done. Chat and photos go read-only
  // 24h after this timestamp — see CreateEvent/Group screens.
  completedAt: string | null;
  // Added Sep 26 (wave 2) — meetups share this shape. name/roomCode/hostId/scheduledAt/codeExpiresAt are null
  // for a matched group; roomCode is null once the code has expired or the meetup ended.
  kind: HangoutKind;
  name: string | null;
  // The meetup's `events` row (what QR-formed connections carry as eventId); null for a matched group.
  eventId: string | null;
  hostId: string | null;
  scheduledAt: string | null;
  roomCode: string | null;
  codeExpiresAt: string | null;
  icebreakers: string[];
}

// Added Sep 26 (wave 2): GET /api/hangouts — every group the viewer is in, matched and meetup alike, for one home
// list. Sorted active first (soonest scheduled / most recently formed), then past.
export interface HangoutSummary {
  id: string;
  kind: HangoutKind;
  name: string | null;
  status: GroupStatus;
  reasoning: string;
  memberCount: number;
  formedAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  // Meetups only: the code to share, while it's still valid.
  roomCode: string | null;
  hostId: string | null;
  isPast: boolean;
}

export interface HangoutsResponse {
  hangouts: HangoutSummary[];
}

export interface IcebreakersResponse {
  icebreakers: string[];
}

export interface GenerateIcebreakersInput {
  name: string | null;
  members: { displayName: string; interests: string[] }[];
}

export type GenerateIcebreakersOutput = z.infer<typeof generateIcebreakersOutputSchema>;

export interface Message {
  // CONTRACT GAP: assumed messages.id bigserial is serialized as a string; confirm at H0.
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface MessagesResponse {
  messages: Message[];
}

export interface SendMessageResponse {
  id: string;
  createdAt: string;
}

export interface FeedbackResponse extends OkResponse {
  derivedTags: string[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

// ---- Added Sep 26: host-created events, contact exchange, photos, notifications ------------

export interface CreateEventResponse {
  eventId: string;
  roomCode: string;
}

// Only non-null once both `requesterAccepted` and `peerAccepted` are true — computed server-side,
// never trust a client-supplied phone number.
export interface ExchangeResponse {
  requesterAccepted: boolean;
  peerAccepted: boolean;
  peerPhone: string | null;
}

export interface Photo {
  id: string;
  uploaderId: string;
  uploaderName: string;
  storagePath: string;
  // Added Sep 26 (wave 2): a signed read URL for the private event-photos bucket (about an hour). Null in mock
  // mode or if signing failed; the client shows a placeholder tile then.
  url: string | null;
  createdAt: string;
}

export interface PhotosResponse {
  photos: Photo[];
}

export interface Notification {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
}

// CONTRACT GAP: assumed candidate prefs are the complete documented preferences request shape; confirm at H0.
export interface FormGroupsInput {
  requesterId: string;
  candidates: {
    id: string;
    displayName: string;
    degree: number;
    interests: string[];
    prefs: UpdatePreferencesRequest;
  }[];
  sizeRange: { min: number; max: number };
}

export interface FormGroupsOutput {
  memberIds: string[];
  reasoning: string;
}

export interface GenerateActivityInput {
  members: { displayName: string; interests: string[] }[];
  constraints: {
    maxCostCents: number;
    maxTravelMi: number;
    city: string;
    lat: number;
    lng: number;
  };
}

export type AnalyzeFeedbackOutput = z.infer<typeof analyzeFeedbackOutputSchema>;
