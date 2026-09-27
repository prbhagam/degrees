# apps/server/src

Source code for the Degrees API server (Hono on Node.js).

## Structure
- `app.ts`: Hono application setup, middleware, error handlers, and route mounting.
- `index.ts`: Local development entry point listening on $PORT.
- `routes/`: Sub-app routers handling endpoints (auth, admin, groups, match, etc.).
- `matching/`: Candidate traversal, narrowing, group formation, and periodic batch matching.
- `ai/`: Gemini API integration and rate limiting.
- `db/`: Supabase client access (service-role).
- `lib/`: Shared server helpers (errors, graph traversal, logging, profileStatus, groups).
- `middleware/`: Authentication and request context middleware.
- `config/`: Environment configuration and validation.
- `mocks/`: Mock fixtures for local testing without database credentials.
