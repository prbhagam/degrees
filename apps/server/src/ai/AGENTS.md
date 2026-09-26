# apps/server/src/ai — agent context

Every Gemini call in the project lives here. Nothing else, anywhere, calls a model. **Owner:** Christian. Sahith owns the `formGroups` prompt, which lives in [`../matching/`](../matching/AGENTS.md) but uses `getAiClient()` from here.

| File | Contract | Model | Status |
|---|---|---|---|
| `client.ts` | `getAiClient()`, model constants | — | Real: lazily builds `GoogleGenAI` from `GEMINI_API_KEY` |
| `embedProfile.ts` | `embedProfile(userId): Promise<void>` | `gemini-embedding-001` @ 768 | Stub (no-op) |
| `generateActivity.ts` | `generateActivity(input): Promise<Activity>` | Flash + **Maps grounding** | Stub → `activityFixture` |
| `analyzeFeedback.ts` | `analyzeFeedback(freeText): Promise<{ tags, sentiment }>` | Flash | Stub → `feedbackAnalysisFixture` |

Signatures are frozen in [API-CONTRACTS.md](../../../../docs/API-CONTRACTS.md), under "Internal AI services". Routes already call these functions, so filling one in changes behaviour without touching any route.

## Rules

- **SDK is `@google/genai`** (`import { GoogleGenAI } from '@google/genai'`). Never `@google/generative-ai`. It reached end of life Nov 30, 2025 and still installs cleanly.
- **Embeddings: pass `outputDimensionality: EMBEDDING_DIMS` (768).** The default of 3072 can't be indexed by pgvector, and the column is `vector(768)`.
- **Structured output:** pass a `responseSchema` built from the matching Zod schema in `@degrees/shared` (`activitySchema`, `analyzeFeedbackOutputSchema`). Then `.parse()` the response with that same schema before returning it. Never return unvalidated model output.
- `FLASH_MODEL` in `client.ts` is a placeholder. Confirm the current Flash model id against Google's docs when implementing.
- The embedding source is interest tags + AI paragraph + `derived` tags from feedback. `analyzeFeedback` output becomes `derived` `profile_tags`, and the profile is then re-embedded. That's the loop that makes matches improve.
- Calls must **degrade, not crash** during the demo. Catch, log, and return something usable. The `formGroups` fallback (top-N by similarity) is the model for this.
- Enable Gemini billing before H2. The free tier's rate limits won't survive a live demo.
