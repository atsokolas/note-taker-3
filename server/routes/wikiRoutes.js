const express = require('express');
const mongoose = require('mongoose');
const { maintainWikiPage: defaultMaintainWikiPage } = require('../services/wikiMaintenanceService');
const { askWikiPage: defaultAskWikiPage } = require('../services/wikiAskService');
const { buildWikiBriefing: defaultBuildWikiBriefing } = require('../services/wikiBriefingService');
const { findWikiBacklinks: defaultFindWikiBacklinks } = require('../services/wikiBacklinkService');

const PAGE_TYPES = new Set(['topic', 'question', 'project', 'source', 'person', 'synthesis']);
const STATUSES = new Set(['draft', 'published', 'archived']);
const VISIBILITIES = new Set(['private', 'shared']);
const SOURCE_SCOPES = new Set(['entire_library', 'current_item', 'selected_sources']);
const CREATED_FROM_TYPES = new Set([
  'wiki_index',
  'idea',
  'question',
  'highlight',
  'article',
  'notebook',
  'concept',
  'sources',
  'paste',
  'search',
  'thought_partner'
]);
const SOURCE_REF_TYPES = new Set(['article', 'highlight', 'notebook', 'concept', 'question', 'memory', 'external']);
const SOURCE_REF_ADDED_BY = new Set(['user', 'ai']);

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

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractPlainText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) return node.map(extractPlainText).filter(Boolean).join(' ').trim();
  if (typeof node !== 'object') return '';
  const ownText = typeof node.text === 'string' ? node.text : '';
  const childText = Array.isArray(node.content) ? extractPlainText(node.content) : '';
  return [ownText, childText].filter(Boolean).join(' ').trim();
};

const normalizeTitle = (value = '') => (
  String(value || 'Untitled Wiki Page').trim().slice(0, 180) || 'Untitled Wiki Page'
);

