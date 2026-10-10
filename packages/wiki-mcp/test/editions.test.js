import assert from 'assert';
import { z } from 'zod';

import { NoeisApiError, NoeisClient } from '../src/client.js';
import { readTools } from '../src/tools/read.js';
import { writeTools } from '../src/tools/write.js';

const jsonOk = (payload) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => payload,
  text: async () => JSON.stringify(payload)
});

const run = async () => {
  /* list_editions used to hand back `_id` only. get_edition then went to
     /api/editions/undefined, mongoose CastError, HTTP 500. */
  {
    const calls = [];
    const client = new NoeisClient({
      token: 't',
      env: {},
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonOk({
          editions: [{ _id: 'edition-1', title: 'This Week in AI', itemCount: 2 }]
        });
      }
    });
    const listed = await client.listEditions({ profile: 'this_week_in_ai' });
    assert.strictEqual(listed.editions[0].id, 'edition-1');
    assert.match(calls[0], /\/api\/editions\?profile=this_week_in_ai/);
  }

  /* Same bound as GET /api/editions: OpenClaw can ask for 500, not more. */
  {
    const schema = z.object(readTools.find(tool => tool.name === 'list_editions').inputSchema);
    assert.strictEqual(schema.safeParse({ limit: 500 }).success, true);
    assert.strictEqual(schema.safeParse({ limit: 501 }).success, false);
  }

  /* A topic set up with configure_edition can be filed as a whole edition too,
     not only the two built-in papers. */
  {
    const schema = z.object(writeTools.find(tool => tool.name === 'create_edition').inputSchema);
    const item = { title: 'Trial readout', url: 'https://example.com/t', section: 'clinical', finding: 'Met endpoint.', boundary: 'Single site.' };
    assert.strictEqual(schema.safeParse({ profile: 'biotech', windowStart: '2026-10-01', windowEnd: '2026-10-31', items: [item] }).success, true);
    assert.strictEqual(schema.safeParse({ profile: '', windowStart: '2026-10-01', windowEnd: '2026-10-31', items: [item] }).success, false);
  }

  {
    const calls = [];
    const client = new NoeisClient({
      token: 't',
      env: {},
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonOk({ editions: [] });
      }
    });
    await client.listEditions({ profile: 'this_week_in_ai', limit: 500 });
    assert.match(calls[0], /\/api\/editions\?profile=this_week_in_ai&limit=500/);
  }

  {
    const calls = [];
    const client = new NoeisClient({
      token: 't',
      env: {},
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonOk({ _id: 'edition-1', title: 'This Week in AI', items: [] });
      }
    });
    const edition = await client.getEdition({ editionId: { _id: 'edition-1' } });
    assert.strictEqual(edition.id, 'edition-1');
    assert.match(calls[0], /\/api\/editions\/edition-1$/);
  }

  {
    const client = new NoeisClient({
      token: 't',
      env: {},
      fetchImpl: async () => {
        throw new Error('should not call Noeis');
      }
    });
    const error = await client.getEdition({}).then(() => null, e => e);
    assert.ok(error instanceof NoeisApiError);
    assert.strictEqual(error.status, 400);
    assert.match(error.message, /editionId is required/);
  }

  /* Filing reports what the issue actually did. Zero added is silence, not a
     second success story. */
  {
    const client = new NoeisClient({
      token: 't',
      env: {},
      fetchImpl: async () => jsonOk({
        _id: 'edition-1',
        added: 0,
        alreadyHeld: 1,
        itemCount: 1
      })
    });
    const filed = await client.fileEditionItems({
      profile: 'this_week_in_ai',
      items: [{ title: 'A', url: 'https://example.com/a', section: 'models_methods', finding: 'f', boundary: 'b' }]
    });
    assert.strictEqual(filed.added, 0);
    assert.strictEqual(filed.alreadyHeld, 1);
  }

  /* A column can name its keeper, or let one go. */
  {
    const schema = z.object(writeTools.find(tool => tool.name === 'configure_edition').inputSchema);
    const base = { key: 'biotech', title: 'This Month in Biotech' };
    assert.strictEqual(schema.safeParse({ ...base, sections: [{ key: 'trials', label: 'Trials', keeper: { runtime: 'codex' } }] }).success, true);
    assert.strictEqual(schema.safeParse({ ...base, sections: [{ key: 'trials', label: 'Trials', keeper: null }] }).success, true);
    assert.strictEqual(schema.safeParse({ ...base, sections: [{ key: 'trials', label: 'Trials', keeper: { label: 'x'.repeat(61) } }] }).success, false);
    assert.match(writeTools.find(tool => tool.name === 'configure_edition').description, /which agent keeps each section/);
  }

  /* "Nothing met the bar" is a filing too: checked alone is enough, and it
     reaches the API as sent. Saying nothing at all is refused before the call. */
  {
    const schema = z.object(writeTools.find(tool => tool.name === 'file_edition_items').inputSchema);
    assert.strictEqual(schema.safeParse({ profile: 'this_week_in_ai', checked: ['models_methods'] }).success, true);
    assert.strictEqual(schema.safeParse({ profile: 'this_week_in_ai', checked: [{ section: 'models_methods', note: 'Two vendor evals only.' }] }).success, true);
    assert.strictEqual(schema.safeParse({ profile: 'this_week_in_ai', checked: [{ note: 'no section' }] }).success, false);
    const create = z.object(writeTools.find(tool => tool.name === 'create_edition').inputSchema);
    assert.strictEqual(create.shape.checked.isOptional(), true);
    assert.match(writeTools.find(tool => tool.name === 'file_edition_items').description, /reads to the reader as 'not reported'/);
    /* A second agent on a held link is a reading, not a skip; agents are told to
       write their own rather than echo the first. */
    assert.match(writeTools.find(tool => tool.name === 'file_edition_items').description, /second reading beside theirs .* do not paraphrase theirs/);

    const bodies = [];
    const client = new NoeisClient({
      token: 't',
      env: {},
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(init.body));
        return jsonOk({ _id: 'edition-1', added: 0, alreadyHeld: 0, checksAdded: 1 });
      }
    });
    const filed = await client.fileEditionItems({ profile: 'this_week_in_ai', checked: ['models_methods'] });
    assert.strictEqual(filed.checksAdded, 1);
    assert.deepStrictEqual(bodies[0].checked, ['models_methods']);

    const refused = await client.fileEditionItems({ profile: 'this_week_in_ai', items: [], checked: [] }).then(() => null, e => e);
    assert.ok(refused instanceof NoeisApiError);
    assert.strictEqual(refused.status, 400);
    assert.strictEqual(bodies.length, 1);
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
