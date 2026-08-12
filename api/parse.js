import Anthropic from '@anthropic-ai/sdk';

// Turns a sentence into a proposal of tasks, grocery items, and tick-offs.
//
// This is the app's only server-side code, and it exists for one reason: calling a model
// needs an API key, and anything the browser can read is public. Two rules follow, and
// both are load-bearing:
//
//   1. ANTHROPIC_API_KEY must NOT be named VITE_ANYTHING. Vite inlines every VITE_*
//      variable into the client bundle, so the prefix alone would publish the key.
//   2. This endpoint is authenticated. Without that it is an open, billable LLM proxy on
//      a public URL — the auth check below is what stops a stranger spending your credit.
//
// The function never reads your ledger. The client assembles the context and posts it, so
// the only data here is what was sent for this one request.

const MODEL = 'claude-haiku-4-5';
const MAX_CALLS_PER_DAY = 100;
const MAX_INPUT_CHARS = 2000;

// Nullable fields use anyOf rather than a type array: structured outputs document `anyOf`
// and the bare types, not type unions, and a rejected schema fails the whole call.
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tasks', 'groceries', 'completions', 'unclear'],
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'date', 'time', 'goalId', 'presetId', 'carryOver', 'repeat'],
        properties: {
          name: { type: 'string' },
          date: nullableString,
          time: nullableString,
          goalId: nullableString,
          presetId: nullableString,
          carryOver: { type: 'boolean' },
          repeat: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: ['freq', 'days', 'monthDays'],
                properties: {
                  freq: { type: 'string', enum: ['weekly', 'monthly'] },
                  days: { type: 'array', items: { type: 'integer' } },
                  monthDays: { type: 'array', items: { type: 'integer' } },
                },
              },
            ],
          },
        },
      },
    },
    groceries: { type: 'array', items: { type: 'string' } },
    completions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['taskId', 'dateStr', 'name'],
        properties: {
          taskId: { type: 'string' },
          dateStr: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
    unclear: { type: 'array', items: { type: 'string' } },
  },
};

const SYSTEM_PROMPT = `You turn one short spoken or typed note into structured entries for a personal daily planner. You only propose; the person reviews everything before it is saved.

The user message is JSON describing today and what already exists in their planner.

Ids
- Use ONLY ids that appear in the JSON you were given. Never invent one, and never copy an id from these instructions.
- If no goal fits, set goalId to null. Null is normal and correct — the app files those under "Others". Do not stretch to find a goal.

Tasks
- date is YYYY-MM-DD in the user's timezone, resolved against the "today" and "weekday" given. "Tonight" and "this evening" are today.
- time is 24-hour HH:MM, or null when no time was said. A bare hour takes the reading a person would mean: "at 4" is 16:00, "at 8 in the morning" is 08:00, "at 7 tonight" is 19:00.
- Set repeat only when the note actually describes a recurrence ("every Monday", "on the 1st"). A repeating task has date null. Anything else has repeat null.
- carryOver is true only when they say it should stay until done ("until I do it", "keep it until finished").
- Do not propose a repeating task whose name matches something already in "recurring".

Presets
- "presets" are tasks this person has saved before. If the note refers to one, set presetId to that preset's id and reuse its name exactly. Leave time and goalId null when the preset already carries them — they are inherited.
- Only set presetId when it is genuinely the same activity. If unsure, leave it null and let the app ask.

Groceries
- Things to buy go in "groceries" as plain names, never in "tasks". "We need milk", "get bread" and "add coffee to the shopping list" are all groceries.
- "Go to the shop" is a task, not a grocery. Both can appear in one note.

Completions
- Only when the note reports something already done ("I did the washing up").
- Use only an entry from "openTasks", copying its taskId and dateStr exactly. If nothing matches closely, put the phrase in "unclear" instead. Never guess at a completion.

Language
- Write every name in the same language the note was written in. If the note is Chinese, the names are Chinese.

Unclear
- Put any part you could not confidently place into "unclear", as the person's own words. Guessing is worse than asking. An empty note produces empty arrays.`;

const json = (res, status, body) => res.status(status).json(body);

// Confirms the bearer token belongs to a real signed-in user of this Supabase project.
// The token is checked against Supabase rather than decoded here — no key handling, no
// signature code, and it stays correct when signing keys rotate.
async function verifyUser(token, supabaseUrl, supabaseKey) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user.id : null;
}

// A guard against a runaway client loop, not a security boundary — auth is the boundary.
// Stored in the caller's own kv row, so row-level security keeps it theirs.
async function readUsage(token, supabaseUrl, supabaseKey, todayStr) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/kv?key=eq.ai-usage&select=value`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey, Accept: 'application/json' },
    });
    if (!res.ok) return { date: todayStr, count: 0 };
    const rows = await res.json();
    const parsed = rows && rows[0] ? JSON.parse(rows[0].value) : null;
    return parsed && parsed.date === todayStr ? parsed : { date: todayStr, count: 0 };
  } catch (e) {
    // If the counter can't be read, don't block the request over it.
    return { date: todayStr, count: 0 };
  }
}

async function writeUsage(token, supabaseUrl, supabaseKey, userId, usage) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/kv?on_conflict=user_id,key`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        key: 'ai-usage',
        value: JSON.stringify(usage),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) { /* the count is advisory; a failed write is not worth failing the call */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    console.error('parse: missing server configuration');
    return json(res, 500, { error: 'not_configured' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return json(res, 401, { error: 'unauthenticated' });

  const userId = await verifyUser(token, supabaseUrl, supabaseKey);
  if (!userId) return json(res, 401, { error: 'unauthenticated' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json(res, 400, { error: 'empty' });
  if (text.length > MAX_INPUT_CHARS) return json(res, 400, { error: 'too_long' });

  const todayStr = typeof body.today === 'string' ? body.today : new Date().toISOString().slice(0, 10);
  const usage = await readUsage(token, supabaseUrl, supabaseKey, todayStr);
  if (usage.count >= MAX_CALLS_PER_DAY) return json(res, 429, { error: 'daily_limit' });

  const client = new Anthropic({ apiKey });

  try {
    // No `effort` — it errors on Haiku 4.5. No `thinking` — on a pre-4.6 model omitting it
    // means no thinking, which is what a fast parse wants. No cache_control — Haiku 4.5's
    // minimum cacheable prefix is 4096 tokens and this prompt is well under it, so a
    // breakpoint would silently do nothing.
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify({ ...body, text }) }],
      output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
    });

    // Both of these produce output that is not the schema — parsing it would throw or,
    // worse, half-succeed on truncated JSON.
    if (message.stop_reason === 'max_tokens') return json(res, 502, { error: 'too_much' });
    if (message.stop_reason === 'refusal') return json(res, 422, { error: 'refused' });

    const block = message.content.find((b) => b.type === 'text');
    if (!block) return json(res, 502, { error: 'no_content' });

    let proposal;
    try {
      proposal = JSON.parse(block.text);
    } catch (e) {
      return json(res, 502, { error: 'unparseable' });
    }

    await writeUsage(token, supabaseUrl, supabaseKey, userId, {
      date: todayStr,
      count: usage.count + 1,
    });

    return json(res, 200, { proposal });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(res, 429, { error: 'rate_limited' });
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('parse: the Anthropic key was rejected');
      return json(res, 500, { error: 'not_configured' });
    }
    console.error('parse failed', e && e.message);
    return json(res, 502, { error: 'upstream' });
  }
}
