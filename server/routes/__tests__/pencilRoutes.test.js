const express = require('express');
const { buildPencilRouter } = require('../pencilRoutes');
const { pencilOf } = require('../../services/agentTokenService');

const USER = '0123456789abcdef01234567';
const NOTE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ARTICLE = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const HIGHLIGHT = 'cccccccccccccccccccccccc';

describe('pencil', () => {
  it('is the agent that wrote, for a token that may write, and ink for everyone else', () => {
    const token = { id: 'tok', label: 'Claude Code local', runtime: 'claude-code', scopes: ['read', 'agent-write'] };
    expect(pencilOf({ agentToken: token })).toMatchObject({ agent: 'Claude Code local', tokenId: 'tok' });
    expect(pencilOf({ agentToken: { ...token, label: '' } }).agent).toBe('Claude Code');
    // The reader, and their own desktop bringing things in, write in ink.
    expect(pencilOf({ user: { id: USER } })).toBeNull();
    expect(pencilOf({ agentToken: { ...token, scopes: ['capture'] } })).toBeNull();
  });

  describe('inking', () => {
    let server; let url; let Article; let NotebookEntry; let agent;
    const ink = body => fetch(`${url}/api/ink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    beforeAll(async () => {
      const found = { matchedCount: 1 };
      NotebookEntry = { updateOne: jest.fn(async () => found) };
      Article = { updateOne: jest.fn(async filter => (String(filter._id) === ARTICLE ? found : { matchedCount: 0 })) };
      const app = express();
      app.use(express.json());
      app.use(buildPencilRouter({
        authenticateToken: (req, _res, next) => { req.user = { id: USER }; next(); },
        humanOnly: (_req, res, next) => (agent ? res.status(403).json({ error: 'Only you can do that, not an agent.' }) : next()),
        Article,
        NotebookEntry
      }));
      server = app.listen(0);
      await new Promise(resolve => server.once('listening', resolve));
      url = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(() => server.close());
    beforeEach(() => { agent = false; jest.clearAllMocks(); });

    it('takes a note, an article with its highlights, or one highlight out of pencil', async () => {
      expect((await ink({ kind: 'note', id: NOTE })).status).toBe(200);
      expect(NotebookEntry.updateOne).toHaveBeenCalledWith({ _id: NOTE, userId: USER }, { $set: { pencil: null } });
      await ink({ kind: 'article', id: ARTICLE });
      expect(Article.updateOne).toHaveBeenLastCalledWith({ _id: ARTICLE, userId: USER }, { $set: { pencil: null, 'highlights.$[].pencil': null } });
      await ink({ kind: 'highlight', id: ARTICLE, highlightId: HIGHLIGHT });
      expect(Article.updateOne).toHaveBeenLastCalledWith({ _id: ARTICLE, userId: USER, 'highlights._id': HIGHLIGHT }, { $set: { 'highlights.$.pencil': null } });
    });

    it('is the reader\'s alone, and only for their own things', async () => {
      agent = true;
      expect((await ink({ kind: 'note', id: NOTE })).status).toBe(403);
      agent = false;
      expect((await ink({ kind: 'article', id: NOTE })).status).toBe(404);
      expect((await ink({ kind: 'page', id: NOTE })).status).toBe(400);
      expect((await ink({ kind: 'highlight', id: ARTICLE })).status).toBe(400);
    });
  });
});
