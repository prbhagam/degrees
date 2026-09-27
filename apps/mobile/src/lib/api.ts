// Owner: shared mobile scaffold (Christian merges contract changes) — keep helpers in docs/API-CONTRACTS.md order.
import type {
  Activity,
  ActivityJobResponse,
  ApiErrorBody,
  CreateConnectionRequest,
  CreateConnectionResponse,
  CreateEventRequest,
  CreateEventResponse,
  ExchangeResponse,
  FeedbackRequest,
  FeedbackResponse,
  GraphResponse,
  GroupResponse,
  HangoutsResponse,
  IcebreakersResponse,
  JoinEventResponse,
  MatchRunResponse,
  MeResponse,
  MessagesResponse,
  NotificationSettingsResponse,
  NotificationsResponse,
  OkResponse,
  PhotosResponse,
  ProposeTimeRequest,
  SendMessageRequest,
  SendMessageResponse,
  SignupRequest,
  SignupResponse,
  TimesResponse,
  TimeVoteRequest,
  UpdateNotificationSettingsRequest,
  UpdatePreferencesRequest,
  UpdateProfileRequest,
} from '@degrees/shared';
import Constants from 'expo-constants';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from './supabase';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const DEV_API_PORT = 8787;

function baseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  if (__DEV__) {
    // hostUri is the Metro host (e.g. 192.168.1.20:8081), so a physical phone on the same Wi-Fi
    // reaches the API on the dev machine; the iOS simulator resolves it too.
    const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
    return `http://${host}:${DEV_API_PORT}`;
  }
  throw new ApiError(
    0,
    'config_error',
    'EXPO_PUBLIC_API_URL must be set for release builds.',
  );
}

async function accessToken(): Promise<string> {
  if (isSupabaseEnvironmentUnset()) {
    // No Supabase project configured at all — nothing to authenticate against, so this can only be
    // pointed at the mock-mode server, which accepts any bearer token.
    return 'dev';
  }
  // CHANGED Sep 26 (Charles, from #16): this used to also fall back to 'dev' whenever __DEV__ was true and
  // the user was signed out, even with a real Supabase project configured — so a real-mode server said
  // "access token is invalid" on every screen instead of "you're not signed in". The auth gate
  // (features/auth/session.ts) sends signed-out users to /login.
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new ApiError(401, 'unauthorized', 'Sign in before calling the API.');
  }
  return data.session.access_token;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// `authenticated: false` is only for the public auth routes, which are called before a session exists.
