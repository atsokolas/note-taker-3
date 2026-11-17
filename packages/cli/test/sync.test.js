import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GUIDE, syncFolder } from '../src/sync.js';

/* A Noeis that keeps notes and articles in memory and answers the four
   calls the folder makes. */
const fakeNoeis = () => {
  let clock = 1;
  const at = () => new Date(Date.UTC(2026, 10, 17, 0, 0, clock++)).toISOString();
  const items = new Map();
  const add = (kind, title, body, extra = {}) => {
    const id = String(items.size + 1).padStart(24, '0');
    items.set(id, { kind, id, title, body, updatedAt: at(), ...extra });
    return id;
  };
  const folder = { note: 'Think', article: 'Library' };
  const render = item => `# ${item.title}\n\n${item.body}\n`;
  const fromMarkdown = text => ({ title: text.match(/^#\s+(.+)$/m)[1], body: text.replace(/^#.*\n+/m, '').trim() });
  const conflict = Object.assign(new Error('changed'), { status: 409 });
  const client = {
    request: async (route, { method = 'GET', query = {}, body } = {}) => {
      if (route === '/api/sync') {
        const ids = String(query.ids || '').split(',');
        return {
          now: at(),
          files: [...items.values()].map(item => ({
            kind: item.kind, id: item.id, path: `${folder[item.kind]}/${item.title.toLowerCase().replace(/\W+/g, '-')}-${item.id.slice(-6)}.md`, updatedAt: item.updatedAt,
            ...(item.updatedAt > (query.since || '') || ids.includes(item.id) ? { markdown: render(item) } : {})
          }))
        };
      }
      if (route === '/api/notebook' && method === 'POST') return { _id: add('note', ...Object.values(fromMarkdown(body.markdown))) };
      if (route === '/api/import/text') return { article: { _id: add('article', body.title, fromMarkdown(body.text).body) } };
      const note = items.get(route.split('/').pop());
      if (note.updatedAt > body.ifUnmodifiedSince) throw conflict;
      Object.assign(note, fromMarkdown(body.markdown), { updatedAt: at() });
      return note;
    }
  };
  return { client, items, add, touch: (id, change) => Object.assign(items.get(id), change, { updatedAt: at() }) };
};

const run = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-sync-test-'));
  const noeis = fakeNoeis();
  const hiring = noeis.add('note', 'Hiring', 'I keep hiring the best story.');
  const baseRates = noeis.add('article', 'Base rates', 'Start with the base rate.');
  const file = rel => path.join(dir, rel);
  const read = rel => fs.readFileSync(file(rel), 'utf8');
  const notePath = 'Think/hiring-000001.md';
  const articlePath = 'Library/base-rates-000002.md';

  /* Down: every note and article as a file, and a guide for the agent that finds them. */
  assert.deepStrictEqual(await syncFolder({ dir, client: noeis.client }), { sent: 0, created: 0, kept: 0, written: 2, removed: 0 });
  assert.strictEqual(read(notePath), '# Hiring\n\nI keep hiring the best story.\n');
  assert.strictEqual(read('AGENTS.md'), GUIDE);

  /* Up: an edited note goes back; a new file in Think is a new note, one in
     Library is saved there; each comes back down where Noeis keeps it. */
  fs.appendFileSync(file(notePath), '\nCheck the base rate first.\n');
  fs.writeFileSync(file('Think/scratch.md'), '# Panels\n\nPanels overweight charisma.\n');
  fs.writeFileSync(file('Library/read-for-you.md'), '# Structured interviews\n\nThey predict better.\n');
  const up = await syncFolder({ dir, client: noeis.client });
  assert.deepStrictEqual([up.sent, up.created], [1, 2]);
  assert.strictEqual(noeis.items.get(hiring).body, 'I keep hiring the best story.\n\nCheck the base rate first.');
  assert.ok(!fs.existsSync(file('Think/scratch.md')) && fs.existsSync(file('Think/panels-000003.md')));
  assert.ok(fs.existsSync(file('Library/structured-interviews-000004.md')));

  /* Both sides changed: Noeis's version stays, the folder's becomes a note beside it. */
  noeis.touch(hiring, { body: 'Edited in Noeis.' });
  fs.appendFileSync(file(notePath), '\nEdited in the folder.\n');
  const lines = [];
  assert.strictEqual((await syncFolder({ dir, client: noeis.client, log: line => lines.push(line) })).kept, 1);
  assert.strictEqual(read(notePath), '# Hiring\n\nEdited in Noeis.\n');
  assert.ok([...noeis.items.values()].some(item => item.title === 'Hiring (from your folder)' && item.body.endsWith('Edited in the folder.')));
  assert.strictEqual(lines.length, 1);

  /* The Library is Noeis's: an edit is not sent and the file is put back.
     A file deleted here comes back; one Noeis no longer has goes. */
  fs.appendFileSync(file(articlePath), 'scribble\n');
  fs.rmSync(file('Think/panels-000003.md'));
  await syncFolder({ dir, client: noeis.client, log: () => {} });
  assert.strictEqual(read(articlePath), '# Base rates\n\nStart with the base rate.\n');
  assert.ok(fs.existsSync(file('Think/panels-000003.md')));
  noeis.items.delete(baseRates);
  assert.strictEqual((await syncFolder({ dir, client: noeis.client })).removed, 1);
  assert.ok(!fs.existsSync(file(articlePath)));
  console.log('sync tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
