/* Loopback-only visual fixture. Real workbench route, file-backed model adapter.
   This proves HTTP/reload behavior, not Mongo persistence or production. */
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { buildNotebookRouter } = require('../server/routes/notebookRoutes');
const { sanitizeNotebookBlocks, sanitizeAsidePieces } = require('../server/utils/notebookIdentity');
const app = express();
app.use(express.json({ limit: '2mb' }));
const owner = '64f200000000000000000001';
const id = '64f2000000000000000000aa';
const file = path.resolve(__dirname, '../tmp/think-room-qa.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
const prose = [
  'The useful question is what happens after someone receives an answer. Can they understand it, test it, and use it to do something they could not do before?',
  'AI makes expertise available to everyone. But access to an answer is only the beginning. Learning still asks us to practice, notice mistakes, and develop judgment.',
  'I want tools that leave people more capable after the conversation. A useful answer gives you a next move and a way to check whether it worked.'
];
let row = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
  _id: id, userId: owner, type: 'note', title: 'Expertise, within reach',
  content: prose.map(text => `<p>${text}</p>`).join(''),
  blocks: prose.map((text, index) => ({ id: `p${index}`, type: 'paragraph', text })),
  asidePieces: [], updatedAt: new Date().toISOString(),
  workingState: { revision: 0, materials: [], trials: [], looseThoughts: [], nextTimeLine: {} }
};
const persist = () => fs.writeFileSync(file, JSON.stringify(row, null, 2));
persist();
const token = jwt.sign({ id: owner, username: 'Think fixture' }, 'loopback-think-fixture', { expiresIn: '12h' });
const auth = (req, _res, next) => { req.user = { id: owner }; next(); };
app.get('/__qa', (_req, res) => res.type('html').send(`<title>Local Think fixture</title><script>localStorage.setItem('token',${JSON.stringify(token)});localStorage.setItem('noeis.wikiOnboardingComplete::${owner}','true');location.replace('/think?tab=notebook&entryId=${id}');</script>`));
let uiSettings = { theme: 'light' };
app.get('/api/ui-settings', (_req, res) => res.json(uiSettings));
app.put('/api/ui-settings', (req, res) => { uiSettings = req.body; res.json(uiSettings); });
app.get('/api/auth/me', (_req, res) => res.json({ id: owner, _id: owner, username: 'Think fixture' }));
app.get('/api/notebook', (_req, res) => res.json([row]));
app.get('/api/notebook/folders', (_req, res) => res.json([]));
app.get('/api/notebook/:id', (_req, res) => res.json(row));
app.put('/api/notebook/:id', (req, res) => {
  for (const key of ['title', 'content', 'tags', 'type']) if (req.body[key] !== undefined) row[key] = req.body[key];
  if (req.body.blocks) row.blocks = sanitizeNotebookBlocks(req.body.blocks);
  if (req.body.asidePieces) row.asidePieces = sanitizeAsidePieces(req.body.asidePieces);
  row.updatedAt = new Date().toISOString(); persist(); res.json(row);
});
app.use(buildNotebookRouter({
  authenticateToken: auth,
  NotebookEntry: {
    findOne: async () => row,
    findOneAndUpdate: async (query, update) => {
      const expected = query.$or ? 0 : query['workingState.revision'];
      if (expected !== Number(row.workingState.revision || 0)) return null;
      row.workingState = update.$set.workingState; persist(); return row;
    }
  },
  NotebookFolder: {}, ReferenceEdge: {}, ensureNotebookBlocks: () => {}, createBlockId: () => 'fixture-block',
  stripHtml: value => String(value || ''), normalizeItemType: value => value, parseClaimId: () => null,
  normalizeTags: value => value || [], syncNotebookReferences: async () => {}, enqueueNotebookEmbedding: () => {},
  trackEvent: () => {}, EVENT_NAMES: {}, findHighlightById: async () => null
}));
app.get('/api/onboarding/state', (_req, res) => res.json({ complete: true }));
app.get('/api/system/loops', (_req, res) => res.json({ schemaVersion: 1, generatedAt: new Date().toISOString(), loops: Object.fromEntries(['loop.morning-paper', 'loop.wiki-maintenance', 'loop.weekly-ai', 'loop.outcome-review'].map(id => [id, { id, status: 'idle', reason: 'Local fixture only', updatedAt: null, href: '', receipt: null, metrics: {} }])) }));
app.get('/api/system/storage', (_req, res) => res.json({}));
app.get('/api/agent/threads', (_req, res) => res.json({ threads: [] }));
app.get('/api/*', (_req, res) => res.json([]));
app.get('/_vercel/insights/script.js', (_req, res) => res.type('js').send(''));
app.use(express.static(path.resolve(__dirname, '../note-taker-ui/build')));
app.get('*', (_req, res) => res.sendFile(path.resolve(__dirname, '../note-taker-ui/build/index.html')));
app.listen(3107, '127.0.0.1', () => console.log('Think file-backed fixture: http://127.0.0.1:3107/__qa'));