const normalizeObjectId = (value) => {
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const normalizeCreatedFrom = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { type: 'wiki_index' };
  const type = CREATED_FROM_TYPES.has(String(value.type || '')) ? String(value.type) : 'wiki_index';
  return {
    type,
    objectId: normalizeObjectId(value.objectId),
    objectIds: Array.isArray(value.objectIds)
      ? value.objectIds.map(normalizeObjectId).filter(Boolean).slice(0, 50)
      : [],
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

const serializeWikiPage = (page) => {
  if (!page) return page;
  const raw = typeof page.toObject === 'function'
    ? page.toObject({ virtuals: false })
    : { ...page };
  return {
    ...raw,
    body: raw.body || emptyDoc(),
    createdFrom: raw.createdFrom || { type: 'wiki_index', objectIds: [], text: '', label: '' },
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [],
    discussions: Array.isArray(raw.discussions) ? raw.discussions : [],
    aiState: {
      draftStatus: raw.aiState?.draftStatus || 'idle',
      draftRequestedAt: raw.aiState?.draftRequestedAt || null,
      draftStartedAt: raw.aiState?.draftStartedAt || null,
      draftCompletedAt: raw.aiState?.draftCompletedAt || null,
      lastDraftedAt: raw.aiState?.lastDraftedAt || null,
      lastError: raw.aiState?.lastError || '',
      errorCode: raw.aiState?.errorCode || '',
      model: raw.aiState?.model || '',
      provider: raw.aiState?.provider || '',
      sourceScopeAtDraft: raw.aiState?.sourceScopeAtDraft || raw.sourceScope || 'entire_library',
      sourceRefIdsAtDraft: Array.isArray(raw.aiState?.sourceRefIdsAtDraft) ? raw.aiState.sourceRefIdsAtDraft : [],
      maintenanceSummary: raw.aiState?.maintenanceSummary || '',
      health: raw.aiState?.health || {
        newItems: [],
        unsupportedClaims: [],
        missingCitations: [],
        staleSections: [],
        contradictions: [],
        relatedPages: []
      },
      changeLog: Array.isArray(raw.aiState?.changeLog) ? raw.aiState.changeLog : [],
      suggestions: Array.isArray(raw.aiState?.suggestions) ? raw.aiState.suggestions : []
    }
  };
};

const buildWikiDraftSuggestions = ({ page }) => {
  const sourceIds = Array.isArray(page.sourceRefs)
    ? page.sourceRefs.map(source => source._id).filter(Boolean)
    : [];
  const stamp = Date.now();
  const seedText = String(page.createdFrom?.text || '').trim();
  return [
    {
      id: `outline-${stamp}`,
      type: 'outline',
      title: 'Suggested outline',
      text: `Turn "${page.title}" into a short page with context, source-backed claims, and open questions.`,
      sourceRefIds: sourceIds
    },
    {
      id: `edit-${stamp}`,
      type: 'edit',
      title: 'Next edit',
      text: seedText || 'Add a concise working thesis, then attach the sources that support or challenge it.',
      sourceRefIds: sourceIds
    },
    {
      id: `gap-${stamp}`,
      type: 'gap',
      title: 'Evidence gap',
      text: sourceIds.length > 0
        ? 'Review each attached source and cite the strongest claim before publishing.'
        : 'Attach at least one source so the page has a traceable evidence trail.',
      sourceRefIds: []
    }
  ];
};

const buildWikiDraftState = ({ page, now = new Date(), model = 'local-stub', error = null }) => {
  if (error) {
    return {
      ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
      draftStatus: 'error',
      lastError: String(error.message || error || 'Draft failed.'),
      errorCode: String(error.code || 'DRAFT_FAILED'),
      model,
      sourceScopeAtDraft: page.sourceScope
    };
  }

  return {
    draftStatus: 'ready',
    draftRequestedAt: page.aiState?.draftRequestedAt || now,
    draftStartedAt: page.aiState?.draftStartedAt || now,
    draftCompletedAt: now,
    lastDraftedAt: now,
    lastError: '',
    errorCode: '',
    model,
    sourceScopeAtDraft: page.sourceScope,
    sourceRefIdsAtDraft: Array.isArray(page.sourceRefs)
      ? page.sourceRefs.map(source => source._id).filter(Boolean)
      : [],
    suggestions: buildWikiDraftSuggestions({ page })
  };
};

const validateEnumField = (field, value, allowedValues) => {
  if (value === undefined) return null;
  const normalized = String(value || '').trim();
  if (!allowedValues.has(normalized)) {
    return { error: `${field} must be one of: ${Array.from(allowedValues).join(', ')}.` };
  }
  return { value: normalized };
};

const normalizeSourceRef = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'sourceRef payload must be an object.' };
  }

  const type = String(value.type || '').trim();
  if (!SOURCE_REF_TYPES.has(type)) {
    return { error: `type must be one of: ${Array.from(SOURCE_REF_TYPES).join(', ')}.` };
  }

  const addedBy = String(value.addedBy || 'user').trim();
  if (!SOURCE_REF_ADDED_BY.has(addedBy)) {
    return { error: "addedBy must be one of: user, ai." };
  }

  const objectId = normalizeObjectId(value.objectId);
  if (value.objectId && !objectId) {
    return { error: 'objectId must be a valid id.' };
  }

  const sourceRef = {
    type,
    objectId,
    title: String(value.title || '').trim().slice(0, 240),
    snippet: String(value.snippet || '').trim().slice(0, 1000),
    url: String(value.url || '').trim().slice(0, 1000),
    citationLabel: String(value.citationLabel || '').trim().slice(0, 120),
    addedBy
  };

  if (!sourceRef.objectId && !sourceRef.title && !sourceRef.snippet && !sourceRef.url) {
    return { error: 'sourceRef must include objectId, title, snippet, or url.' };
  }

  return { value: sourceRef };
};

