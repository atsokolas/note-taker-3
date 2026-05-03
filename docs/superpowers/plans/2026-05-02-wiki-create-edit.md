# Wiki Create/Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a top-level Wiki workspace where users create private draft pages from any starting context, receive AI-assisted starter content, and edit the live page with rich text, visibility, source scope, and sources.

**Architecture:** Add an independent `WikiPage` model and authenticated Wiki router, then expose `/wiki` and `/wiki/:id` in the React app. The first pass uses existing auth, Mongo/Mongoose, TipTap, and API patterns, with an AI draft route that creates recoverable draft state even when AI is unavailable.

**Tech Stack:** Node/Express, Mongoose, React 19, React Router, Axios, TipTap, Jest/React Testing Library, existing script-based route smoke tests.

---

## File Structure

- Create `server/routes/wikiRoutes.js`: authenticated Wiki CRUD, source attachment, and AI draft endpoints.
- Modify `server/models/index.js`: add `WikiPage` schema/model and export.
- Modify `server/server.js`: import `buildWikiRouter` and mount it with `authenticateToken`, `WikiPage`, and source models.
- Create `scripts/test_wiki_routes.js`: smoke route test for create, list, update, draft failure/success shape, and delete/archive.
- Create `note-taker-ui/src/api/wiki.js`: frontend API wrapper for Wiki endpoints.
- Create `note-taker-ui/src/pages/Wiki.jsx`: route page that switches between index and editor by URL param.
- Create `note-taker-ui/src/components/wiki/WikiIndex.jsx`: list/search/create surface.
- Create `note-taker-ui/src/components/wiki/WikiPageEditor.jsx`: TipTap editor, metadata controls, autosave.
- Create `note-taker-ui/src/components/wiki/WikiPageMetaBar.jsx`: status, visibility, source scope, and page type controls.
- Create `note-taker-ui/src/components/wiki/WikiAiSourcePanel.jsx`: AI draft state, sources, and refresh action.
- Create `note-taker-ui/src/components/wiki/WikiPageEditor.test.jsx`: editor and metadata behavior tests.
- Modify `note-taker-ui/src/App.js`: lazy-load Wiki, add top-level nav item, add `/wiki` and `/wiki/:id` routes.
- Modify existing CSS file `note-taker-ui/src/styles/think-home-polish.css`: add Wiki layout classes.

## Task 1: Backend Model

**Files:**
- Modify: `server/models/index.js`

- [ ] **Step 1: Add Wiki constants and schemas near the other workspace schemas**

Add these constants and schemas after `NotebookFolder` is defined, before concept schemas begin:

```js
const WIKI_PAGE_TYPES = ['topic', 'question', 'project', 'source', 'person', 'synthesis'];
const WIKI_PAGE_STATUSES = ['draft', 'published', 'archived'];
const WIKI_VISIBILITY_VALUES = ['private', 'shared'];
const WIKI_SOURCE_SCOPES = ['entire_library', 'current_item', 'selected_sources'];

const wikiCreatedFromSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['wiki_index', 'idea', 'question', 'highlight', 'article', 'notebook', 'concept', 'sources', 'paste', 'search', 'thought_partner'],
    default: 'wiki_index'
  },
  objectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  objectIds: [{ type: mongoose.Schema.Types.ObjectId }],
  text: { type: String, default: '', trim: true },
  label: { type: String, default: '', trim: true }
}, { _id: false });

const wikiSourceRefSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external'],
    required: true
  },
  objectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, default: '', trim: true },
  snippet: { type: String, default: '', trim: true },
  url: { type: String, default: '', trim: true },
  citationLabel: { type: String, default: '', trim: true },
  addedBy: { type: String, enum: ['user', 'ai'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const wikiAiStateSchema = new mongoose.Schema({
  draftStatus: { type: String, enum: ['idle', 'drafting', 'ready', 'error'], default: 'idle' },
  lastDraftedAt: { type: Date, default: null },
  lastError: { type: String, default: '', trim: true },
  model: { type: String, default: '', trim: true },
  sourceScopeAtDraft: { type: String, enum: WIKI_SOURCE_SCOPES, default: 'entire_library' }
}, { _id: false });

const wikiPageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, default: 'Untitled Wiki Page' },
  slug: { type: String, required: true, trim: true },
  pageType: { type: String, enum: WIKI_PAGE_TYPES, default: 'topic' },
  status: { type: String, enum: WIKI_PAGE_STATUSES, default: 'draft', index: true },
  visibility: { type: String, enum: WIKI_VISIBILITY_VALUES, default: 'private', index: true },
  sourceScope: { type: String, enum: WIKI_SOURCE_SCOPES, default: 'entire_library' },
  createdFrom: { type: wikiCreatedFromSchema, default: () => ({}) },
  body: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ type: 'doc', content: [{ type: 'paragraph' }] })
  },
  plainText: { type: String, default: '', trim: true },
  sourceRefs: { type: [wikiSourceRefSchema], default: [] },
  aiState: { type: wikiAiStateSchema, default: () => ({}) }
}, { timestamps: true });

wikiPageSchema.index({ userId: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, status: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, visibility: 1, updatedAt: -1 });
wikiPageSchema.index({ userId: 1, slug: 1 }, { unique: true });

const WikiPage = mongoose.model('WikiPage', wikiPageSchema);
```

