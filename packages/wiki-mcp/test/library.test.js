import assert from 'assert';

import { NoeisClient } from '../src/client.js';

const clientWith = (responses) => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    const next = responses.shift();
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => next,
      text: async () => JSON.stringify(next)
    };
  };
  return { client: new NoeisClient({ token: 't', env: {}, fetchImpl }), calls };
};

const FOLDERS = [
  { _id: 'f1', name: 'AI & Computing', parentFolderId: null, asFeed: false },
  { _id: 'f2', name: 'People', parentFolderId: null, asFeed: true }
];

const run = async () => {
  {
    const { client } = clientWith([FOLDERS]);
    assert.deepStrictEqual(await client.listFolders(), [
      { id: 'f1', name: 'AI & Computing', parentFolderId: null, asFeed: false },
      { id: 'f2', name: 'People', parentFolderId: null, asFeed: true }
    ]);
  }

  // An agent knows the shelf by its name. Making it list, match and carry an id
  // before it can file one article is how filing stops happening.
  {
    const { client, calls } = clientWith([FOLDERS, { _id: 'a1', title: 'T' }]);
    await client.fileArticle({ articleId: 'a1', folder: 'people' });
    assert.strictEqual(calls[1].method, 'PATCH');
    assert.match(calls[1].url, /\/articles\/a1\/move$/);
    assert.deepStrictEqual(calls[1].body, { folderId: 'f2' });
  }

  // An explicit id skips the lookup entirely.
  {
    const { client, calls } = clientWith([{ _id: 'a1', title: 'T' }]);
    await client.fileArticle({ articleId: 'a1', folderId: 'f9' });
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0].body, { folderId: 'f9' });
  }

  // Neither given: unfile, rather than guess at a folder.
  {
    const { client, calls } = clientWith([{ _id: 'a1', title: 'T' }]);
    await client.fileArticle({ articleId: 'a1' });
    assert.deepStrictEqual(calls[0].body, { folderId: null });
  }

  // A name that matches nothing says so, and says what to do about it.
  {
    const { client } = clientWith([FOLDERS]);
    await assert.rejects(
      () => client.fileArticle({ articleId: 'a1', folder: 'Kept' }),
      /No folder named "Kept".*create_folder/s
    );
  }

  // The Shelf is one boolean, and it defaults to keeping.
  {
    const { client, calls } = clientWith([{ _id: 'a1', evergreen: true, evergreenAt: '2026-09-06' }]);
    const kept = await client.keepArticle({ articleId: 'a1' });
    assert.match(calls[0].url, /\/articles\/a1\/evergreen$/);
    assert.deepStrictEqual(calls[0].body, { evergreen: true });
    assert.strictEqual(kept.evergreen, true);
  }

  {
    const { client, calls } = clientWith([{ _id: 'a1', evergreen: false }]);
    await client.keepArticle({ articleId: 'a1', kept: false });
    assert.deepStrictEqual(calls[0].body, { evergreen: false });
  }

  {
    const { client, calls } = clientWith([{ _id: 'f3', name: 'Kept' }]);
    const folder = await client.createFolder({ name: 'Kept' });
    assert.deepStrictEqual(calls[0].body, { name: 'Kept' });
    assert.strictEqual(folder.id, 'f3');
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