const buildWikiRouter = ({
  authenticateToken,
  WikiPage,
  Article = null,
  NotebookEntry = null,
  TagMeta = null,
  Question = null,
  maintainWikiPage = defaultMaintainWikiPage,
  askWikiPage = defaultAskWikiPage,
  buildWikiBriefing = defaultBuildWikiBriefing,
  findWikiBacklinks = defaultFindWikiBacklinks
}) => {
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

  const findOwnedPage = (req) => WikiPage.findOne({ _id: req.params.id, userId: req.user.id });

  router.param('id', (req, res, next, id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
      return res.status(400).json({ error: 'Invalid wiki page id.' });
    }
    return next();
  });

  router.param('sourceRefId', (req, res, next, sourceRefId) => {
    if (!mongoose.Types.ObjectId.isValid(String(sourceRefId || ''))) {
      return res.status(400).json({ error: 'Invalid wiki source id.' });
    }
    return next();
  });

  router.get('/api/wiki/pages', authenticateToken, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const status = validateEnumField('status', req.query.status, STATUSES);
      const visibility = validateEnumField('visibility', req.query.visibility, VISIBILITIES);
      const pageType = validateEnumField('pageType', req.query.pageType, PAGE_TYPES);
      const invalidEnum = [status, visibility, pageType].find(result => result?.error);
      if (invalidEnum) return res.status(400).json({ error: invalidEnum.error });
      if (status?.value) query.status = status.value;
      else query.status = { $ne: 'archived' };
      if (visibility?.value) query.visibility = visibility.value;
      if (pageType?.value) query.pageType = pageType.value;

      const q = String(req.query.q || '').trim();
      if (q) {
        const regex = new RegExp(escapeRegExp(q), 'i');
        query.$or = [{ title: regex }, { plainText: regex }];
      }

      const pages = await WikiPage.find(query).sort({ updatedAt: -1 }).limit(100).lean();
      res.status(200).json(pages.map(serializeWikiPage));
    } catch (error) {
      console.error('Error listing wiki pages:', error);
      res.status(500).json({ error: 'Failed to list wiki pages.' });
    }
  });

  router.post('/api/wiki/pages', authenticateToken, async (req, res) => {
    try {
      const pageType = validateEnumField('pageType', req.body?.pageType, PAGE_TYPES);
      const sourceScope = validateEnumField('sourceScope', req.body?.sourceScope, SOURCE_SCOPES);
      if (pageType?.error) return res.status(400).json({ error: pageType.error });
      if (sourceScope?.error) return res.status(400).json({ error: sourceScope.error });
      const initialSourceRef = req.body?.initialSourceRef
        ? normalizeSourceRef(req.body.initialSourceRef)
        : null;
      if (initialSourceRef?.error) return res.status(400).json({ error: initialSourceRef.error });

      const createdFrom = normalizeCreatedFrom(req.body?.createdFrom);
      const title = normalizeTitle(req.body?.title || createdFrom.label);
      const body = req.body?.body && typeof req.body.body === 'object' && !Array.isArray(req.body.body)
        ? req.body.body
        : emptyDoc();
      const page = new WikiPage({
        userId: req.user.id,
        title,
        slug: await buildUniqueSlug(req.user.id, title),
        pageType: pageType?.value || 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: sourceScope?.value || 'entire_library',
        createdFrom,
        body,
        plainText: extractPlainText(body),
        sourceRefs: initialSourceRef?.value ? [initialSourceRef.value] : []
      });
      await page.save();
      res.status(201).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error creating wiki page:', error);
      res.status(500).json({ error: 'Failed to create wiki page.' });
    }
  });

  router.get('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req).lean();
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });
      res.status(200).json(serializeWikiPage(page));
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.patch('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    try {
      const enumChecks = [
        validateEnumField('pageType', req.body?.pageType, PAGE_TYPES),
        validateEnumField('status', req.body?.status, STATUSES),
        validateEnumField('visibility', req.body?.visibility, VISIBILITIES),
        validateEnumField('sourceScope', req.body?.sourceScope, SOURCE_SCOPES)
      ];
      const invalidEnum = enumChecks.find(result => result?.error);
      if (invalidEnum) return res.status(400).json({ error: invalidEnum.error });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      if (req.body?.title !== undefined) {
        page.title = normalizeTitle(req.body.title);
        page.slug = await buildUniqueSlug(req.user.id, page.title, page._id);
      }
      if (enumChecks[0]?.value) page.pageType = enumChecks[0].value;
      if (enumChecks[1]?.value) page.status = enumChecks[1].value;
      if (enumChecks[2]?.value) page.visibility = enumChecks[2].value;
      if (enumChecks[3]?.value) page.sourceScope = enumChecks[3].value;
      if (req.body?.body !== undefined) {
        if (!req.body.body || typeof req.body.body !== 'object' || Array.isArray(req.body.body)) {
          return res.status(400).json({ error: 'body must be a TipTap JSON object.' });
        }
        page.body = req.body.body;
        page.plainText = extractPlainText(req.body.body);
      }

      await page.save();
      res.status(200).json(serializeWikiPage(page));
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
      res.status(200).json(serializeWikiPage(page));
    } catch (_error) {
      res.status(400).json({ error: 'Invalid wiki page id.' });
    }
  });

  router.post('/api/wiki/pages/:id/ai/draft', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      page.aiState = {
        ...(page.aiState?.toObject ? page.aiState.toObject() : page.aiState || {}),
        draftStatus: 'maintaining',
        draftRequestedAt: new Date(),
        draftStartedAt: new Date(),
        lastError: '',
        errorCode: ''
      };

      await maintainWikiPage({
        page,
        userId: req.user.id,
        models: {
          Article,
          NotebookEntry,
          TagMeta,
          Question
        }
      });

      await page.save();
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error maintaining wiki page:', error);
      res.status(500).json({ error: 'Failed to maintain wiki page.' });
    }
  });

  router.post('/api/wiki/pages/:id/sources', authenticateToken, async (req, res) => {
    try {
      const sourceRef = normalizeSourceRef(req.body);
      if (sourceRef.error) return res.status(400).json({ error: sourceRef.error });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      page.sourceRefs.push(sourceRef.value);
      await page.save();
      res.status(201).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error adding wiki source:', error);
      res.status(500).json({ error: 'Failed to add wiki source.' });
    }
  });

  router.delete('/api/wiki/pages/:id/sources/:sourceRefId', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      const source = page.sourceRefs.id(req.params.sourceRefId);
      if (!source) return res.status(404).json({ error: 'Wiki source not found.' });

      source.deleteOne();
      await page.save();
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error removing wiki source:', error);
      res.status(500).json({ error: 'Failed to remove wiki source.' });
    }
  });

  // Ask the agent a question about this page. The answer is appended to
  // the page's discussions array and the updated page is returned so the
  // editor can re-render the discussions section.
  router.post('/api/wiki/pages/:id/ask', authenticateToken, async (req, res) => {
    try {
      const question = String(req.body?.question || '').trim();
      if (!question) return res.status(400).json({ error: 'Question is required.' });
      if (question.length > 1000) return res.status(400).json({ error: 'Question is too long.' });

      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      const result = await askWikiPage({ page, question });

      page.discussions.push({
        question,
        answer: result.answer,
        citationIndexesUsed: result.citationIndexesUsed || [],
        model: result.model || '',
        status: result.status || 'answered',
        errorMessage: result.errorMessage || '',
        askedAt: new Date()
      });
      await page.save();

      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error asking wiki page:', error);
      res.status(500).json({ error: 'Failed to ask wiki page.' });
    }
  });

  router.delete('/api/wiki/pages/:id/discussions/:discussionId', authenticateToken, async (req, res) => {
    try {
      const page = await findOwnedPage(req);
      if (!page) return res.status(404).json({ error: 'Wiki page not found.' });

      const discussion = page.discussions.id(req.params.discussionId);
      if (!discussion) return res.status(404).json({ error: 'Discussion not found.' });

      discussion.deleteOne();
      await page.save();
      res.status(200).json(serializeWikiPage(page));
    } catch (error) {
      console.error('Error removing wiki discussion:', error);
      res.status(500).json({ error: 'Failed to remove discussion.' });
    }
  });

  // Daily wiki briefing for the index page. The route is intentionally
  // computed on demand rather than scheduled — the user's signal volume
  // doesn't justify a cron and on-demand keeps the data fresh.
  router.get('/api/wiki/briefing', authenticateToken, async (req, res) => {
    try {
      const briefing = await buildWikiBriefing({
        userId: req.user.id,
        models: { WikiPage, Article, NotebookEntry, TagMeta, Question }
      });
      res.status(200).json(briefing);
    } catch (error) {
      console.error('Error building wiki briefing:', error);
      res.status(500).json({ error: 'Failed to build wiki briefing.' });
    }
  });

  // Backlinks for a single page — "Mentioned in N other pages." Computed
  // on demand by scanning the user's other pages' plainText for substring
  // matches against this page's title.
  router.get('/api/wiki/pages/:id/backlinks', authenticateToken, async (req, res) => {
    try {
      const targetPage = await findOwnedPage(req).lean();
      if (!targetPage) return res.status(404).json({ error: 'Wiki page not found.' });
      const result = await findWikiBacklinks({
        targetPage,
        userId: req.user.id,
        models: { WikiPage }
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Error finding wiki backlinks:', error);
      res.status(500).json({ error: 'Failed to compute wiki backlinks.' });
    }
  });

  return router;
};

module.exports = {
  buildWikiRouter,
  buildWikiDraftState,
  extractPlainText,
  normalizeCreatedFrom,
  normalizeSourceRef,
  serializeWikiPage,
  slugify
};
