const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildAuthenticateAgentToken } = require('./agentTokenService');
const { normalizeEdition } = require('./editionShape');
const { fileAgentsReadingEditions } = require('./agentsReadingEdition');

/* Last week's reading by the reader's agents becomes one issue, filed by
   Noeis through the Editions API with a connection of its own; the issue
   meets the Edition standard, and a week is filed once. */
test('real Mongo: what agents read last week is filed as one Edition, by Noeis', async () => {
  const memory = await MongoMemoryServer.create();
  let server;
  try {
    await mongoose.connect(memory.getUri());
    const { Article, Edition, AgentToken } = require('../models');
    const userId = new mongoose.Types.ObjectId();
    const now = Date.parse('2026-11-18T12:00:00Z');
    const lastWeek = new Date('2026-11-12T09:00:00Z');
    await Article.create([
      { userId, url: 'https://example.com/base-rates', title: 'Base rates', content: '<p>Opening line.</p>', pencil: { agent: 'Claude Code', at: lastWeek }, highlights: [{ text: 'Start from the base rate.', pencil: { agent: 'Claude Code', at: lastWeek } }] },
      { userId, url: 'https://example.com/forecasts', title: 'Forecasts', content: '<p>Opening line.</p>', pencil: { agent: 'Codex', at: lastWeek }, highlights: [{ text: 'Calibrate predictions.', pencil: { agent: 'Claude Code', at: lastWeek } }] },
      { userId, url: 'https://example.com/panels', title: 'Panels', content: '<p>Panels overweight charisma.</p><p>More.</p>', pencil: { agent: 'Codex', at: lastWeek } },
      { userId, url: 'https://example.com/yours', title: 'Yours', content: '<p>x</p>', pencil: null },
      { userId, url: 'https://example.com/this-week', title: 'This week', content: '<p>x</p>', pencil: { agent: 'Codex', at: new Date(now) } }
    ]);

    const filed = [];
    const app = express();
    app.use(express.json());
    const authenticateToken = buildAuthenticateAgentToken({ AgentToken, isAccountActive: async () => true });
    app.post('/api/editions', authenticateToken, async (req, res) => {
      filed.push({ by: req.agentToken.label, body: req.body });
      await Edition.create({ userId: req.user.id, profile: req.body.profile, title: 'x', windowStart: req.body.windowStart, windowEnd: req.body.windowEnd, items: [] }).catch(() => null);
      res.status(201).json({ ok: true });
    });
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const apiUrl = `http://127.0.0.1:${server.address().port}`;

    await fileAgentsReadingEditions({ models: { Article, Edition, AgentToken }, apiUrl, now });
    assert.equal(filed.length, 1);
    const [{ by, body }] = filed;
    assert.equal(by, 'Noeis');
    assert.deepEqual([body.profile, body.windowStart, body.windowEnd], ['agents_reading', '2026-11-08', '2026-11-14']);
    // The line that mattered: the passage the agent marked, or else the page's opening.
    assert.deepEqual(body.items.map(item => [item.title, item.sourceLabel, item.finding]).sort(), [
      ['Base rates', 'Claude Code', 'Start from the base rate.'],
      ['Forecasts', 'Codex', 'Calibrate predictions.'],
      ['Panels', 'Codex', 'Panels overweight charisma. More.']
    ]);
    const normalized = normalizeEdition(body);
    assert.equal(normalized.items.length, 3);
    assert.equal(normalized.items.find(item => item.title === 'Forecasts').boundary,
      'Codex saved this for you. Claude Code highlighted this passage. You have not read it yourself yet.');
    assert.equal(normalized.items.find(item => item.title === 'Base rates').boundary,
      'Claude Code saved this and highlighted the passage for you. You have not read it yourself yet.');
    assert.equal(normalized.items.find(item => item.title === 'Panels').boundary,
      'Codex saved this for you. You have not read it yourself yet.');
    assert.equal(await AgentToken.countDocuments({}), 0);

    // Filed once a week.
    await fileAgentsReadingEditions({ models: { Article, Edition, AgentToken }, apiUrl, now });
    assert.equal(filed.length, 1);
  } finally {
    server?.close();
    await mongoose.disconnect();
    await memory.stop();
  }
});