- [ ] **Step 2: Export `WikiPage`**

Add `WikiPage` to the `module.exports` object near the other workspace models:

```js
  WikiPage,
```

- [ ] **Step 3: Verify the model loads**

Run:

```bash
node -e "const { WikiPage } = require('./server/models'); console.log(WikiPage.modelName)"
```

Expected output:

```text
WikiPage
```

- [ ] **Step 4: Commit**

```bash
git add server/models/index.js
git commit -m "feat: add wiki page model"
```

## Task 2: Backend Wiki Routes

**Files:**
- Create: `server/routes/wikiRoutes.js`
- Modify: `server/server.js`
- Test: `scripts/test_wiki_routes.js`

- [ ] **Step 1: Create route helper module**

Create `server/routes/wikiRoutes.js` with:

```js
const express = require('express');

const PAGE_TYPES = new Set(['topic', 'question', 'project', 'source', 'person', 'synthesis']);
const STATUSES = new Set(['draft', 'published', 'archived']);
const VISIBILITIES = new Set(['private', 'shared']);
const SOURCE_SCOPES = new Set(['entire_library', 'current_item', 'selected_sources']);
const CREATED_FROM_TYPES = new Set(['wiki_index', 'idea', 'question', 'highlight', 'article', 'notebook', 'concept', 'sources', 'paste', 'search', 'thought_partner']);

const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });

const slugify = (value = '') => {
  const base = String(value || 'untitled-wiki-page')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'untitled-wiki-page';
};

const extractPlainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractPlainText).filter(Boolean).join(' ');
  if (typeof node !== 'object') return '';
  const ownText = typeof node.text === 'string' ? node.text : '';
  const childText = Array.isArray(node.content) ? extractPlainText(node.content) : '';
  return [ownText, childText].filter(Boolean).join(' ').trim();
};

const normalizeCreatedFrom = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { type: 'wiki_index' };
  const type = CREATED_FROM_TYPES.has(String(value.type || '')) ? String(value.type) : 'wiki_index';
  return {
    type,
    objectId: value.objectId || null,
    objectIds: Array.isArray(value.objectIds) ? value.objectIds.filter(Boolean).slice(0, 50) : [],
    text: String(value.text || '').trim().slice(0, 8000),
    label: String(value.label || '').trim().slice(0, 240)
  };
};

const buildDraftDoc = ({ title, seedText }) => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: seedText || 'Start writing. AI can help expand this page from your sources.' }]
    }
  ]
});

const buildWikiRouter = ({ authenticateToken, WikiPage }) => {
  const router = express.Router();

  const buildUniqueSlug = async (userId, title, existingId = null) => {
    const base = slugify(title);
    for (let i = 0; i < 25; i += 1) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const query = { userId, slug };
      if (existingId) query._id = { $ne: existingId };
      const existing = await WikiPage.findOne(query).select('_id').lean();
      if (!existing) return slug;
    }
    return `${base}-${Date.now()}`;
  };

  router.get('/api/wiki/pages', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const query = { userId };
      if (STATUSES.has(String(req.query.status || ''))) query.status = String(req.query.status);
      if (VISIBILITIES.has(String(req.query.visibility || ''))) query.visibility = String(req.query.visibility);
      if (PAGE_TYPES.has(String(req.query.pageType || ''))) query.pageType = String(req.query.pageType);
      const q = String(req.query.q || '').trim();
      if (q) query.$or = [
        { title: new RegExp(q, 'i') },
        { plainText: new RegExp(q, 'i') }
      ];
      const pages = await WikiPage.find(query).sort({ updatedAt: -1 }).limit(100).lean();
      res.status(200).json(pages);
    } catch (error) {
      console.error('Error listing wiki pages:', error);
      res.status(500).json({ error: 'Failed to list wiki pages.' });
    }
  });

  router.post('/api/wiki/pages', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const title = String(req.body.title || req.body.createdFrom?.label || 'Untitled Wiki Page').trim().slice(0, 180) || 'Untitled Wiki Page';
      const body = req.body.body && typeof req.body.body === 'object' ? req.body.body : emptyDoc();
      const page = new WikiPage({
        userId,
        title,
        slug: await buildUniqueSlug(userId, title),
        pageType: PAGE_TYPES.has(req.body.pageType) ? req.body.pageType : 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: SOURCE_SCOPES.has(req.body.sourceScope) ? req.body.sourceScope : 'entire_library',
        createdFrom: normalizeCreatedFrom(req.body.createdFrom),
        body,
        plainText: extractPlainText(body)
      });
      await page.save();
      res.status(201).json(page);
    } catch (error) {
      console.error('Error creating wiki page:', error);
      res.status(500).json({ error: 'Failed to create wiki page.' });
    }
  });

  router.get('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      res.status(200).json(page);
    } catch (error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.patch('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      if (req.body.title !== undefined) {
        page.title = String(req.body.title || 'Untitled Wiki Page').trim().slice(0, 180) || 'Untitled Wiki Page';
        page.slug = await buildUniqueSlug(req.user.id, page.title, page._id);
      }
      if (PAGE_TYPES.has(req.body.pageType)) page.pageType = req.body.pageType;
      if (STATUSES.has(req.body.status)) page.status = req.body.status;
      if (VISIBILITIES.has(req.body.visibility)) page.visibility = req.body.visibility;
      if (SOURCE_SCOPES.has(req.body.sourceScope)) page.sourceScope = req.body.sourceScope;
      if (req.body.body && typeof req.body.body === 'object') {
        page.body = req.body.body;
        page.plainText = extractPlainText(req.body.body);
      }
      await page.save();
      res.status(200).json(page);
    } catch (error) {
      console.error('Error updating wiki page:', error);
      res.status(500).json({ error: 'Failed to update wiki page.' });
    }
  });

  router.delete('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    try {
      const page = await WikiPage.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { status: 'archived' },
        { new: true }
      );
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      res.status(200).json(page);
    } catch (error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.post('/api/wiki/pages/:id/ai/draft', authenticateToken, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const seedText = page.createdFrom?.text || page.plainText || '';
      page.aiState = {
        draftStatus: 'ready',
        lastDraftedAt: new Date(),
        lastError: '',
        model: 'local-stub',
        sourceScopeAtDraft: page.sourceScope
      };
      if (!page.plainText) {
        page.body = buildDraftDoc({ title: page.title, seedText });
        page.plainText = extractPlainText(page.body);
      }
      await page.save();
      res.status(200).json(page);
    } catch (error) {
      console.error('Error drafting wiki page:', error);
      res.status(500).json({ error: 'Failed to draft wiki page.' });
    }
  });

  router.post('/api/wiki/pages/:id/sources', authenticateToken, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      const type = String(req.body.type || '').trim();
      if (!['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external'].includes(type)) {
        return res.status(400).json({ error: 'Invalid source type.' });
      }
      page.sourceRefs.push({
        type,
        objectId: req.body.objectId || null,
        title: String(req.body.title || '').trim().slice(0, 240),
        snippet: String(req.body.snippet || '').trim().slice(0, 1000),
        url: String(req.body.url || '').trim().slice(0, 1000),
        citationLabel: String(req.body.citationLabel || '').trim().slice(0, 120),
        addedBy: req.body.addedBy === 'ai' ? 'ai' : 'user'
      });
      await page.save();
      res.status(201).json(page);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add wiki source.' });
    }
  });

  router.delete('/api/wiki/pages/:id/sources/:sourceRefId', authenticateToken, async (req, res) => {
    try {
      const page = await WikiPage.findOne({ _id: req.params.id, userId: req.user.id });
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      page.sourceRefs = page.sourceRefs.filter(source => String(source._id) !== String(req.params.sourceRefId));
      await page.save();
      res.status(200).json(page);
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove wiki source.' });
    }
  });

  return router;
};

module.exports = { buildWikiRouter, extractPlainText, slugify };
```

