const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { buildBulkExportRouter } = require('./bulkExportRoutes');

const rows = list => ({ find: () => ({ lean: async () => list }) });
const article = { _id: 'a1', title: 'On moats', url: 'https://example.com', content: 'Body.', highlights: [{ _id: 'h1', text: 'A moat.', tags: ['moats'] }] };

let base;
let server;
test.before(async () => {
  const app = express();
  app.use(buildBulkExportRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'u1' }; next(); },
    Article: rows([article]),
    NotebookEntry: rows([{ _id: 'n1', title: 'A note', content: 'Thinking.' }]),
    Collection: rows([]),
    TagMeta: rows([]),
    SavedView: rows([])
  }));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('the JSON export carries each article highlight with the article it came from', async () => {
  const body = await (await fetch(`${base}/api/export/json`)).json();
  assert.deepStrictEqual(body.highlights, [{ _id: 'h1', text: 'A moat.', tags: ['moats'], articleId: 'a1', articleTitle: 'On moats' }]);
  assert.strictEqual(body.notebookEntries.length, 1);
});

test('the PDF export is a zip with a PDF for the article, the highlight and the note', async () => {
  const response = await fetch(`${base}/api/export/pdf-zip`);
  assert.strictEqual(response.status, 200);
  const zip = Buffer.from(await response.arrayBuffer());
  assert.strictEqual(zip.subarray(0, 2).toString(), 'PK');
  const names = zip.toString('latin1');
  ['articles/', 'highlights/', 'notebook/'].forEach(folder => assert.ok(names.includes(folder), `${folder} in the zip`));
});