async function request<T>(
  path: string,
  init?: RequestInit,
  { authenticated = true }: { authenticated?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (authenticated) {
    headers.set('Authorization', `Bearer ${await accessToken()}`);
  }
  if (init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  const body = parseJson(await response.text());
  if (!response.ok) {
    const apiError = body as Partial<ApiErrorBody> | undefined;
    throw new ApiError(
      response.status,
      apiError?.error?.code ?? 'request_failed',
      apiError?.error?.message ??
        (response.statusText || 'The API request failed.'),
    );
  }
  if (body === undefined) {
    throw new ApiError(
      response.status,
      'invalid_response',
      'The API returned a non-JSON response.',
    );
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

const groupPath = (id: string) => `/api/groups/${encodeURIComponent(id)}`;

export const api = {
  signup: (body: SignupRequest) =>
    request<SignupResponse>('/api/auth/signup', json('POST', body), {
      authenticated: false,
    }),
  getMe: () => request<MeResponse>('/api/me'),
  updateProfile: (body: UpdateProfileRequest) =>
    request<OkResponse>('/api/profile', json('PUT', body)),
  updatePreferences: (body: UpdatePreferencesRequest) =>
    request<OkResponse>('/api/preferences', json('PUT', body)),
  createConnection: (body: CreateConnectionRequest) =>
    request<CreateConnectionResponse>('/api/connections', json('POST', body)),
  getGraph: () => request<GraphResponse>('/api/graph/me'),
  joinEvent: (roomCode: string) =>
    request<JoinEventResponse>(
      `/api/events/${encodeURIComponent(roomCode)}/join`,
      {
        method: 'POST',
      },
    ),
  runMatch: () =>
    request<MatchRunResponse>('/api/match/run', { method: 'POST' }),
  getGroup: (id: string) => request<GroupResponse>(groupPath(id)),
  respondToGroup: (id: string, accept: boolean) =>
    request<OkResponse>(`${groupPath(id)}/respond`, json('POST', { accept })),
  // Starts the plan job (returns a 'generating' placeholder); useActivityJob drives it with advanceActivity.
  generateActivity: (id: string) =>
    request<Activity>(`${groupPath(id)}/activity`, { method: 'POST' }),
  advanceActivity: (id: string) =>
    request<ActivityJobResponse>(`${groupPath(id)}/activity/advance`, { method: 'POST' }),
  getMessages: (id: string, since?: string) =>
    request<MessagesResponse>(
      `${groupPath(id)}/messages${since ? `?since=${encodeURIComponent(since)}` : ''}`,
    ),
  sendMessage: (id: string, body: SendMessageRequest) =>
    request<SendMessageResponse>(
      `${groupPath(id)}/messages`,
      json('POST', body),
    ),
  submitFeedback: (id: string, body: FeedbackRequest) =>
    request<FeedbackResponse>(`${groupPath(id)}/feedback`, json('POST', body)),
  // Added Sep 26: host-created events, contact exchange, photos, notifications.
  createEvent: (body: CreateEventRequest) =>
    request<CreateEventResponse>('/api/events', json('POST', body)),
  completeGroup: (id: string) =>
    request<OkResponse>(`${groupPath(id)}/complete`, { method: 'POST' }),
  requestExchange: (id: string, peerId: string) =>
    request<ExchangeResponse>(
      `${groupPath(id)}/exchange-request`,
      json('POST', { peerId }),
    ),
  acceptExchange: (id: string, peerId: string) =>
    request<ExchangeResponse>(
      `${groupPath(id)}/exchange-accept`,
      json('POST', { peerId }),
    ),
  getPhotos: (id: string) => request<PhotosResponse>(`${groupPath(id)}/photos`),
  addPhoto: (id: string, storagePath: string) =>
    request<PhotosResponse>(`${groupPath(id)}/photos`, json('POST', { storagePath })),
  getNotifications: () => request<NotificationsResponse>('/api/notifications'),
  // Added Sep 26 (wave 2): one list of groups + meetups, leave, icebreakers.
  getHangouts: () => request<HangoutsResponse>('/api/hangouts'),
  leaveGroup: (id: string) =>
    request<OkResponse>(`${groupPath(id)}/leave`, { method: 'POST' }),
  generateIcebreakers: (id: string) =>
    request<IcebreakersResponse>(`${groupPath(id)}/icebreakers`, { method: 'POST' }),
  // Added Sep 26 (wave 3): plan history + contact exchange from Your Circle.
  restoreActivity: (id: string, activityId: string) =>
    request<Activity>(`${groupPath(id)}/activity/restore`, json('POST', { activityId })),
  exchangeContact: (peerId: string) =>
    request<ExchangeResponse>('/api/graph/exchange', json('POST', { peerId })),
  // Added Sep 26 (wave 4): rename a group or meetup.
  renameGroup: (id: string, name: string) => request<OkResponse>(groupPath(id), json('PUT', { name })),
  // Added Sep 26 (wave 5): times for the plan — propose, say you're free, lock one in, withdraw yours.
  proposeTime: (id: string, body: ProposeTimeRequest) =>
    request<TimesResponse>(`${groupPath(id)}/times`, json('POST', body)),
  voteTime: (id: string, timeId: string, body: TimeVoteRequest) =>
    request<TimesResponse>(`${groupPath(id)}/times/${encodeURIComponent(timeId)}/vote`, json('POST', body)),
  chooseTime: (id: string, timeId: string) =>
    request<TimesResponse>(`${groupPath(id)}/times/${encodeURIComponent(timeId)}/choose`, { method: 'POST' }),
  deleteTime: (id: string, timeId: string) =>
    request<TimesResponse>(`${groupPath(id)}/times/${encodeURIComponent(timeId)}`, { method: 'DELETE' }),
  // Added Sep 26 (wave 5): the feed is marked read on open; per-kind toggles live on the profile.
  markNotificationsRead: () => request<OkResponse>('/api/notifications/read', { method: 'POST' }),
  getNotificationSettings: () => request<NotificationSettingsResponse>('/api/notifications/settings'),
  updateNotificationSettings: (body: UpdateNotificationSettingsRequest) =>
    request<NotificationSettingsResponse>('/api/notifications/settings', json('PUT', body)),
};