- [ ] **Step 2: Mount router in `server/server.js`**

Add the import near other route imports:

```js
const { buildWikiRouter } = require('./routes/wikiRoutes');
```

Add `WikiPage` to the model destructuring from `require('./models')`.

Mount after notebook routes:

```js
app.use(buildWikiRouter({
  authenticateToken,
  WikiPage
}));
```

- [ ] **Step 3: Add smoke test script**

Create `scripts/test_wiki_routes.js`:

```js
#!/usr/bin/env node
const assert = require('assert');

const baseUrl = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const token = process.env.AUTH_TOKEN || '';

if (!token) {
  console.error('AUTH_TOKEN is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const request = async (path, options = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_error) { body = { raw: text }; }
  return { res, body, text };
};

const run = async () => {
  const createdPayload = {
    title: `Wiki Route Test ${Date.now()}`,
    createdFrom: {
      type: 'idea',
      text: 'A route test can become a wiki page.',
      label: 'Route test idea'
    }
  };

  const created = await request('/api/wiki/pages', {
    method: 'POST',
    body: JSON.stringify(createdPayload)
  });
  assert.strictEqual(created.res.status, 201, created.text);
  assert.strictEqual(created.body.status, 'draft');
  assert.strictEqual(created.body.visibility, 'private');
  assert.strictEqual(created.body.sourceScope, 'entire_library');
  assert.ok(created.body._id);

  const patched = await request(`/api/wiki/pages/${created.body._id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Updated Wiki Route Test',
      pageType: 'project',
      visibility: 'shared',
      sourceScope: 'selected_sources',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated body text.' }] }]
      }
    })
  });
  assert.strictEqual(patched.res.status, 200, patched.text);
  assert.strictEqual(patched.body.title, 'Updated Wiki Route Test');
  assert.strictEqual(patched.body.pageType, 'project');
  assert.strictEqual(patched.body.visibility, 'shared');
  assert.ok(patched.body.plainText.includes('Updated body text'));

  const drafted = await request(`/api/wiki/pages/${created.body._id}/ai/draft`, { method: 'POST' });
  assert.strictEqual(drafted.res.status, 200, drafted.text);
  assert.strictEqual(drafted.body.aiState.draftStatus, 'ready');

  const listed = await request('/api/wiki/pages');
  assert.strictEqual(listed.res.status, 200, listed.text);
  assert.ok(Array.isArray(listed.body));
  assert.ok(listed.body.some(page => String(page._id) === String(created.body._id)));

  const archived = await request(`/api/wiki/pages/${created.body._id}`, { method: 'DELETE' });
  assert.strictEqual(archived.res.status, 200, archived.text);
  assert.strictEqual(archived.body.status, 'archived');

  console.log('wiki route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Run route test against a local authenticated server**

Run:

```bash
AUTH_TOKEN=<valid-token> WEB_APP_URL=http://localhost:5500 node scripts/test_wiki_routes.js
```

Expected output:

```text
wiki route tests passed
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/wikiRoutes.js server/server.js scripts/test_wiki_routes.js
git commit -m "feat: add wiki page routes"
```

## Task 3: Frontend API and Routing

**Files:**
- Create: `note-taker-ui/src/api/wiki.js`
- Create: `note-taker-ui/src/pages/Wiki.jsx`
- Modify: `note-taker-ui/src/App.js`

- [ ] **Step 1: Add API wrapper**

Create `note-taker-ui/src/api/wiki.js`:

```js
import api from '../api';

export const listWikiPages = async (params = {}) => {
  const res = await api.get('/api/wiki/pages', { params });
  return res.data || [];
};

export const createWikiPage = async (payload = {}) => {
  const res = await api.post('/api/wiki/pages', payload);
  return res.data;
};

export const getWikiPage = async (id) => {
  const res = await api.get(`/api/wiki/pages/${id}`);
  return res.data;
};

export const updateWikiPage = async (id, updates = {}) => {
  const res = await api.patch(`/api/wiki/pages/${id}`, updates);
  return res.data;
};

export const archiveWikiPage = async (id) => {
  const res = await api.delete(`/api/wiki/pages/${id}`);
  return res.data;
};

export const draftWikiPage = async (id) => {
  const res = await api.post(`/api/wiki/pages/${id}/ai/draft`);
  return res.data;
};

export const addWikiSource = async (id, source) => {
  const res = await api.post(`/api/wiki/pages/${id}/sources`, source);
  return res.data;
};

export const removeWikiSource = async (id, sourceRefId) => {
  const res = await api.delete(`/api/wiki/pages/${id}/sources/${sourceRefId}`);
  return res.data;
};
```

- [ ] **Step 2: Create route page shell**

Create `note-taker-ui/src/pages/Wiki.jsx`:

```jsx
import React from 'react';
import { useParams } from 'react-router-dom';
import WikiIndex from '../components/wiki/WikiIndex';
import WikiPageEditor from '../components/wiki/WikiPageEditor';

const Wiki = () => {
  const { id } = useParams();
  return id ? <WikiPageEditor pageId={id} /> : <WikiIndex />;
};

export default Wiki;
```

- [ ] **Step 3: Wire navigation and routes**

In `note-taker-ui/src/App.js`, add:

```js
const Wiki = lazy(() => import('./pages/Wiki'));
```

Add Wiki to `primaryNavItems` after Questions:

```js
{
  label: 'Wiki',
  to: '/wiki',
  match: (location) => location.pathname.startsWith('/wiki')
}
```

Add routes inside authenticated routes:

```jsx
<Route path="/wiki" element={<Wiki />} />
<Route path="/wiki/:id" element={<Wiki />} />
```

- [ ] **Step 4: Run frontend route import check**

Run:

```bash
cd note-taker-ui && npm test -- --watchAll=false --runInBand App.test.js
```

Expected: existing App test suite passes or fails only for known unrelated baseline issues. Fix any Wiki import/routing failure before continuing.

- [ ] **Step 5: Commit**

```bash
git add note-taker-ui/src/api/wiki.js note-taker-ui/src/pages/Wiki.jsx note-taker-ui/src/App.js
git commit -m "feat: add wiki frontend route"
```

## Task 4: Wiki Index Create Flow

**Files:**
- Create: `note-taker-ui/src/components/wiki/WikiIndex.jsx`
- Modify: `note-taker-ui/src/styles/think-home-polish.css`

- [ ] **Step 1: Create Wiki index**

Create `note-taker-ui/src/components/wiki/WikiIndex.jsx`:

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWikiPage, draftWikiPage, listWikiPages } from '../../api/wiki';
import { Button, SurfaceCard } from '../ui';

