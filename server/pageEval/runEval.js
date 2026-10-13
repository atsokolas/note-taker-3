/* Builds real pages the way the app builds them, then scores them.

   Each case goes through the app's own routes on a throwaway database: a
   company dossier from a ticker, a first wiki page from three links a
   stranger might bring, and (for comparison) a page already published. The
   page is whatever the build produced, kept or refused, so a refusal is
   scored as what it is: a page the reader never got.

   Needs the network (SEC, the links, the model). Never the app's database. */

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { CASES } = require('./cases');
const { scorePage, claimsOf } = require('./score');
const { judgeClaims, summarizeVerdicts } = require('./judge');
const { fetchFilingDocument, fetchCompanySubmissions, resolveCompanyIdentifier } = require('../services/edgarWatcherService');
const { fetchReadableArticle } = require('../services/readableArticle');

const openDatabase = async () => {
  const explicit = String(process.env.PAGE_EVAL_MONGODB_URI || '').trim();
  if (explicit) {
    await mongoose.connect(explicit, { dbName: `noeis_page_eval_${crypto.randomBytes(4).toString('hex')}` });
    return async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); };
  }
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  return async () => { await mongoose.disconnect(); await server.stop(); };
};

const startApp = async (userId) => {
  const models = require('../models');
  const { buildWikiRouter } = require('../routes/wikiRoutes');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: String(userId) }; next(); },
    ...['WikiPage', 'WikiProposal', 'WikiRevision', 'WikiSourceEvent', 'WikiMaintenanceRun', 'WikiSchemaSettings',
      'Article', 'NotebookEntry', 'TagMeta', 'Question'].reduce((acc, name) => ({ ...acc, [name]: models[name] }), {})
  }));
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    try {
      return { status: response.status, body: JSON.parse(text) };
    } catch (_error) {
      /* A build stream: the last event that names a code is how it ended,
         and an error event says why. */
      const events = [...text.matchAll(/^data: (.*)$/gm)]
        .map((match) => { try { return JSON.parse(match[1]); } catch (_e) { return null; } })
        .filter(Boolean);
      const last = [...events].reverse().find(event => event.code) || {};
      const failed = [...events].reverse().find(event => event.error || event.message) || {};
      return {
        status: response.status,
        body: {
          code: last.code || '',
          error: failed.error || failed.message || '',
          quality: [...events].reverse().find(event => event.quality)?.quality || null
        }
      };
    }
  };
  return { call, close: () => new Promise(resolve => server.close(resolve)), models };
};

/* What the build produced, whether or not it was kept: the newest revision's
   page if there is one, else the page itself. */
const builtPage = async ({ models, pageId }) => {
  const revision = await models.WikiRevision.findOne({ pageId, reason: { $ne: 'created' }, after: { $ne: null } }).sort({ createdAt: -1 }).lean();
  const page = await models.WikiPage.findById(pageId).lean();
  /* Only what the writer produced counts; the page as first created is a
     placeholder, and scoring it would score nothing. */
  if (!revision) return null;
  const after = revision.after;
  return {
    title: after.title || page?.title,
    body: after.body,
    sourceRefs: after.sourceRefs || [],
    kept: revision.promotionStatus === 'promoted',
    quality: revision.quality || after.aiState?.quality || null,
    model: [after.aiState?.provider, after.aiState?.model].filter(Boolean).join(' ')
  };
};

/* Why a build ended the way it did, in the app's own words. */
const outcome = ({ status, body = {} }) => ({
  status,
  code: body.code || '',
  error: body.error || '',
  failures: body.quality?.failures || [],
  hints: body.quality?.hints || []
});

const SEC_HOST = /(^|\.)sec\.gov$/i;
const readSource = async (ref) => {
  const url = String(ref?.url || '');
  if (!/^https?:/.test(url)) return '';
  try {
    if (SEC_HOST.test(new URL(url).hostname)) return await fetchFilingDocument({ url });
    const read = await fetchReadableArticle({ url });
    return read.ok ? read.content : '';
  } catch (_error) {
    return '';
  }
};

