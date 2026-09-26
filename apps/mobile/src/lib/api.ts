// Owner: shared mobile scaffold (Christian merges contract changes) — keep helpers in docs/API-CONTRACTS.md order.
import type {
  Activity,
  ApiErrorBody,
  CreateConnectionRequest,
  CreateConnectionResponse,
  FeedbackRequest,
  FeedbackResponse,
  GraphResponse,
  GroupResponse,
  JoinEventResponse,
  MatchRunResponse,
  MeResponse,
  MessagesResponse,
  OkResponse,
  SendMessageRequest,
  SendMessageResponse,
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
  if (__DEV__ && isSupabaseEnvironmentUnset()) {
    return 'dev';
  }
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token) {
    if (__DEV__) {
      // Signed out in dev: the mock-mode server accepts any token, so screens work before sign-in does.
      return 'dev';
    }
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
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
  generateActivity: (id: string) =>
    request<Activity>(`${groupPath(id)}/activity`, { method: 'POST' }),
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
};
