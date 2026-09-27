# apps/mobile — agent context

The Degrees iOS app: **Expo SDK 57 · React Native 0.86 · Expo Router · NativeWind v4**. Nothing is written in Swift. Read the root [AGENTS.md](../../AGENTS.md) first for the product rules. This file covers what's specific to the app.

**Owners:** Charles (auth, onboarding, profile, feedback) · Pranav (home, events, groups, activity, chat, photos, Circle) · Christian (notifications screen). The shared scaffold (`src/lib`, `src/stores`, `src/components`, `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`) is Charles's. Changes to `src/lib/api.ts` follow the contract, and Christian merges those.

---

## Layout

```
src/app/                 Expo Router routes. Every file is a screen; _layout.tsx files are navigators.
  _layout.tsx            providers (TanStack Query) + root Stack. Rarely changes.
  (tabs)/_layout.tsx     the bottom nav (Home · Circle · You) from the validated design     (Charles)
  (tabs)/index.tsx                         → features/home          (Pranav) your groups, find a group, meet someone, host/join
  (tabs)/circle.tsx                        → features/circle        (Pranav) Your circle: list + map + Play (BumpPlayground, wave 4), contact exchange (wave 3)
  (tabs)/profile.tsx                       → features/profile       (Charles) "Degree 0 (You)"
  login.tsx signup.tsx                     → features/auth          (Charles)
  onboarding/{interests,about,preferences}.tsx → features/onboarding (Charles)
  profile/edit.tsx                         → features/profile       (Charles)
  groups/[id]/feedback.tsx                 → features/feedback      (Charles) 3-way signal, groups AND meetups (exchange moved to circle in wave 3)
  join/index.tsx  join/[roomCode].tsx      → features/events        (Pranav) room code entry · joins, then opens groups/[id] (wave 2)
  connect/index.tsx  connect/[peerId].tsx  → features/events        (Pranav) my QR (needs an active event) · deep-link target that forms an edge
  scan.tsx                                 → features/events        (Pranav) one scanner for event + person QR codes
  create-event.tsx                         → features/events        (Pranav) host a hangout
  match.tsx                                → features/groups        (Pranav) runs matching, then opens the group
  groups/[id]/index.tsx                    → features/groups        (Pranav) one screen for matched groups AND meetups (wave 2): members + "We met",
                                                                     code/QR, icebreakers, per-member accept/decline (wave 4), rename, end/complete, leave
  groups/[id]/activity.tsx                 → features/activity      (Pranav) current plan + earlier plans with "Use this plan" (wave 3)
  groups/[id]/chat.tsx                     → features/chat          (Pranav) Realtime + 3s polling fallback
  groups/[id]/photos.tsx                   → features/photos        (Pranav) grid → full-screen viewer (pinch zoom, save to camera roll; wave 3)
  notifications.tsx                        → features/notifications (Christian)
src/features/<feature>/  the real screens, components, and hooks for that feature
src/lib/api.ts           typed fetch wrapper for every API endpoint; attaches the Supabase JWT
src/lib/supabase.ts      publishable-key Supabase client (READS ONLY)
src/lib/query.ts         TanStack Query client — wave 2: persisted to expo-sqlite, refetch on foreground, LIVE_POLL_MS (60s) for live screens
src/lib/storage.ts       wave 2: the on-device key/value store behind the query cache and the persisted session slice
src/lib/upload.ts        wave 2: expo-image-picker + the ONLY direct Supabase writes (Storage: event-photos, avatars)
src/stores/session.ts    Zustand: currentUser, activeGroupId, activeEvent (persisted), onboardingSkippedBy (persisted)
src/features/onboarding/flow.ts  wave 2: next/skip/returnTo for the three onboarding steps
src/features/onboarding/options.ts  wave 3: COMMON_INTERESTS + AVOID_OPTIONS, shared by onboarding and Edit profile
src/components/ui.tsx    the app's one UI kit (validated design) — use it instead of new primitives
src/components/DegreesMark.tsx   wave 4: the brand mark drawn in code (rings + orbiting node); LoadingState uses it animated
src/components/AnimatedSplash.tsx  wave 4: the ~1.5s animated splash mounted by the root layout after the native (plain paper) splash
```

## The routing pattern (why nobody collides)

Files in `src/app/` are **one-line re-exports**:

