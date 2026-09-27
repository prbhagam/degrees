# apps/mobile — agent context

The Degrees iOS app: **Expo SDK 57 · React Native 0.86 · Expo Router · NativeWind v4**. Nothing is written in Swift. Read the root [AGENTS.md](../../AGENTS.md) first for the product rules. This file covers what's specific to the app.

**Owners:** Charles (auth, onboarding, profile, feedback) · Pranav (home, events, groups, activity, chat, photos, Circle) · Christian (notifications screen). The shared scaffold (`src/lib`, `src/stores`, `src/components`, `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`) is Charles's. Changes to `src/lib/api.ts` follow the contract, and Christian merges those.

---

## Layout

```
src/app/                 Expo Router routes. Every file is a screen; _layout.tsx files are navigators.
  _layout.tsx            providers (TanStack Query) + root Stack. Rarely changes.
  (tabs)/_layout.tsx     the bottom nav (Home · Chats · Circle · You) from the validated design; items centred over the home indicator (wave 5)  (Charles)
  (tabs)/index.tsx                         → features/home          (Pranav) your groups, find a group, meet someone, host/join
  (tabs)/chats.tsx                         → features/chat          (Pranav) wave 5: every open group chat, newest message first
  (tabs)/circle.tsx                        → features/circle        (Pranav) Your circle: list + the physics map (CircleGraph; wave 6: everyone holds a seat from layout.ts, only you move), contact exchange (wave 3)
  (tabs)/profile.tsx                       → features/profile       (Charles) "Degree 0 (You)"
  login.tsx signup.tsx                     → features/auth          (Charles)
  onboarding/{interests,about,preferences}.tsx → features/onboarding (Charles)
  profile/edit.tsx                         → features/profile       (Charles)
  groups/[id]/feedback.tsx                 → features/feedback      (Charles) 3-way signal, groups AND meetups (exchange moved to circle in wave 3)
  join/index.tsx  join/[roomCode].tsx      → features/events        (Pranav) room code entry · joins, then opens groups/[id] (wave 2)
  connect/index.tsx  connect/[peerId].tsx  → features/events        (Pranav) my QR (needs an active event) · deep-link target that forms an edge
  scan.tsx                                 → features/events        (Pranav) one scanner for event + person QR codes
  create-event.tsx                         → features/events        (Pranav) host a meetup — starts now, no calendar (wave 5)
  match.tsx                                → features/groups        (Pranav) runs matching, then opens the group
  groups/[id]/index.tsx                    → features/groups        (Pranav) one screen for matched groups AND meetups (wave 2): members + "We met",
                                                                     code/QR, icebreakers, per-member accept/decline (wave 4), rename, end/complete, leave
  groups/[id]/activity.tsx                 → features/activity      (Pranav) current plan + earlier plans with "Use this plan" (wave 3) + "When": propose
                                                                     times, mark yourself free, lock one in (TimesCard, wave 5)
  groups/[id]/chat.tsx                     → features/chat          (Pranav) Realtime + 3s polling fallback; header is the group's name (wave 5)
  groups/[id]/photos.tsx                   → features/photos        (Pranav) grid → full-screen viewer (pinch zoom, save to camera roll; wave 3)
  notifications.tsx                        → features/notifications (Christian) Realtime feed, marks itself read on open (wave 5)
  notifications/settings.tsx               → features/notifications (Christian) wave 5: one switch per kind of notification
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
src/components/DegreesMark.tsx   wave 4: the brand mark drawn in code (rings + orbiting node); LoadingState uses it animated. Wave 5: the rings
                                 ripple after the node; the same geometry is rendered into assets/images/icon.png + splash-icon.png
src/components/AnimatedSplash.tsx  wave 4: the animated splash mounted by the root layout. Wave 5: the native splash shows the mark PNG at 132pt
                                 (app.json), so this starts from the same pixels, brings the logo alive, then lifts (~2s)
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
- **One title per group.** `hangoutTitle()` in `features/groups/degrees.ts` names a group everywhere (group screen, chat header, Chats tab): the saved name, else "You + …". Don't hard-code "Group chat" or "Your group" in a header.
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

## Wave 5 (Sep 26, third testing round — Sahith)

- **Chats tab** (`(tabs)/chats.tsx` → `features/chat/ChatsScreen.tsx`): every hangout whose `chatOpen` is true (a meetup, or a confirmed matched group), sorted by `lastMessage.createdAt`; both fields are new on `HangoutSummary`. Tap → `groups/[id]/chat`, whose header is now the group's name.
- **Tab bar** items are centred: the bar's height includes the safe-area inset and pads both sides, instead of leaving the whole home-indicator strip blank underneath.
- **Host a meetup has no calendar.** You host when you're already with the people; it starts now and the code works 24h. Scheduling moved to the plan: `features/activity/TimesCard.tsx` lists proposed times (`GroupResponse.times`), "I'm free" per time, "Lock in" (sets `scheduledAt`, any member), remove your own, propose with the date picker, and a link into chat to talk it through. `useGroup` also subscribes to `group_times` / `group_time_votes` (migration 0012). The group screen shows the locked-in time for matched groups too.
- **"Use this plan"** no longer duplicates: the server moves the row instead of copying it, and `ActivityScreen.applyPlan` mirrors that in the cache (restored plan leaves Earlier plans; the outgoing current plan joins them) before the refetch.
- **Notifications** are real: the server writes `hangout_invited`, `hangout_forming`, `exchange_requested`/`accepted`, `connection_added`, and the new `event_changed` (`payload.change`: renamed | time | plan | ended). `useNotifications` subscribes to Realtime on `notifications` (JWT on the socket) with the 60s poll as fallback; `useUnreadCount()` puts an ember dot on Home's bell; the feed calls `POST /api/notifications/read` on open. `notifications/settings.tsx` has four switches (`MeResponse.notificationSettings`, `PUT /api/notifications/settings`, optimistic with rollback).
- Query cache buster is `wave5` (`HangoutSummary` and `GroupResponse` grew).

## Wave 6 (Sep 27, fourth testing round — Sahith)

- **Home** sections, top to bottom: Needs your reply (`needsResponse`), the profile nag, Your hangouts, Awaiting feedback (ended ≤7 days ago and `!feedbackGiven`; tapping opens the feedback screen, which invalidates `hangouts` on submit), Grow your circle, then Past collapsed behind a toggle.
- **Titles**: `titleFromNames()` in `features/groups/degrees.ts` backs both `hangoutTitle(GroupResponse)` and `summaryTitle(HangoutSummary)` — first names, three at most, then "+ N more". Never "Group of N".
- **Host a meetup** is one button (`api.createEvent({})`); rename lives on the group screen.
- **Keyboard**: `Screen` sets `automaticallyAdjustKeyboardInsets` (RN insets the scroll view and scrolls the focused field into view) and `keyboardDismissMode="interactive"`. Don't wrap `Screen` in a `KeyboardAvoidingView` on top of that.
- **401s**: `api.ts` refreshes the session once on a server 401 and retries; a rejected refresh signs out locally (the auth listener clears caches, the gate goes to /login). Network errors never sign anyone out.
- **Circle map**: seats come from `features/circle/layout.ts` (`clusterOrder` + `homeSpots`, plain TS — checkable with tsx). Mutual edges are drawn only; contacts are the only forces besides the home springs, so an untouched map has zero net force.
- Query cache buster is `wave6`.
- **Plan times** (Sep 27): a plan for a real event (`activity.startsAt` in the future) has its start locked in by the server (`fromEvent` slot = `scheduledAt`); TimesCard shows "Set by the event" with only "I can make it", and hides proposing. Proposing uses `features/activity/WhenPicker.tsx` (day chips for two weeks + inline calendar, time chips + a time-only wheel), never a combined `datetime` spinner. `app.json` is `userInterfaceStyle: "light"` (the app has no dark theme; native pickers and alerts were going dark on a light app), and every native picker passes `themeVariant="light"` too.
- **Header spacing** (follow-up): the tab layout pads both sides of every tab header by `HEADER_EDGE` (20pt) + the safe-area inset; header icons are `HeaderIconButton` (44pt box, 22pt glyph) and the layout subtracts the box's slack, so the glyph sits exactly on the inset on every iPhone. Don't add padding inside `headerLeft`/`headerRight`.

## Known gaps (Sep 26, after wave 3)

Tracked with owners in [docs/ROLES.md](../../docs/ROLES.md#next-steps-sep-26):
- ~~**Notifications** poll once a minute (no Realtime, no mark-read), and nothing writes rows yet.~~ Done in wave 5 (Realtime, mark-read, settings, server writers). `message_received` and `feedback_prompt` still have no writer.
- **Feedback**: the group-tag chips are never sent. (Contact exchange moved to 1st-degree friends in wave 3, with a real "wants your number" state for the peer; the fake "(demo: they said yes)" link is gone.)
- **Photo save** uses `expo-media-library`, which Expo Go bundles; a dev build needs the plugin entry in `app.json` (added).
- ~~**About**: "Generate tags" is still canned.~~ Real in wave 6 (`POST /api/profile/tags`); accepted tags go out as `hobby`, mentioned avoids are pre-selected.
- ~~**Preferences** reach counts are hard-coded.~~ Real in wave 6 (`GET /api/graph/reach`).
- **Chat push while backgrounded** was deliberately not built (needs APNs + a dev build); in-app delivery is Realtime with a 30s safety poll.
