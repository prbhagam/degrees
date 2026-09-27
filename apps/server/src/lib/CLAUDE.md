# apps/server/src/lib

Shared library modules for the Degrees API server.

## Modules
- `errors.ts`: `ApiError` class and `validateJson` request validator.
- `graph.ts`: BFS graph traversal (`exploreFrom`), reach calculations, and degree resolution.
- `groups.ts`: Group lifecycle, group membership (`memberRows`), atomic stage locking (`claimActivityStageLock`), and activity job persistence.
- `log.ts`: Structured JSON logging and execution timing (`timed`).
- `notify.ts`: Realtime notification writer and event fan-out.
- `profileStatus.ts`: Profile onboarding completeness evaluator (`isProfileComplete`).
