# apps/mobile/src/features/groups

Group details, member actions, and activity preview.

## Components & Hooks
- `GroupScreen.tsx`: Unified screen for matched groups and meetups, member lists, accept/decline, icebreakers, and activity plan preview with fail-fast rate-limit handling and retry.
- `degrees.ts`: Member degree label formatting and title resolution.
- `queries.ts`: TanStack Query hooks for group data (`useGroup`, `useHangouts`).