const PAGE_TYPES = ['all', 'topic', 'question', 'project', 'source', 'person', 'synthesis'];
const VISIBILITIES = ['all', 'private', 'shared'];
const STATUSES = ['all', 'draft', 'published', 'archived'];

const WikiIndex = () => {
  const navigate = useNavigate();
  const [pages, setPages] = useState([]);
  const [query, setQuery] = useState('');
  const [pageType, setPageType] = useState('all');
  const [visibility, setVisibility] = useState('all');
  const [status, setStatus] = useState('all');
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadPages = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (pageType !== 'all') params.pageType = pageType;
      if (visibility !== 'all') params.visibility = visibility;
      if (status !== 'all') params.status = status;
      setPages(await listWikiPages(params));
    } catch (_error) {
      setError('Failed to load Wiki pages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, [pageType, visibility, status]);

  const filteredPages = useMemo(() => pages, [pages]);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const title = seed.trim() || 'Untitled Wiki Page';
      const page = await createWikiPage({
        title,
        createdFrom: {
          type: seed.trim() ? 'idea' : 'wiki_index',
          text: seed.trim(),
          label: title
        }
      });
      navigate(`/wiki/${page._id}`);
      draftWikiPage(page._id).catch(() => {});
    } catch (_error) {
      setError('Failed to create Wiki page.');
      setCreating(false);
    }
  };

  return (
    <main className="wiki-page wiki-index">
      <section className="wiki-index__header">
        <div>
          <p className="eyebrow">Wiki</p>
          <h1>Your editable knowledge base</h1>
          <p className="muted">Create source-backed pages from ideas, questions, notes, highlights, and articles.</p>
        </div>
        <div className="wiki-index__composer">
          <input
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="Start from an idea, question, source, or rough note"
            aria-label="Wiki page starting point"
          />
          <Button onClick={handleCreate} disabled={creating}>{creating ? 'Creating...' : 'New page'}</Button>
        </div>
      </section>

      <section className="wiki-index__filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') loadPages(); }}
          placeholder="Search Wiki pages"
          aria-label="Search Wiki pages"
        />
        <select value={pageType} onChange={(event) => setPageType(event.target.value)} aria-label="Page type filter">
          {PAGE_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={visibility} onChange={(event) => setVisibility(event.target.value)} aria-label="Visibility filter">
          {VISIBILITIES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status filter">
          {STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </section>

      {error ? <div className="form-error">{error}</div> : null}
      {loading ? <p className="muted">Loading Wiki pages...</p> : null}

      <section className="wiki-index__grid">
        {!loading && filteredPages.length === 0 ? (
          <SurfaceCard className="wiki-index__empty">
            <h2>No Wiki pages yet</h2>
            <p className="muted">Create the first page from any idea or source you want to develop.</p>
          </SurfaceCard>
        ) : null}
        {filteredPages.map(page => (
          <SurfaceCard
            key={page._id}
            className="wiki-index__card"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/wiki/${page._id}`)}
            onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/wiki/${page._id}`); }}
          >
            <div className="wiki-index__card-meta">
              <span>{page.pageType}</span>
              <span>{page.visibility}</span>
              <span>{page.status}</span>
            </div>
            <h2>{page.title}</h2>
            <p>{page.plainText || 'No body yet.'}</p>
          </SurfaceCard>
        ))}
      </section>
    </main>
  );
};

