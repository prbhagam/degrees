// Owner: shared web scaffold (Christian merges contract changes) — keep helpers in docs/API-CONTRACTS.md order.
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
import {
  getSupabaseClient,
  isSupabaseEnvironmentUnset,
} from './supabase.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function accessToken(): Promise<string> {
  if (import.meta.env.DEV && isSupabaseEnvironmentUnset()) {
    return 'dev';
  }
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new ApiError(401, 'unauthorized', 'Sign in before calling the API.');
  }
  return data.session.access_token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const responseText = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch {
    if (!response.ok) {
      throw new ApiError(
        response.status,
        'request_failed',
        response.statusText,
      );
    }
    throw new ApiError(
      response.status,
      'invalid_response',
      'The API response was not valid JSON.',
    );
  }
  if (!response.ok) {
    const apiError =
      typeof body === 'object' && body !== null
        ? (body as Partial<ApiErrorBody>)
        : undefined;
    throw new ApiError(
      response.status,
      apiError?.error?.code ?? 'request_failed',
      apiError?.error?.message ?? 'The API request failed.',
    );
  }
  return body as T;
}

export const api = {
  getMe: () => request<MeResponse>('/api/me'),
  updateProfile: (body: UpdateProfileRequest) =>
    request<OkResponse>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  updatePreferences: (body: UpdatePreferencesRequest) =>
    request<OkResponse>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  createConnection: (body: CreateConnectionRequest) =>
    request<CreateConnectionResponse>('/api/connections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getGraph: () => request<GraphResponse>('/api/graph/me'),
  joinEvent: (roomCode: string) =>
    request<JoinEventResponse>(`/api/events/${encodeURIComponent(roomCode)}/join`, {
      method: 'POST',
    }),
  runMatch: () => request<MatchRunResponse>('/api/match/run', { method: 'POST' }),
  getGroup: (id: string) =>
    request<GroupResponse>(`/api/groups/${encodeURIComponent(id)}`),
  generateActivity: (id: string) =>
    request<Activity>(`/api/groups/${encodeURIComponent(id)}/activity`, {
      method: 'POST',
    }),
  getMessages: (id: string, since?: string) =>
    request<MessagesResponse>(
      `/api/groups/${encodeURIComponent(id)}/messages${since ? `?since=${encodeURIComponent(since)}` : ''}`,
    ),
  sendMessage: (id: string, body: SendMessageRequest) =>
    request<SendMessageResponse>(`/api/groups/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submitFeedback: (id: string, body: FeedbackRequest) =>
    request<FeedbackResponse>(`/api/groups/${encodeURIComponent(id)}/feedback`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
