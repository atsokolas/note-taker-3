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
  { _id: 'nf1', name: 'Reading', parentFolderId: null, sortOrder: 0 },
  { _id: 'nf2', name: 'Drafts', parentFolderId: 'nf1', sortOrder: 1 }
];

const run = async () => {
  // The full listing returns every entry's whole body. Ask for the projection
  // that answers "what is in my notebook" without reading the notebook aloud.
  {
    const { client, calls } = clientWith([[
      { _id: 'n1', title: 'On founder mode', type: 'claim', tags: ['bio'], blockCount: 4, snippet: '  Proximity  is\n the claim ' }
    ]]);
    const entries = await client.listNotebookEntries({ limit: 10 });
    assert.match(calls[0].url, /summary=1/);
    assert.match(calls[0].url, /limit=10/);
    assert.deepStrictEqual(entries, [{
      id: 'n1',
      title: 'On founder mode',
      type: 'claim',
      folder: null,
      tags: ['bio'],
      snippet: 'Proximity is the claim',
      blockCount: 4,
      updatedAt: null
    }]);
  }

  // A notebook folder answers to its name, the way a Library shelf does.
  {
    const { client, calls } = clientWith([FOLDERS, { _id: 'n2', title: 'Draft' }]);
    await client.createNotebookEntry({ title: 'Draft', content: 'A thought.', folder: 'drafts' });
    assert.match(calls[0].url, /\/api\/notebook\/folders$/);
    assert.strictEqual(calls[1].body.folder, 'nf2');
    assert.strictEqual(calls[1].body.title, 'Draft');
  }

  // A name that matches nothing points at the notebook's own tools, not the
  // Library's — they are separate cabinets and the message has to know that.
  {
    const { client } = clientWith([FOLDERS]);
    await assert.rejects(
      () => client.createNotebookEntry({ title: 'X', folder: 'Kept' }),
      /No notebook folder named "Kept".*create_notebook_folder/s
    );
  }

  // The update contract: an entry renamed keeps its text, tags and filing.
  // Sending every field is how a partial save erases what it did not mention.
  {
    const { client, calls } = clientWith([{ _id: 'n1', title: 'Renamed' }]);
    await client.updateNotebookEntry({ entryId: 'n1', title: 'Renamed' });
    assert.strictEqual(calls[0].method, 'PUT');
    assert.deepStrictEqual(calls[0].body, { title: 'Renamed' });
  }

  // Naming a folder refiles; naming none leaves the filing alone.
  {
    const { client, calls } = clientWith([FOLDERS, { _id: 'n1' }]);
    await client.updateNotebookEntry({ entryId: 'n1', folder: 'Reading' });
    assert.deepStrictEqual(calls[1].body, { folder: 'nf1' });
  }

  // An empty folder name is a request to unfile, not a lookup that failed.
  {
    const { client, calls } = clientWith([{ _id: 'n1' }]);
    await client.updateNotebookEntry({ entryId: 'n1', folder: '' });
    assert.deepStrictEqual(calls[0].body, { folder: null });
  }

  // Embedding, not merely linking: a linked passage the reader cannot see on
  // the page is a reference to something absent.
  {
    const { client, calls } = clientWith([{ _id: 'n1', blocks: [{ type: 'highlight_embed', highlightId: 'h1' }] }]);
    const entry = await client.addHighlightToNotebookEntry({ entryId: 'n1', highlightId: 'h1' });
    assert.match(calls[0].url, /\/api\/notebook\/n1\/append-highlight$/);
    assert.deepStrictEqual(calls[0].body, { highlightId: 'h1' });
    assert.strictEqual(entry.blocks.length, 1);
  }

  {
    const { client, calls } = clientWith([FOLDERS, { _id: 'nf3', name: 'Marginalia', parentFolderId: 'nf1' }]);
    const folder = await client.createNotebookFolder({ name: 'Marginalia', parent: 'Reading' });
    assert.deepStrictEqual(calls[1].body, { name: 'Marginalia', parentFolderId: 'nf1' });
    assert.deepStrictEqual(folder, { id: 'nf3', name: 'Marginalia', parentFolderId: 'nf1', sortOrder: 0 });
  }

  // Losing a drawer is not losing the pages, and the receipt says which it was.
  {
    const { client, calls } = clientWith([FOLDERS, { message: 'Folder deleted.' }]);
    const gone = await client.deleteNotebookFolder({ folder: 'Drafts' });
    assert.match(calls[1].url, /\/api\/notebook\/folders\/nf2$/);
    assert.deepStrictEqual(gone, { id: 'nf2', deleted: true, notesKept: true });
  }

  {
    const { client, calls } = clientWith([{ message: 'Notebook entry deleted.' }]);
    const gone = await client.deleteNotebookEntry({ entryId: 'n1' });
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.deepStrictEqual(gone, { id: 'n1', deleted: true });
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