/* The newest 10-K or 10-Q the company has filed, and the newest one the page cites. */
const filingDates = async ({ ticker, sourceRefs }) => {
  const company = await resolveCompanyIdentifier({ ticker });
  const recent = (await fetchCompanySubmissions({ cik: company.cik }))?.filings?.recent || {};
  const latestAvailable = (recent.form || [])
    .map((form, index) => ({ form, filed: recent.filingDate[index], accession: String(recent.accessionNumber[index] || '').replace(/-/g, '') }))
    .filter(row => /^10-[KQ]$/.test(row.form));
  const cited = latestAvailable.filter(row => sourceRefs.some(ref => String(ref.url || '').includes(row.accession)));
  return { latestAvailable: latestAvailable[0]?.filed || null, latestCited: cited[0]?.filed || null };
};

const buildCase = async ({ evalCase, call, models, userId }) => {
  if (evalCase.kind === 'published') {
    const response = await fetch(evalCase.url);
    const { page } = await response.json();
    return { page: page && { ...page, kept: true }, outcome: { status: response.status } };
  }
  if (evalCase.kind === 'links') {
    for (const url of evalCase.urls) {
      const read = await fetchReadableArticle({ url });
      if (read.ok) await models.Article.create({ userId, url: read.url || url, title: read.title || url, content: read.content });
    }
    const created = await call('/api/wiki/pages', { title: evalCase.title, pageType: 'topic' });
    const pageId = created.body?._id;
    if (!pageId) return { page: null, outcome: outcome(created) };
    const built = await call(`/api/wiki/pages/${pageId}/ai/draft`, {});
    return { page: await builtPage({ models, pageId }), outcome: outcome(built) };
  }
  const created = await call('/api/wiki/pages/from-company', {
    ticker: evalCase.ticker,
    startingJudgment: evalCase.judgment,
    requiredReturn: evalCase.requiredReturn,
    horizonYears: evalCase.horizonYears
  });
  const pageId = created.body?._id || created.body?.page?._id;
  if (!pageId) return { page: null, outcome: outcome(created) };
  /* What the dossier gathered before a word was written. */
  const gathered = created.body?.watchResult || {};
  /* Dossiers build through the stream, as the app does. */
  const built = await call(`/api/wiki/pages/${pageId}/ai/draft/stream`, {});
  return {
    page: await builtPage({ models, pageId }),
    outcome: {
      ...outcome(built),
      sourcesAttached: gathered.totalSourcesAttached ?? null,
      filingsAttached: gathered.filingsAttached ?? null,
      gatherStops: (gathered.acquisitionStops || []).map(stop => stop.code || stop),
      gatherError: gathered.watchError || ''
    }
  };
};

const runPageEval = async ({ only = [], judge = true, onCase = () => {} } = {}) => {
  const close = await openDatabase();
  const userId = new mongoose.Types.ObjectId();
  const app = await startApp(userId);
  const results = [];
  try {
    const cases = only.length ? CASES.filter(item => only.includes(item.id)) : CASES;
    for (const evalCase of cases) {
      const startedAt = Date.now();
      let result;
      try {
        const { page, outcome: built } = await buildCase({ evalCase, call: app.call, models: app.models, userId });
        if (!page?.body) {
          result = { id: evalCase.id, built, error: 'The writer produced no page.' };
        } else {
          const sources = await Promise.all((page.sourceRefs || []).map(readSource));
          const dates = evalCase.ticker ? await filingDates({ ticker: evalCase.ticker, sourceRefs: page.sourceRefs || [] }).catch(() => ({})) : {};
          const score = scorePage({ page, sources, dates });
          const verdicts = judge ? await judgeClaims({ claims: claimsOf(page.body), sources }) : [];
          result = {
            id: evalCase.id,
            built,
            model: page.model || '',
            kept: page.kept,
            refusedFor: page.kept ? [] : (built.failures.length ? built.failures : page.quality?.failures || []).slice(0, 8),
            score,
            support: judge ? summarizeVerdicts(verdicts) : null,
            unsupported: verdicts.filter(item => item.verdict === 'unsupported').slice(0, 10),
            sourcesRead: sources.filter(Boolean).length
          };
        }
      } catch (error) {
        result = { id: evalCase.id, error: error.message };
      }
      result.seconds = Math.round((Date.now() - startedAt) / 1000);
      results.push(result);
      onCase(result);
    }
    return results;
  } finally {
    await app.close();
    await close();
  }
};

module.exports = { runPageEval, __testables: { builtPage, filingDates } };
