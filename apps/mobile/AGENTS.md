# apps/mobile — agent context

The Degrees iOS app: **Expo SDK 57 · React Native 0.86 · Expo Router · NativeWind v4**. Nothing is written in Swift. Read the root [AGENTS.md](../../AGENTS.md) first for the product rules. This file covers what's specific to the app.

**Owners:** Charles (auth, onboarding, profile, feedback) · Pranav (events, groups, activity, chat). The shared scaffold (`src/lib`, `src/stores`, `src/components`, `src/app/_layout.tsx`, `src/app/index.tsx`) is Charles's. Changes to `src/lib/api.ts` follow the contract, and Christian merges those.

---

## Layout

```
src/app/                 Expo Router routes. Every file is a screen; _layout.tsx files are navigators.
  _layout.tsx            providers (TanStack Query) + root Stack. Rarely changes.
  index.tsx              home hub → features/home (Pranav): your groups, find a group, meet someone, join an event
  login.tsx signup.tsx                     → features/auth        (Charles)
  onboarding/{interests,preferences}.tsx   → features/onboarding  (Charles)
  profile.tsx                              → features/profile     (Charles)
  groups/[id]/feedback.tsx                 → features/feedback    (Charles)
  join/index.tsx  join/[roomCode].tsx      → features/events      (Pranav)
  connect/index.tsx  connect/[peerId].tsx  → features/events      (Pranav) my QR · deep-link target that forms an edge
  scan.tsx                                 → features/events      (Pranav) one scanner for event + person QR codes
  match.tsx                                → features/groups      (Pranav) runs matching, then opens the group
  groups/[id]/index.tsx                    → features/groups      (Pranav)
  groups/[id]/activity.tsx                 → features/activity    (Pranav)
  groups/[id]/chat.tsx                     → features/chat        (Pranav)
src/features/<feature>/  the real screens, components, and hooks for that feature
src/lib/api.ts           typed fetch wrapper for every API endpoint; attaches the Supabase JWT
src/lib/supabase.ts      publishable-key Supabase client (READS ONLY)
src/lib/query.ts         TanStack Query client
src/stores/session.ts    Zustand: currentUser, activeGroupId
src/components/          shared components; ui/ is reserved for react-native-reusables (not initialised)
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

You never edit another feature's files, and you never edit `_layout.tsx` just to register a route. Keep all non-route code out of `src/app/`.

Deep links come free from the `degrees` scheme in `app.json`. For example, `degrees://join/HACKGT` opens `join/[roomCode].tsx`. **In Expo Go the scheme is `exp://<ip>:8081/--/join/HACKGT` instead**, so build QR links with `Linking.createURL()` (see `features/events/links.ts`), never a hard-coded `degrees://`. The in-app scanner accepts both forms.

## Data rules

- **Every write goes through `api.ts`**, which calls the API server. Never `insert`, `update`, `upsert` or `delete` through the Supabase client, and never import Gemini here.
- Direct Supabase **reads** are allowed only for what [API-CONTRACTS.md](../../docs/API-CONTRACTS.md) lists: your own profile and preferences, the members of your groups, and chat messages via Realtime.
- Fetch through **TanStack Query** (`useQuery` / `useMutation` wrapping `api.*`). The server is the source of truth, so no optimistic local state.
- Types and Zod schemas come from `@degrees/shared`. Use the shared schemas for form validation, and don't redeclare shapes.

## Env and the API URL

- Env lives in **`apps/mobile/.env`**, not the repo root, because Expo reads `.env` from the app folder. Copy `.env.example`.
- `EXPO_PUBLIC_*` values are **baked into the app bundle and public**. Only the Supabase URL and publishable (anon) key go here, never the service role key.
- With no Supabase env in dev, `api.ts` sends `Bearer dev` and the mock-mode server accepts it. That's how screens work before auth exists.
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
