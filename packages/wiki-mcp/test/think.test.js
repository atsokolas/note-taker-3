// The Think surface: the Notebook the reader writes in, and the concepts they
// file it under. Both were reachable from the product and not from an agent.

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
  // Exact passages retain whitespace and anchors; thoughts remain separate.
  // Existing source identity is required rather than guessed from a title.
  {
    const quote = 'An exact  passage.\nSecond line.';
    const { client, calls } = clientWith([
      { _id: 'h1', articleId: 'a1', text: quote, note: 'My contrary thought', anchor: { start: 4 } },
      { _id: 'a1', title: 'Source', author: 'Author', url: 'https://example.com/source' },
      { _id: 'n1', linkedHighlightIds: ['h1'], content: 'My argument', importMeta: { provider: 'reader' } }
    ]);
    const result = await client.getSourceThoughtContext({ highlightId: 'h1', entryId: 'n1' });
    assert.strictEqual(result.passage.text, quote);
    assert.deepStrictEqual(result.passage.anchor, { start: 4 });
    assert.strictEqual(result.readerThought.note, 'My contrary thought');
    assert.strictEqual(result.links.article, 'https://www.noeis.io/articles/a1');
    assert.strictEqual(result.links.passage, 'https://www.noeis.io/library?articleId=a1&highlightId=h1');
    assert.strictEqual(result.readerThought.notebookEntry.importMeta.provider, 'reader');
    assert.deepStrictEqual(result.authorship, { passage: 'source', note: 'reader_saved', notebookEntry: 'reader_saved' });
    assert.ok(calls.every(call => call.method === 'GET'));
  }
  {
    const { client } = clientWith([
      { _id: 'h1', articleId: 'a1', text: 'Source text' },
      { _id: 'a1', title: 'Same title' },
      { _id: 'n1', title: 'Same title', linkedArticleId: 'a2' }
    ]);
    await assert.rejects(() => client.getSourceThoughtContext({ highlightId: 'h1', entryId: 'n1' }), /not linked/);
  }
  {
    const { client, calls } = clientWith([null]);
    await assert.rejects(() => client.getSourceThoughtContext({ highlightId: 'missing' }), /not found/);
    assert.strictEqual(calls.length, 1);
  }
  {
    const candidate = { revisionId: 'r1', status: 'awaiting_maintenance_acceptance', candidate: { body: 'Proposed only' } };
    const { client, calls } = clientWith([candidate]);
    assert.deepStrictEqual(await client.getResearchCandidate({ pageId: 'p1' }), candidate);
    assert.match(calls[0].url, /pages\/p1\/research-candidate$/);
    assert.strictEqual(calls[0].method, 'GET');
  }

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

  /* Concepts. update_concept upserts, so it is also how a concept is made —
     and it must not blank what it was not asked about: sending the untouched
     fields as undefined is how a description edit cleared a concept's pins. */
  {
    const { client, calls } = clientWith([{ _id: 'c1', name: 'Founder mode', description: 'Sharper.', pinnedHighlightIds: ['h1'] }]);
    const concept = await client.updateConcept({ name: 'Founder mode', description: 'Sharper.' });
    assert.strictEqual(calls[0].method, 'PUT');
    assert.deepStrictEqual(calls[0].body, { description: 'Sharper.' });
    assert.deepStrictEqual(concept.pinnedHighlightIds, ['h1']);
    assert.strictEqual(concept.id, 'c1');
  }

  // An explicit empty list is an unpin, and still travels.
  {
    const { client, calls } = clientWith([{ _id: 'c1', name: 'Founder mode' }]);
    await client.updateConcept({ name: 'Founder mode', pinnedArticleIds: [] });
    assert.deepStrictEqual(calls[0].body, { pinnedArticleIds: [] });
  }

  {
    const { client } = clientWith([[{ _id: 'c1', name: 'Founder mode', pinnedNoteIds: ['n1'] }]]);
    const concepts = await client.listConcepts();
    assert.deepStrictEqual(concepts[0], {
      id: 'c1',
      name: 'Founder mode',
      description: '',
      pinnedHighlightIds: [],
      pinnedArticleIds: [],
      pinnedNoteIds: ['n1'],
      isPublic: false,
      updatedAt: null
    });
  }

  // Reading one keeps what only the single read returns.
  {
    const { client } = clientWith([{ _id: 'c1', name: 'Founder mode', workspace: { items: [1, 2] } }]);
    const concept = await client.getConcept({ name: 'Founder mode' });
    assert.strictEqual(concept.id, 'c1');
    assert.deepStrictEqual(concept.workspace, { items: [1, 2] });
  }

  // Concept notes: the reader's margin on an idea, filed by concept name.
  {
    const { client, calls } = clientWith([[{ _id: 'cn1', tagName: 'Founder mode', title: 'Where it breaks', content: 'Scale.' }]]);
    const notes = await client.listConceptNotes({ name: 'Founder mode' });
    assert.match(calls[0].url, /\/api\/concepts\/Founder%20mode\/notes$/);
    assert.deepStrictEqual(notes[0], {
      id: 'cn1',
      conceptName: 'Founder mode',
      title: 'Where it breaks',
      content: 'Scale.',
      createdAt: null,
      updatedAt: null
    });
  }

  // Retitling a note must not erase what is written in it.
  {
    const { client, calls } = clientWith([{ _id: 'cn1', tagName: 'Founder mode', title: 'Renamed', content: 'Scale.' }]);
    const note = await client.updateConceptNote({ noteId: 'cn1', title: 'Renamed' });
    assert.strictEqual(calls[0].method, 'PUT');
    assert.deepStrictEqual(calls[0].body, { title: 'Renamed' });
    assert.strictEqual(note.content, 'Scale.');
  }

  {
    const { client, calls } = clientWith([{ message: 'Note deleted.' }]);
    const gone = await client.deleteConceptNote({ noteId: 'cn1' });
    assert.strictEqual(calls[0].method, 'DELETE');
    assert.deepStrictEqual(gone, { id: 'cn1', deleted: true });
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
