-- Owner: Sahith (Data & Matching) — Sep 26 wave 2: resumable activity generation on a legacy Netlify plan.
--
-- Plan generation is a chain of external calls (Gemini with Maps grounding → Places → Ticketmaster fallback) that
-- doesn't reliably fit one 10-second synchronous function, and Background Functions aren't on the team's plan.
-- So the chain runs as a job: POST /groups/:id/activity writes a 'generating' row with `job` = { stage: 'grounded' },
-- and each POST /groups/:id/activity/advance runs exactly ONE stage inside its own function budget, storing the
-- intermediate result here. The final stage writes the real plan and flips status to 'ready'. The app drives the
-- advances; if it goes away, the next open of the group resumes where it stopped. Idempotent.

alter table public.activities
  add column if not exists job jsonb;
