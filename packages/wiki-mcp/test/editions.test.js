import assert from 'assert';

import { NoeisApiError, NoeisClient } from '../src/client.js';

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
};

run().catch((error) => { console.error(error); process.exit(1); });