```tsx
// Owner: Pranav (Groups, Activities & Chat) — route file only; the screen lives in src/features/chat.
export { ChatScreen as default } from '@/features/chat/ChatScreen';
```

To add a screen:
1. Build it in your own `src/features/<feature>/`.
2. Add a re-export file under `src/app/` at the URL you want.

You never edit another feature's files, and you never edit `_layout.tsx` just to register a route. The one exception is a new **tab**, which has to be added to `(tabs)/_layout.tsx` (Charles's). Keep all non-route code out of `src/app/`.

Deep links come free from the `degrees` scheme in `app.json`. For example, `degrees://join/HACKGT` opens `join/[roomCode].tsx`. **In Expo Go the scheme is `exp://<ip>:8081/--/join/HACKGT` instead**, so build QR links with `Linking.createURL()` (see `features/events/links.ts`), never a hard-coded `degrees://`. The in-app scanner accepts both forms.

## Data rules

- **Every write goes through `api.ts`**, which calls the API server. Never `insert`, `update`, `upsert` or `delete` through the Supabase client, and never import Gemini here. The one exception (wave 2) is `lib/upload.ts`, which puts image bytes in Storage under RLS-style storage policies and then posts the path to the API.
- Direct Supabase **reads** are allowed only for what [API-CONTRACTS.md](../../docs/API-CONTRACTS.md) lists: your own profile and preferences, the members of your groups, chat messages via Realtime, and your own notifications. Never select `*` from `profiles` — signed-in clients can't read `lat`, `lng`, `phone`, `pronouns`, or `photo_url` (migrations 0005/0006), so a `*` select fails.
- **Anyone past 1st degree is redacted by the server** (`revealed: false`, null id/name/bio/photo) until the group is confirmed. Render the redacted state; never try to recover identity another way.
- Fetch through **TanStack Query** (`useQuery` / `useMutation` wrapping `api.*`). The server is the source of truth, so no optimistic local state. **Wave 2:** every list screen has a `RefreshControl`; screens showing live data pass `refetchInterval: LIVE_POLL_MS` (one minute, focused only); the cache is persisted to disk (`PersistQueryClientProvider`, cleared on sign-out) so `queryKeys` in `features/groups/queries.ts` are the shared key registry — bump `persistOptions.buster` when a cached shape changes. **Wave 4:** drive `RefreshControl` with `usePullToRefresh(query.refetch)` from `lib/query.ts`, never `query.isRefetching` — the latter opens the spinner on every background poll and shoves the list.
- **Realtime needs the JWT on the socket.** `useMessages` calls `supabase.realtime.setAuth(session.access_token)` before subscribing (verified against the shared project: without it the channel says SUBSCRIBED and delivers nothing). Do the same for any new subscription. **One channel topic per hook instance** (a random suffix, see `useGroup`): supabase-js caches channels by topic and `.on()` on an already-subscribed channel throws "cannot add postgres_changes callbacks after subscribe()". `useGroup` (wave 3) watches `activities`, `group_members`, and the `groups` row on one channel.
- **Home is `/`.** Never navigate to `'/index'` — it isn't a route the router knows and lands on "Unmatched Route" (wave 3 fix). From a pushed screen, go home with `router.dismissTo('/')`; from login/onboarding use `enterApp()`.
- **Speak in degrees, lightly.** You are degree 0; people you've met are your 1st degree; friends of friends are 2nd. Use it where it explains something (member badges via `memberDegreeLabel`, Profile is "Degree 0 (You)", the preferences dial) and not as decoration — wave 4 thinned it back after it started to clutter. The tab is "Your circle". The brand motif is the mark (`DegreesMark`) and the `°` glyph.
- Types and Zod schemas come from `@degrees/shared`. Use the shared schemas for form validation, and don't redeclare shapes.

## Env and the API URL

- Env lives in **`apps/mobile/.env`**, not the repo root, because Expo reads `.env` from the app folder. Copy `.env.example`.
- `EXPO_PUBLIC_*` values are **baked into the app bundle and public**. Only the Supabase URL and publishable (anon) key go here, never the service role key.
- With no Supabase env in dev, `api.ts` sends `Bearer dev` and the mock-mode server accepts it, so every screen works against fixtures without signing in (the auth gate treats that as signed in).

## Auth

