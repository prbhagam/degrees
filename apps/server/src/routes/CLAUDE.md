# apps/server/src/routes

Hono sub-app routers mounted on the Degrees API server.

## Overview
- `auth.ts`: Public authentication (`POST /api/auth/signup`).
- `admin.ts`: Web admin dashboard (`GET /admin`) and batch match trigger (`POST /admin/api/match-all`).
- `connections.ts`: In-person connections and graph query (`/api/connections`, `/api/connections/contacts`, `/api/graph`).
- `events.ts`: Event creation and joining (`/api/events`, `/api/events/:roomCode/join`).
- `feedback.ts`: Post-hangout feedback submission and score updates (`/api/feedback`).
- `groups.ts`: Group lifecycle, members, activity suggestions, icebreakers, photos, and contact exchange.
- `hangouts.ts`: Active groups and meetups listing for Home feed (`/api/hangouts`).
- `match.ts`: Single-user matching run (`POST /api/match/run`).
- `me.ts`: Requester profile status and summary (`/api/me`).
- `messages.ts`: Group chat messages (`/api/groups/:id/messages`).
- `notifications.ts`: User notifications (`/api/notifications`).
- `preferences.ts`: User matching preferences (`/api/preferences`).
- `profile.ts`: User profile retrieval, edit, and tags (`/api/profile`).
