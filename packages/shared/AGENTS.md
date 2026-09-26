# packages/shared — agent context

**The API contract made real.** [docs/API-CONTRACTS.md](../../docs/API-CONTRACTS.md) exists here as TypeScript types (`src/types.ts`) and Zod schemas (`src/schemas.ts`). Both the mobile app and the server import `@degrees/shared`, so a shape defined here is enforced at compile time on both sides.

**Owner:** all four. Christian merges changes. **Changing a type here is a four-person conversation, not a local edit.** Say so in the PR, and update API-CONTRACTS.md in the same change.

## How it's built

- Request bodies are Zod schemas, and their types are `z.infer<typeof schema>`, so the two can't drift. Response-only shapes are plain interfaces.
- `activitySchema` and `analyzeFeedbackOutputSchema` exist so the server can pass them to Gemini as `responseSchema` and then validate the reply.
- The app should validate forms with these same schemas rather than redeclaring them.
- **No build step.** `package.json` `exports` points straight at `src/index.ts`. Metro (app) and tsx (server) both compile it from source.
- **Imports inside this package are extensionless** (`from './schemas'`, not `./schemas.js`). Metro can't map `.js` imports to `.ts` files, so a `.js` suffix here breaks the iOS bundle the moment the app imports a schema at runtime.
- The only runtime dependency is `zod`. Don't add React, React Native, Node, or server-only imports here. Both apps have to be able to load everything in this package.

## Rules baked into the schemas

- No `userId` field in any request. The server derives it from the JWT.
- Money fields are `z.number().int()`, in cents. Timestamps are ISO 8601 strings.
- UUID ids are `z.uuid()`. Enum values match the Postgres check constraints in [`supabase/migrations`](../../supabase/migrations/) — 0001, widened in 0006 (tag kind `avoid`, frequency `few_times_week`/`biweekly`, feedback `relationship`).

## Open contract gaps

Search for `CONTRACT GAP` in `src/types.ts`. Three remain (Sep 26): nullable profile fields in `GET /me`, the message id type (bigserial sent as a string), and the `formGroups` candidate prefs shape. The group-members gap was resolved by PR #14's `revealed` shape. `POST /groups/:id/photos` now has `addPhotoRequestSchema` and returns `PhotosResponse` (Pranav, Sep 26).

## Sep 26 contract update (PR #14)

Breaking: `GroupMember` lost `via` and gained `bio`, `photoUrl`, and `revealed` (id and name are null past 1st degree); feedback `peers[].wouldMeetAgain` became `relationship: 'great' | 'fine' | 'not_for_me'`; `GET /graph/me` returns only 1st-degree nodes plus `mutualEdges`. Added: `respond`, `complete`, contact exchange, photos, host events, notifications (mock-only route). [API-CONTRACTS.md](../../docs/API-CONTRACTS.md) marks each with "CHANGED/Added Sep 26".