export default WikiIndex;
```

- [ ] **Step 2: Add index CSS**

Append to `note-taker-ui/src/styles/think-home-polish.css`:

```css
.wiki-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
}

.wiki-index__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 460px);
  gap: 24px;
  align-items: end;
}

.wiki-index__composer,
.wiki-index__filters {
  display: flex;
  gap: 10px;
  align-items: center;
}

.wiki-index__composer input,
.wiki-index__filters input,
.wiki-index__filters select,
.wiki-meta-bar select,
.wiki-meta-bar input {
  min-height: 38px;
  border: 1px solid var(--border-subtle, #d9dee8);
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}

.wiki-index__composer input,
.wiki-index__filters input {
  flex: 1;
}

.wiki-index__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.wiki-index__card {
  cursor: pointer;
}

.wiki-index__card h2 {
  margin: 8px 0;
  font-size: 18px;
}

.wiki-index__card p {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.wiki-index__card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-muted, #667085);
  font-size: 12px;
  text-transform: capitalize;
}

@media (max-width: 860px) {
  .wiki-index__header {
    grid-template-columns: 1fr;
  }

  .wiki-index__filters {
    flex-wrap: wrap;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add note-taker-ui/src/components/wiki/WikiIndex.jsx note-taker-ui/src/styles/think-home-polish.css
git commit -m "feat: add wiki index create flow"
```

## Task 5: Wiki Editor and Source Panel

**Files:**
- Create: `note-taker-ui/src/components/wiki/WikiPageEditor.jsx`
- Create: `note-taker-ui/src/components/wiki/WikiPageMetaBar.jsx`
- Create: `note-taker-ui/src/components/wiki/WikiAiSourcePanel.jsx`
- Modify: `note-taker-ui/src/styles/think-home-polish.css`

- [ ] **Step 1: Create metadata bar**

Create `note-taker-ui/src/components/wiki/WikiPageMetaBar.jsx`:

```jsx
import React from 'react';

const PAGE_TYPES = ['topic', 'question', 'project', 'source', 'person', 'synthesis'];
const STATUSES = ['draft', 'published', 'archived'];
const VISIBILITIES = ['private', 'shared'];
const SOURCE_SCOPES = ['entire_library', 'current_item', 'selected_sources'];

const labels = {
  entire_library: 'Entire library',
  current_item: 'Current item',
  selected_sources: 'Selected sources'
};

const WikiPageMetaBar = ({ page, onChange, saving }) => (
  <div className="wiki-meta-bar" aria-label="Wiki page metadata">
    <label>
      Type
      <select value={page.pageType || 'topic'} onChange={(event) => onChange({ pageType: event.target.value })}>
        {PAGE_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <label>
      Status
      <select value={page.status || 'draft'} onChange={(event) => onChange({ status: event.target.value })}>
        {STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <label>
      Visibility
      <select value={page.visibility || 'private'} onChange={(event) => onChange({ visibility: event.target.value })}>
        {VISIBILITIES.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <label>
      Source scope
      <select value={page.sourceScope || 'entire_library'} onChange={(event) => onChange({ sourceScope: event.target.value })}>
        {SOURCE_SCOPES.map(value => <option key={value} value={value}>{labels[value]}</option>)}
      </select>
    </label>
    <span className="wiki-meta-bar__save-state">{saving ? 'Saving...' : 'Saved'}</span>
  </div>
);

export default WikiPageMetaBar;
```

- [ ] **Step 2: Create AI/source panel**

Create `note-taker-ui/src/components/wiki/WikiAiSourcePanel.jsx`:

```jsx
import React from 'react';
import { Button, SurfaceCard } from '../ui';

const WikiAiSourcePanel = ({ page, drafting, onDraft }) => {
  const sources = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
  const aiState = page?.aiState || {};
  return (
    <aside className="wiki-source-panel">
      <SurfaceCard>
        <div className="wiki-source-panel__header">
          <div>
            <h2>AI draft</h2>
            <p className="muted">{aiState.draftStatus || 'idle'}</p>
          </div>
          <Button onClick={onDraft} disabled={drafting}>{drafting ? 'Drafting...' : 'Refresh draft'}</Button>
        </div>
        {aiState.lastError ? <p className="form-error">{aiState.lastError}</p> : null}
        <p className="muted">Drafting uses {page?.sourceScope === 'entire_library' ? 'your entire library' : page?.sourceScope || 'the selected scope'} unless you change the source scope.</p>
      </SurfaceCard>

      <SurfaceCard>
        <h2>Sources</h2>
        {sources.length === 0 ? <p className="muted">No sources attached yet.</p> : null}
        <div className="wiki-source-panel__list">
          {sources.map(source => (
            <article key={source._id || `${source.type}-${source.objectId}-${source.title}`} className="wiki-source-panel__source">
              <div className="wiki-source-panel__source-type">{source.type}</div>
              <h3>{source.title || 'Untitled source'}</h3>
              {source.snippet ? <p>{source.snippet}</p> : null}
            </article>
          ))}
        </div>
      </SurfaceCard>
    </aside>
  );
};

export default WikiAiSourcePanel;
```

- [ ] **Step 3: Create TipTap editor**

Create `note-taker-ui/src/components/wiki/WikiPageEditor.jsx`:

```jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { draftWikiPage, getWikiPage, updateWikiPage } from '../../api/wiki';
import WikiAiSourcePanel from './WikiAiSourcePanel';
import WikiPageMetaBar from './WikiPageMetaBar';

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const WikiPageEditor = ({ pageId }) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState('');
  const saveTimer = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write the page. Use the AI/source panel for support.' })
    ],
    content: emptyDoc,
    editorProps: {
      attributes: {
        class: 'tiptap-editor wiki-editor__body'
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      scheduleSave({ body: activeEditor.getJSON() });
    }
  });

  const scheduleSave = (updates) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePage(updates);
    }, 600);
  };

  const savePage = async (updates) => {
    setSaving(true);
    setError('');
    try {
      const saved = await updateWikiPage(pageId, updates);
      setPage(saved);
    } catch (_error) {
      setError('Failed to save Wiki page.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await getWikiPage(pageId);
        if (cancelled) return;
        setPage(loaded);
        editor?.commands?.setContent(loaded.body || emptyDoc);
      } catch (_error) {
        if (!cancelled) setError('Failed to load Wiki page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (editor) load();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [pageId, editor]);

  const handleTitleChange = (event) => {
    const title = event.target.value;
    setPage(current => ({ ...current, title }));
    scheduleSave({ title });
  };

  const handleMetaChange = (updates) => {
    setPage(current => ({ ...current, ...updates }));
    savePage(updates);
  };

  const handleDraft = async () => {
    setDrafting(true);
    setError('');
    try {
      const drafted = await draftWikiPage(pageId);
      setPage(drafted);
      editor?.commands?.setContent(drafted.body || emptyDoc);
    } catch (_error) {
      setError('Failed to draft Wiki page.');
    } finally {
      setDrafting(false);
    }
  };

  const title = useMemo(() => page?.title || '', [page]);

  if (loading) return <main className="wiki-page"><p className="muted">Loading Wiki page...</p></main>;
  if (!page) return <main className="wiki-page"><p className="form-error">{error || 'Wiki page not found.'}</p></main>;

  return (
    <main className="wiki-page wiki-editor">
      <div className="wiki-editor__topline">
        <Button variant="secondary" onClick={() => navigate('/wiki')}>Back to Wiki</Button>
        {error ? <span className="form-error">{error}</span> : null}
      </div>
      <div className="wiki-editor__layout">
        <section className="wiki-editor__main">
          <input
            className="wiki-editor__title"
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled Wiki Page"
            aria-label="Wiki page title"
          />
          <WikiPageMetaBar page={page} onChange={handleMetaChange} saving={saving} />
          <EditorContent editor={editor} />
        </section>
        <WikiAiSourcePanel page={page} drafting={drafting} onDraft={handleDraft} />
      </div>
    </main>
  );
};

export default WikiPageEditor;
```

- [ ] **Step 4: Add editor CSS**

Append to `note-taker-ui/src/styles/think-home-polish.css`:

```css
.wiki-editor__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wiki-editor__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 18px;
  align-items: start;
}

.wiki-editor__main {
  min-width: 0;
  background: #fff;
  border: 1px solid var(--border-subtle, #d9dee8);
  border-radius: 10px;
  padding: 18px;
}

.wiki-editor__title {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border-subtle, #d9dee8);
  font-size: 32px;
  font-weight: 700;
  padding: 8px 0 14px;
  margin-bottom: 14px;
}

.wiki-editor__title:focus {
  outline: none;
  border-bottom-color: var(--accent, #3454d1);
}

.wiki-meta-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: end;
  margin-bottom: 18px;
}

.wiki-meta-bar label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted, #667085);
}

.wiki-meta-bar__save-state {
  margin-left: auto;
  color: var(--text-muted, #667085);
  font-size: 13px;
}

.wiki-editor__body {
  min-height: 420px;
  padding: 10px 0;
}

.wiki-source-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wiki-source-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.wiki-source-panel__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wiki-source-panel__source {
  border: 1px solid var(--border-subtle, #d9dee8);
  border-radius: 8px;
  padding: 10px;
}

.wiki-source-panel__source h3 {
  margin: 4px 0;
  font-size: 15px;
}

.wiki-source-panel__source-type {
  color: var(--text-muted, #667085);
  font-size: 12px;
  text-transform: capitalize;
}

@media (max-width: 980px) {
  .wiki-editor__layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add note-taker-ui/src/components/wiki/WikiPageEditor.jsx note-taker-ui/src/components/wiki/WikiPageMetaBar.jsx note-taker-ui/src/components/wiki/WikiAiSourcePanel.jsx note-taker-ui/src/styles/think-home-polish.css
git commit -m "feat: add wiki rich text editor"
```

## Task 6: Frontend Tests and Verification

**Files:**
- Create: `note-taker-ui/src/components/wiki/WikiPageEditor.test.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiPageEditor.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiPageMetaBar.jsx`
- Modify: `note-taker-ui/src/components/wiki/WikiAiSourcePanel.jsx`

- [ ] **Step 1: Add editor test**

Create `note-taker-ui/src/components/wiki/WikiPageEditor.test.jsx`:

```jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiPageEditor from './WikiPageEditor';
import { draftWikiPage, getWikiPage, updateWikiPage } from '../../api/wiki';

const mockUseEditor = jest.fn();
const mockEditor = {
  commands: {
    setContent: jest.fn()
  },
  getJSON: jest.fn(() => ({ type: 'doc', content: [{ type: 'paragraph' }] }))
};

jest.mock('@tiptap/react', () => ({
  EditorContent: ({ editor }) => <div data-testid="wiki-editor-content">{editor ? 'ready' : 'missing'}</div>,
  useEditor: (...args) => mockUseEditor(...args)
}));

jest.mock('@tiptap/starter-kit', () => ({}));
jest.mock('@tiptap/extension-placeholder', () => ({
  configure: () => ({})
}));

jest.mock('../../api/wiki', () => ({
  draftWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  updateWikiPage: jest.fn()
}));

const page = {
  _id: 'wiki-1',
  title: 'Enterprise AI Memory',
  pageType: 'topic',
  status: 'draft',
  visibility: 'private',
  sourceScope: 'entire_library',
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  sourceRefs: [],
  aiState: { draftStatus: 'idle' }
};

describe('WikiPageEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEditor.mockReturnValue(mockEditor);
    getWikiPage.mockResolvedValue(page);
    updateWikiPage.mockResolvedValue(page);
    draftWikiPage.mockResolvedValue({
      ...page,
      aiState: { draftStatus: 'ready' }
    });
  });

  it('renders rich text editor and default metadata controls', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    expect(await screen.findByDisplayValue('Enterprise AI Memory')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-editor-content')).toHaveTextContent('ready');
    expect(screen.getByLabelText('Wiki page metadata')).toBeInTheDocument();
    expect(screen.getByDisplayValue('private')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Entire library')).toBeInTheDocument();
  });

  it('saves metadata changes', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.change(screen.getByDisplayValue('private'), { target: { value: 'shared' } });

    await waitFor(() => {
      expect(updateWikiPage).toHaveBeenCalledWith('wiki-1', { visibility: 'shared' });
    });
  });

  it('refreshes AI draft without blocking editor', async () => {
    render(
      <MemoryRouter>
        <WikiPageEditor pageId="wiki-1" />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('Enterprise AI Memory');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh draft' }));

    await waitFor(() => {
      expect(draftWikiPage).toHaveBeenCalledWith('wiki-1');
    });
  });
});
```

- [ ] **Step 2: Run component test**

Run:

```bash
cd note-taker-ui && npm test -- --watchAll=false --runInBand src/components/wiki/WikiPageEditor.test.jsx
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
cd note-taker-ui && npm run build
```

Expected: build completes without route, import, or lint errors.

- [ ] **Step 4: Commit**

```bash
git add note-taker-ui/src/components/wiki/WikiPageEditor.test.jsx note-taker-ui/src/components/wiki note-taker-ui/src/pages/Wiki.jsx note-taker-ui/src/api/wiki.js note-taker-ui/src/App.js note-taker-ui/src/styles/think-home-polish.css
git commit -m "test: cover wiki editor flow"
```

## Task 7: Manual QA

**Files:**
- Modify only if verification exposes defects in files from earlier tasks.

- [ ] **Step 1: Start backend and frontend**

Run backend:

```bash
npm start
```

Run frontend in another terminal:

```bash
cd note-taker-ui && npm start
```

Expected:

```text
Backend listens on its configured port and React opens on localhost.
```

- [ ] **Step 2: Verify route**

Open:

```text
http://localhost:3000/wiki
```

Expected:

```text
The authenticated app shows Wiki in navigation, the Wiki index loads, and New page is visible.
```

- [ ] **Step 3: Verify create/edit**

Create a page with seed text:

```text
Enterprise AI memory privacy
```

Expected:

```text
The app navigates to /wiki/:id, the page starts private/draft/entire library, the rich text editor renders, and the AI/source panel shows draft state.
```

- [ ] **Step 4: Verify metadata and body saving**

Change:

```text
Visibility: shared
Source scope: selected sources
Page type: project
Body: add a paragraph
```

Refresh the browser.

Expected:

```text
The changed metadata and body persist after refresh.
```

- [ ] **Step 5: Verify responsive layout**

Use browser dev tools or Playwright viewport checks for:

```text
Desktop width 1440
Tablet width 900
Mobile width 390
```

Expected:

```text
Editor and source panel do not overlap; metadata controls wrap; title and buttons remain readable.
```

- [ ] **Step 6: Final commit for QA fixes**

If fixes were needed:

```bash
git add <changed-files>
git commit -m "fix: polish wiki create edit flow"
```

If no fixes were needed, do not create an empty commit.

## Self-Review Checklist

- Spec coverage: top-level route, immediate draft creation, rich text editing, visibility controls, source scope default, page type inference metadata, source panel, and recoverable AI drafting are covered.
- Scope boundary: full enterprise permissions, real-time collaboration, public links, backlinks, and advanced citations remain out of scope.
- Naming consistency: backend and frontend use `WikiPage`, `pageType`, `status`, `visibility`, `sourceScope`, `createdFrom`, `sourceRefs`, and `aiState`.
- Test coverage: route smoke test covers backend defaults and persistence; component test covers editor, metadata, and AI draft action; build and manual QA cover integration.