- **Signup** (email, username, phone, password) calls `api.signup` (`POST /api/auth/signup`, public), then `signInWithPassword` with that email. **Login** is `signInWithPassword` with the email (`emailSchema` normalizes it). Changed Sep 27: there is no username → `@degrees.demo` mapping any more; demo accounts log in with their full address (`maya.chen@degrees.demo`). Never call `supabase.auth.signUp`: the project requires email confirmation and its mailer is rate-limited.
- **The gate** is `features/auth/session.ts`, mounted in the root layout. `useAuthSubscription` restores the saved session (the splash stays up until it has), and `AuthGate` sends any signed-out visit to `/login`, remembering where it was headed. Once per sign-in it sends an unfinished profile (`hasCompletedProfile: false`) to onboarding.
- After login, or at the end of onboarding, call `consumePendingHref()` to go where the person was headed, e.g. a scanned `join/HACKGT` link, and enter through `enterApp()` (wave 2), which collapses the auth/onboarding stack so a left-edge swipe can't return to login or onboarding. Onboarding steps advance with `router.replace`, never `push`.
- **Onboarding can be skipped** (wave 2): `onboardingSkippedBy` in the session store (persisted per device) keeps the gate from forcing a skipper back; Home shows what's missing from `me.profileStatus`; `/match` redirects to the missing step with `returnTo=/match` when the server answers 409 `profile_incomplete`. Hosting and joining meetups never require a finished profile.
- The production API is `https://degrees-api.netlify.app`. Set it as `EXPO_PUBLIC_API_URL` for release/TestFlight builds.
- The API URL defaults in dev to **the machine running Metro, on port 8787**. That address comes from Expo's `hostUri`, so a phone on the same Wi-Fi reaches your laptop. Set `EXPO_PUBLIC_API_URL` to override it. Release builds require it, and it must be **HTTPS**, because iOS App Transport Security blocks plain HTTP.

## Styling

**NativeWind v4 = Tailwind CSS v3 class names** on React Native components (`className="p-6 text-lg"`). Don't use Tailwind v4 syntax, and don't write web CSS. For animation, use `react-native-reanimated`. Framer Motion doesn't run on React Native.

## Running it

```bash
npm run dev            # from the repo root: API server + Expo. Scan the QR code with Expo Go on an iPhone, or press i for the simulator.
npm run typecheck      # tsc
npm run doctor         # expo-doctor
npm run export:ios     # compile the iOS JS bundle, the check that needs no Xcode
npm run ios:native     # expo run:ios: full native build. Needs Xcode + CocoaPods.
```

`ios/` and `android/` are **generated** by `expo prebuild` (Continuous Native Generation) and gitignored. Never create or edit them by hand. Configure native behaviour in `app.json` and config plugins instead. The camera permission string, for example, lives in the `expo-camera` plugin entry.

---

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json` (currently 57).
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v57.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt, an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need. Never answer from memory.

- **Always `npx expo install <package>`** (run in `apps/mobile`) instead of `npm install`. It resolves SDK-compatible versions.
- `npx expo install --fix` repairs incompatible versions, and `npx expo-doctor` diagnoses them.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios` locally with Xcode, or `npx eas-cli@latest build --profile development` in the cloud.
- Prefer Expo modules (`expo-camera`, `expo-sqlite`, …) over third-party libraries.
- Docs: Expo Router https://docs.expo.dev/router/introduction.md · EAS https://docs.expo.dev/eas/index.md

---

## Known gaps (Sep 26, after wave 3)

Tracked with owners in [docs/ROLES.md](../../docs/ROLES.md#next-steps-sep-26):
- **Notifications** poll once a minute (no Realtime, no mark-read), and nothing writes rows yet.
- **Feedback**: the group-tag chips are never sent. (Contact exchange moved to 1st-degree friends in wave 3, with a real "wants your number" state for the peer; the fake "(demo: they said yes)" link is gone.)
- **Photo save** uses `expo-media-library`, which Expo Go bundles; a dev build needs the plugin entry in `app.json` (added).
- **About**: "Generate tags" is still canned (a real endpoint is Christian's); accepted tags now go out as `hobby`.
- **Preferences** reach counts are hard-coded (values now prefill).
- **Chat push while backgrounded** was deliberately not built (needs APNs + a dev build); in-app delivery is Realtime with a 30s safety poll.
