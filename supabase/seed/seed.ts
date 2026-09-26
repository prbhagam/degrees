// Owner: Sahith (Data & Matching) — real Gemini embeddings for seeded profiles; see supabase/AGENTS.md.
// The seed rows themselves live in migrations/0002_seed_georgia_tech_demo.sql (canonical). SQL can't call Gemini,
// so 0002 writes placeholder vectors; this replaces them using the same template/model/task type as live signups
// (embedProfileStrict), which is what makes seed and real users comparable.
//
//   npm run seed                      re-embed every profile
//   npm run seed -- --user <uuid> …   re-embed specific users
import { embedProfileStrict } from '../../apps/server/src/ai/embedProfile.js';
import { getServiceClient } from '../../apps/server/src/db/supabase.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

function requestedUsers(argv: string[]): string[] {
  const ids: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--user') continue;
    const id = argv[index + 1];
    if (!id || !UUID.test(id)) {
      throw new Error(`--user expects a uuid, got ${id ?? 'nothing'}`);
    }
    ids.push(id);
    index += 1;
  }
  return ids;
}

async function allProfileIds(): Promise<string[]> {
  const supabase = getServiceClient();
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to list profiles: ${error.message}`);
    ids.push(...data.map(({ id }) => id as string));
    if (data.length < PAGE) return ids;
  }
}

async function main(): Promise<void> {
  const requested = requestedUsers(process.argv.slice(2));
  const ids = requested.length > 0 ? requested : await allProfileIds();
  if (ids.length === 0) {
    console.log('No profiles to embed. Apply 0002 first.');
    return;
  }

  // Sequential on purpose: a dozen calls is fast, and it keeps us well inside Gemini rate limits.
  const failed: string[] = [];
  for (const id of ids) {
    try {
      const { dims } = await embedProfileStrict(id);
      console.log(`ok    ${id} (${dims} dims)`);
    } catch (error) {
      failed.push(id);
      console.error(`FAIL  ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`Embedded ${ids.length - failed.length}/${ids.length} profiles.`);
  if (failed.length > 0) process.exit(1);
}

await main();
