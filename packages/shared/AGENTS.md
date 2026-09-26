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
- UUID ids are `z.uuid()`. Enum values match the Postgres check constraints in [`supabase/migrations`](../../supabase/migrations/0001_init.sql).

## Open contract gaps

Search for `CONTRACT GAP` in `src/types.ts`. Each marks an assumption the contract doc left open (group members shape, message id type, nullable profile fields, `formGroups` prefs). Resolve them at H0 and delete the comment.
