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

  // The Shelf is one boolean, and it defaults to keeping. The API still calls
  // it evergreen; the receipt answers in the word the tool asked in.
  {
    const { client, calls } = clientWith([{ _id: 'a1', evergreen: true, evergreenAt: '2026-09-06' }]);
    const kept = await client.keepArticle({ articleId: 'a1' });
    assert.match(calls[0].url, /\/articles\/a1\/evergreen$/);
    assert.deepStrictEqual(calls[0].body, { evergreen: true });
    assert.deepStrictEqual(kept, { id: 'a1', kept: true, keptAt: '2026-09-06' });
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

  // Filing a piece should not hand its whole body back; the caller asked where
  // it went, not what it says.
  {
    const { client } = clientWith([{ _id: 'a1', title: 'T', content: 'the entire essay' }]);
    const filed = await client.fileArticle({ articleId: 'a1', folderId: 'f9' });
    assert.strictEqual(filed.title, 'T');
    assert(!('content' in filed));
  }

  // The Imbox piles. later and setAside carry a reason; stream clears it.
  {
    const { client, calls } = clientWith([
      { _id: 'a1', placement: 'later', placementAt: '2026-09-08', placementReason: 'owed a second read' }
    ]);
    const placed = await client.placeArticle({ articleId: 'a1', placement: 'later', reason: 'owed a second read' });
    assert.match(calls[0].url, /\/articles\/a1\/placement$/);
    assert.deepStrictEqual(calls[0].body, { placement: 'later', reason: 'owed a second read' });
    assert.strictEqual(placed.placement, 'later');
    assert.strictEqual(placed.placementReason, 'owed a second read');
  }

  // No reason given is not the same as an empty reason: don't send one.
  {
    const { client, calls } = clientWith([{ _id: 'a1', placement: 'stream' }]);
    await client.placeArticle({ articleId: 'a1', placement: 'stream' });
    assert.deepStrictEqual(calls[0].body, { placement: 'stream' });
  }

  // A highlight is addressed by the article holding it. Given both, no lookup.
  {
    const { client, calls } = clientWith([{ _id: 'h1', articleId: 'a1', text: 'x', tags: ['bio'] }]);
    const updated = await client.updateHighlight({ articleId: 'a1', highlightId: 'h1', tags: ['bio'] });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, 'PATCH');
    assert.match(calls[0].url, /\/articles\/a1\/highlights\/h1$/);
    assert.deepStrictEqual(updated.tags, ['bio']);
  }

  // Given only the highlight, the article is resolved rather than demanded —
  // by asking for that one highlight, not for every highlight there is.
  {
    const { client, calls } = clientWith([
      { _id: 'h1', articleId: 'a7', text: 'x' },
      { _id: 'h1', articleId: 'a7', text: 'x', note: 'why it matters' }
    ]);
    await client.updateHighlight({ highlightId: 'h1', note: 'why it matters' });
    assert.match(calls[0].url, /\/api\/highlights\/h1$/);
    assert.match(calls[1].url, /\/articles\/a7\/highlights\/h1$/);
  }

  // A highlight id that matches nothing says so, and says where to look.
  {
    const { client } = clientWith([{}]);
    await assert.rejects(
      () => client.deleteHighlight({ highlightId: 'h9' }),
      /No highlight h9.*search_highlights/s
    );
  }

  {
    const { client, calls } = clientWith([{ _id: 'a1' }]);
    const gone = await client.deleteHighlight({ articleId: 'a1', highlightId: 'h1' });
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.deepStrictEqual(gone, { id: 'h1', articleId: 'a1', deleted: true });
  }

  {
    const { client, calls } = clientWith([{ message: 'Article deleted successfully.' }]);
    const gone = await client.deleteArticle({ articleId: 'a1' });
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.deepStrictEqual(gone, { id: 'a1', deleted: true });
  }

  // Folders answer to their names everywhere, not only when filing.
  {
    const { client, calls } = clientWith([FOLDERS, { message: 'Folder deleted successfully.' }]);
    const gone = await client.deleteFolder({ folder: 'people' });
    assert.match(calls[1].url, /\/folders\/f2$/);
    assert.deepStrictEqual(gone, { id: 'f2', deleted: true });
  }

  // Nesting resolves both ends by name.
  {
    const { client, calls } = clientWith([
      FOLDERS,
      FOLDERS,
      { _id: 'f2', name: 'People', parentFolderId: 'f1' }
    ]);
    const nested = await client.nestFolder({ folder: 'People', parent: 'AI & Computing' });
    assert.match(calls[2].url, /\/folders\/f2\/parent$/);
    assert.deepStrictEqual(calls[2].body, { parentFolderId: 'f1' });
    assert.deepStrictEqual(nested, { id: 'f2', name: 'People', parentFolderId: 'f1' });
  }

  // No parent named means the top level, not a guess.
  {
    const { client, calls } = clientWith([{ _id: 'f2', name: 'People', parentFolderId: null }]);
    await client.nestFolder({ folderId: 'f2' });
    assert.deepStrictEqual(calls[0].body, { parentFolderId: null });
  }

  // The feed receipt reports screening only — the route settles nothing else,
  // so nothing else is claimed.
  {
    const { client, calls } = clientWith([{ _id: 'f1', name: 'AI & Computing', asFeed: true, asFeedAt: '2026-09-08' }]);
    const screened = await client.setFolderFeed({ folderId: 'f1' });
    assert.deepStrictEqual(calls[0].body, { asFeed: true });
    assert.deepStrictEqual(screened, { id: 'f1', name: 'AI & Computing', asFeed: true, asFeedAt: '2026-09-08' });
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
