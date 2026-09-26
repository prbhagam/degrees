// Contract made real: all four owners import this and Christian merges changes; changing it is a four-person conversation (docs/API-CONTRACTS.md).
import type { z } from 'zod';
import type {
  activitySchema,
  analyzeFeedbackOutputSchema,
  createConnectionRequestSchema,
  feedbackRequestSchema,
  sendMessageRequestSchema,
  updatePreferencesRequestSchema,
  updateProfileRequestSchema,
} from './schemas.js';

export type Frequency = 'daily' | 'weekly' | 'monthly';
export type ConnectionContext = 'qr' | 'event' | 'group' | 'manual';
export type TagKind = 'hobby' | 'activity' | 'derived';
export type GroupStatus = 'proposed' | 'confirmed' | 'completed';
export type ActivitySource = 'maps' | 'ticketmaster';
export type Sentiment = 'positive' | 'neutral' | 'negative';

// CONTRACT GAP: assumed nullable database profile fields stay nullable in GET /api/me; confirm at H0.
export interface MeResponse {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  city: string | null;
  hasCompletedProfile: boolean;
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

export interface OkResponse {
  ok: true;
}

export interface CreateConnectionResponse extends OkResponse {
  edgeCreated: boolean;
}

export interface GraphResponse {
  nodes: { id: string; displayName: string; degree: number }[];
  edges: { a: string; b: string }[];
}

export interface JoinEventResponse {
  eventId: string;
  name: string;
  attendees: { id: string; displayName: string }[];
}

export interface GroupMember {
  id: string;
  displayName: string;
  degree: number;
  sharedInterests: string[];
}

export interface MatchRunResponse {
  groupId: string;
  members: GroupMember[];
  reasoning: string;
}

export type Activity = z.infer<typeof activitySchema>;

export interface GroupResponse {
  id: string;
  status: GroupStatus;
  reasoning: string;
  // CONTRACT GAP: assumed the underspecified members array reuses GroupMember; confirm at H0.
  members: GroupMember[];
  activity: Activity | null;
}

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

export type AnalyzeFeedbackOutput = z.infer<
  typeof analyzeFeedbackOutputSchema
>;
