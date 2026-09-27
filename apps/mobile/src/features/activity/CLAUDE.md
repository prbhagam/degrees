# apps/mobile/src/features/activity

Activity curation, stage driving, plan display, and time proposals.

## Components & Hooks
- `ActivityScreen.tsx`: Detailed activity screen displaying curated venue, map, pricing, reasoning, source attribution, history, and error recovery for rate-limited / failed jobs.
- `useActivityJob.ts`: Polling driver that steps through activity generation stages until 'ready' or 'failed'.
- `TimesCard.tsx`: Time slot proposals and voting for the planned activity.
- `format.ts`: Price and datetime formatting utilities.
