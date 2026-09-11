const crypto = require('crypto');
const mongoose = require('mongoose');
const { exactClaimText } = require('./wikiClaimBodyPatchService');

const MAX_MUTATIONS = 20;

class AuthoredExplorationError extends Error {
  constructor(message, status = 400, code = 'invalid_exploration', details = {}) {
    super(message);
    this.name = 'AuthoredExplorationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
const boundedRaw = (value, limit) => String(value ?? '').slice(0, limit);
const plain = (value) => value?.toObject ? value.toObject({ virtuals: false }) : value;
const id = (value) => String(value?._id || value?.id || value || '').trim();
const resolveQuery = async (query, { lean = false } = {}) => {
  const next = lean && query?.lean ? query.lean() : query;
  return next?.then ? next : Promise.resolve(next);
};

const boundedPair = (value, textLimit = 20000) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return { against: boundedRaw(value.against, 4000), text: boundedRaw(value.text, textLimit) };
};

const assertDraftBounds = (draft = {}) => {
  const fields = [
    ['title', draft.title, 240],
    ['writing', draft.writing, 20000],
    ['originalText', draft.originalText, 4000],
    ['provisionalText', draft.provisionalText, 20000],
    ['question', draft.question, 2000],
    ['returnNote', draft.returnNote, 2000],
    ['pressure.against', draft.pressure?.against, 4000],
    ['pressure.premise', draft.pressure?.premise, 4000],
    ['pressure.stillHolds', draft.pressure?.stillHolds, 4000],
    ['pressure.unknown', draft.pressure?.unknown, 4000],
    ['meet.against', draft.meet?.against, 4000],
    ['meet.relation', draft.meet?.relation, 4000],
    ['meet.limit', draft.meet?.limit, 4000],
    ['meet.between', draft.meet?.between, 20000],
    ['essay.against', draft.essay?.against, 4000],
    ['essay.text', draft.essay?.text, 20000],
    ['proposal.against', draft.proposal?.against, 4000],
    ['proposal.text', draft.proposal?.text, 20000]
  ];
  const oversized = fields.find(([, value, limit]) => String(value ?? '').length > limit);
  if (oversized) {
    throw new AuthoredExplorationError(`${oversized[0]} exceeds ${oversized[2]} characters.`, 413, 'draft_too_large');
  }
};

// Preserve existing sentence-tool state without granting it source or Wiki
// authority. Limit JSON size/depth as well as the familiar authored fields.
const EXPERIMENT_FIELDS = ['distinction', 'distinctionAt', 'distinctionAgainst', 'instrument', 'exhibit', 'rehearsal', 'unwritten', 'carry', 'contributions', 'rearranged', 'without', 'withoutSource'];
const boundedExperiment = (value, depth = 0) => {
  if (depth > 8) throw new AuthoredExplorationError('The experiment is too deeply nested.', 413);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 20000) return value;
  if (Array.isArray(value) && value.length <= 40) return value.map(item => boundedExperiment(item, depth + 1));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length <= 30 && entries.every(([key]) => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key))) {
      return Object.fromEntries(entries.map(([key, item]) => [key, boundedExperiment(item, depth + 1)]));
    }
  }
  throw new AuthoredExplorationError('The experiment contains unsupported or oversized content.', 413);
};

const normalizeDraft = (value = {}) => {
  const draft = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  assertDraftBounds(draft);
  if (JSON.stringify(draft).length > 120000) throw new AuthoredExplorationError('This draft is too large.', 413, 'draft_too_large');
  const next = {
    title: clean(draft.title, 240),
    writing: boundedRaw(draft.writing, 20000),
    originalText: clean(draft.originalText, 4000),
    provisionalText: boundedRaw(draft.provisionalText, 20000),
    question: boundedRaw(draft.question, 2000),
    returnNote: boundedRaw(draft.returnNote, 2000),
    mark: draft.mark === '!' ? '!' : '',
    placed: Boolean(draft.placed)
  };
  if (draft.pressure && typeof draft.pressure === 'object') {
    next.pressure = {
      against: boundedRaw(draft.pressure.against, 4000),
      premise: boundedRaw(draft.pressure.premise, 4000),
      stillHolds: boundedRaw(draft.pressure.stillHolds, 4000),
      unknown: boundedRaw(draft.pressure.unknown, 4000)
    };
  }
  if (draft.meet && typeof draft.meet === 'object') {
    next.meet = {
      against: boundedRaw(draft.meet.against, 4000),
      relation: boundedRaw(draft.meet.relation, 4000),
      limit: boundedRaw(draft.meet.limit, 4000),
      between: boundedRaw(draft.meet.between, 20000)
    };
  }
  const essay = boundedPair(draft.essay);
  const proposal = boundedPair(draft.proposal);
  if (essay) next.essay = essay;
  if (proposal) next.proposal = proposal;
  for (const key of EXPERIMENT_FIELDS) if (draft[key] !== undefined && draft[key] !== null) next[key] = boundedExperiment(draft[key]);
  return next;
};

const claimFromPage = (page, claimId) => (
  (Array.isArray(page?.claims) ? page.claims : [])
    .find((claim) => String(claim?.claimId || '') === String(claimId || '')) || null
);

const resolveOwnedPageClaim = async ({ WikiPage, userId, pageId, claimId, requireClaim = true }) => {
  let query = WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } });
  if (query?.select) query = query.select('_id userId title slug body claims citations sourceRefs status');
  const page = await resolveQuery(query, { lean: true });
  if (!page) throw new AuthoredExplorationError('Wiki page not found.', 404, 'page_not_found');
  const claim = claimFromPage(page, claimId);
  if (requireClaim && !claim) {
    throw new AuthoredExplorationError('The held sentence is no longer on this page.', 409, 'stale_origin');
  }
  return { page, claim };
};

// Origin identity is explicit; a Library highlight never becomes a Wiki claim.
const explorationKey = ({ userId, pageId, claimId, articleId, highlightId }) => articleId
  ? { userId, articleId, highlightId }
  : { userId, pageId, claimId: String(claimId) };

const resolveOrigin = async ({ Article, WikiPage, userId, pageId, claimId, articleId, highlightId, requireClaim = true }) => {
  if (!articleId) return resolveOwnedPageClaim({ WikiPage, userId, pageId, claimId, requireClaim });
  const article = await resolveQuery(Article.findOne({ _id: articleId, userId }).select('_id title content highlights'), { lean: true });
  if (!article) throw new AuthoredExplorationError('Library article not found.', 404, 'source_not_found');
  const highlight = highlightFromArticle(article, highlightId);
  if (requireClaim && !highlight) throw new AuthoredExplorationError('The saved passage is no longer in this article.', 409, 'stale_origin');
  return { article, highlight };
};

const originText = ({ page, claim, article, highlight, claimId }) => {
  if (!article) return liveClaimText({ page, claim, claimId });
  const text = String(highlight?.text || '').trim();
  if (!text) throw new AuthoredExplorationError('The saved passage is no longer in this article.', 409, 'stale_origin');
  if (text.length > 4000) throw new AuthoredExplorationError('Choose a passage of 4000 characters or fewer.', 413, 'source_too_large');
  return text;
};

const libraryOriginHref = (articleId, highlightId) =>
  `/library?articleId=${encodeURIComponent(articleId)}&highlightId=${encodeURIComponent(highlightId)}&exploration=1`;

const originSnapshot = (context, claimId) => ({
  pageTitle: clean(context.article?.title || context.page?.title, 500),
  claimText: originText({ ...context, claimId }),
  href: context.article ? libraryOriginHref(id(context.article), id(context.highlight)) : originHref(id(context.page), claimId)
});

const primarySourceForOrigin = async ({ context, Article, userId }) => context.article
  ? resolveOwnedSelectedSource({ Article, userId, selectedSource: {
    articleId: id(context.article), highlightId: id(context.highlight), passage: String(context.highlight?.text || '')
  } })
  : resolvePrimarySource({ Article, userId, page: context.page, claim: context.claim, includeIdentity: true });

const liveClaimText = ({ page, claim, claimId }) => {
  if (!claim) throw new AuthoredExplorationError('The held sentence is no longer on this page.', 409, 'stale_origin');
  let markedText;
  try {
    markedText = exactClaimText({ body: page?.body, claimId });
  } catch (_error) {
    throw new AuthoredExplorationError('The held sentence is no longer anchored once in the page.', 409, 'stale_origin');
  }
  const ledgerText = clean(claim.text, 4000);
  if (!markedText || markedText !== ledgerText) {
    throw new AuthoredExplorationError('The held sentence changed in the page.', 409, 'stale_origin', { currentClaimText: clean(markedText, 4000) });
  }
  return ledgerText;
};

const highlightFromArticle = (article, highlightId) => (
  (Array.isArray(article?.highlights) ? article.highlights : [])
    .find((highlight) => id(highlight) === String(highlightId || '')) || null
);

const aroundPassage = (content, passage, at) => ({
  aroundBefore: String(content || '').slice(Math.max(0, at - 500), at).trim().slice(-2000),
  aroundAfter: String(content || '').slice(at + passage.length, at + passage.length + 500).trim().slice(0, 2000)
});

const readableArticleText = (value) => String(value || '')
  .replace(/<\/(p|div|li|br)>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\(\s*attr\(href\)\s*\)/gi, '')
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/\|\s*Reading Time:\s*\d+\s*minutes?\.?/gi, '')
  .replace(/\bReading Time:\s*\d+\s*minutes?\.?/gi, '')
  .replace(/\bURL:\s*https?:\/\/\S+/gi, '')
  .replace(/\bName:\s*/gi, '')
  .replace(/\s*\|\s*/g, ' · ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/(?:^|(?:[.]|\s+·)\s*)Thought and Opinion\s*$/i, '')
  .replace(/\s+·\s*$/g, '')
  .trim();

const locateArticleExcerpt = ({ content, passage, anchor = {} }) => {
  const positions = [];
  let at = String(content || '').indexOf(passage);
  while (at >= 0) {
    positions.push(at);
    at = String(content || '').indexOf(passage, at + 1);
  }
  if (!positions.length) return -1;
  const prefix = boundedRaw(anchor.prefix, 500);
  const suffix = boundedRaw(anchor.suffix, 500);
  const anchored = positions.filter((position) => {
    const before = String(content || '').slice(Math.max(0, position - prefix.length), position);
    const after = String(content || '').slice(position + passage.length, position + passage.length + suffix.length);
    return (!prefix || before === prefix) && (!suffix || after === suffix);
  });
  const hasAnchor = Boolean(prefix || suffix);
  const approximate = Number(anchor.startOffsetApprox);
  const candidates = hasAnchor ? anchored : positions;
  if (candidates.length === 1) return candidates[0];
  if (Number.isInteger(approximate) && candidates.filter(position => position === approximate).length === 1) return approximate;
  return candidates.length ? -2 : -1;
};

const resolveOwnedSelectedSource = async ({ Article, userId, selectedSource }) => {
  if (!selectedSource) return undefined;
  if (String(selectedSource.passage ?? '').trim().length > 6000) {
    throw new AuthoredExplorationError('Selected passages cannot exceed 6000 characters.', 413, 'source_too_large');
  }
  const articleId = clean(selectedSource.articleId, 100);
  const submittedPassage = boundedRaw(selectedSource.passage, 6000);
  const highlightId = clean(selectedSource.highlightId, 100);
  if (!articleId || !submittedPassage.trim()) {
    throw new AuthoredExplorationError('A selected source needs an article and exact passage.', 400, 'invalid_source');
  }
  let query = Article.findOne({ _id: articleId, userId });
  if (query?.select) query = query.select('_id title content highlights');
  const article = await resolveQuery(query, { lean: true });
  if (!article) throw new AuthoredExplorationError('Selected source not found.', 404, 'source_not_found');

  let passage = submittedPassage;
  let at = -1;
  let anchor;
  const rawContent = String(article.content || '');
  let sourceContent = rawContent.includes(submittedPassage) ? rawContent : readableArticleText(rawContent);
  if (highlightId) {
    const highlight = highlightFromArticle(article, highlightId);
    if (!highlight) throw new AuthoredExplorationError('Selected passage not found.', 404, 'source_not_found');
    passage = boundedRaw(highlight.text, 6000);
    if (passage !== submittedPassage) {
      throw new AuthoredExplorationError('The selected passage changed.', 409, 'stale_source', { currentPassage: passage });
    }
    if (!sourceContent.includes(passage)) sourceContent = readableArticleText(rawContent);
    at = sourceContent.indexOf(passage);
  } else {
    anchor = {
      prefix: boundedRaw(selectedSource.anchor?.prefix, 500),
      suffix: boundedRaw(selectedSource.anchor?.suffix, 500),
      startOffsetApprox: Number.isFinite(Number(selectedSource.anchor?.startOffsetApprox))
        ? Number(selectedSource.anchor.startOffsetApprox)
        : null
    };
    at = locateArticleExcerpt({ content: sourceContent, passage, anchor });
    if (at === -2) throw new AuthoredExplorationError('The selected passage occurs more than once; choose it again in context.', 409, 'ambiguous_source');
    if (at < 0) throw new AuthoredExplorationError('The selected article passage changed.', 409, 'stale_source');
    anchor = {
      prefix: sourceContent.slice(Math.max(0, at - 160), at),
      suffix: sourceContent.slice(at + passage.length, at + passage.length + 160),
      startOffsetApprox: at
    };
  }
  const around = at >= 0 ? aroundPassage(sourceContent, passage, at) : { aroundBefore: '', aroundAfter: '' };
  const href = highlightId
    ? `/library?articleId=${encodeURIComponent(id(article))}&highlightId=${encodeURIComponent(highlightId)}`
    : `/library?articleId=${encodeURIComponent(id(article))}#passage=${encodeURIComponent(JSON.stringify({
      v: 1,
      articleId: id(article),
      text: passage,
      prefix: anchor.prefix,
      suffix: anchor.suffix,
      startOffsetApprox: anchor.startOffsetApprox
    }))}`;
  return {
    articleId: id(article),
    ...(highlightId ? { highlightId } : {}),
    articleTitle: clean(article.title || 'Untitled article', 500),
    title: clean(article.title || 'Untitled article', 500),
    passage,
    ...around,
    href,
    isLibrary: true,
    here: false,
    available: true,
    ...(anchor ? { anchor } : {})
  };
};

const resolvePrimarySource = async ({ Article, userId, page, claim, includeIdentity = false }) => {
  const refs = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
  const citations = Array.isArray(page?.citations) ? page.citations : [];
  const refIds = (Array.isArray(claim?.sourceRefIds) ? claim.sourceRefIds : []).map(id);
  const claimCitations = citations.filter((citation) => (
    (Array.isArray(claim?.citationIds) ? claim.citationIds : []).some((citationId) => id(citationId) === id(citation))
  ));
  if (!refIds.length) claimCitations.forEach((citation) => { if (id(citation.sourceRefId)) refIds.push(id(citation.sourceRefId)); });
  const ref = refs.find((candidate) => refIds.includes(id(candidate)));
  if (!ref || !['article', 'highlight'].includes(String(ref.type || ''))) return null;
  const citation = citations.find((candidate) => id(candidate.sourceRefId) === id(ref));
  const recordedPassage = readableArticleText(citation?.quote || ref.snippet || '');
  const articleFilter = ref.type === 'article'
    ? { _id: ref.objectId, userId }
    : {
        ...(ref.parentObjectId ? { _id: ref.parentObjectId } : {}),
        userId,
        'highlights._id': ref.objectId
      };
  let query = Article.findOne(articleFilter);
  if (query?.select) query = query.select('_id title content highlights');
  const article = await resolveQuery(query, { lean: true });
  const inferredArticleId = id(ref.type === 'article' ? ref.objectId : ref.parentObjectId);
  const inferredHighlightId = ref.type === 'highlight' ? id(ref.objectId) : '';
  const inferredIdentity = includeIdentity ? {
    ...(inferredArticleId ? { articleId: inferredArticleId } : {}),
    ...(inferredHighlightId ? { highlightId: inferredHighlightId } : {})
  } : {};
  if (!article) return { ...inferredIdentity, title: clean(ref.title || 'This source', 500), passage: recordedPassage, aroundBefore: '', aroundAfter: '', href: '', available: false, stale: true };
  if (ref.type === 'highlight') {
    const highlight = highlightFromArticle(article, ref.objectId);
    const identity = includeIdentity ? { articleId: id(article), highlightId: id(ref.objectId) } : {};
    if (!highlight) return { ...identity, title: clean(article.title || ref.title || 'This source', 500), passage: recordedPassage, aroundBefore: '', aroundAfter: '', href: '', available: false, stale: true };
    const current = readableArticleText(highlight.text || '');
    const passage = recordedPassage || current;
    const content = readableArticleText(article.content || '');
    const at = content.indexOf(current);
    return {
      ...identity,
      title: clean(article.title || ref.title || 'Untitled article', 500),
      articleTitle: clean(article.title || ref.title || 'Untitled article', 500),
      passage,
      ...(at >= 0 ? aroundPassage(content, current, at) : { aroundBefore: '', aroundAfter: '' }),
      href: `/library?articleId=${encodeURIComponent(id(article))}&highlightId=${encodeURIComponent(id(highlight))}`,
      available: Boolean(passage),
      stale: Boolean(recordedPassage && current && recordedPassage !== current)
    };
  }
  const content = readableArticleText(article.content || '');
  const passage = recordedPassage;
  const at = passage ? locateArticleExcerpt({ content, passage, anchor: ref.metadata?.anchor || {} }) : -1;
  if (at < 0) return { title: clean(article.title || ref.title || 'Untitled article', 500), passage, aroundBefore: '', aroundAfter: '', href: '', available: false, stale: true };
  const anchor = {
    prefix: content.slice(Math.max(0, at - 160), at),
    suffix: content.slice(at + passage.length, at + passage.length + 160),
    startOffsetApprox: at
  };
  return {
    ...(includeIdentity ? { articleId: id(article), anchor } : {}),
    title: clean(article.title || ref.title || 'Untitled article', 500),
    articleTitle: clean(article.title || ref.title || 'Untitled article', 500),
    passage,
    ...aroundPassage(content, passage, at),
    href: sourceHref({ articleId: id(article), passage, anchor }),
    available: true,
    stale: false
  };
};

const fingerprint = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const sourceHref = (source = {}) => {
  const articleId = id(source.articleId);
  const highlightId = id(source.highlightId);
  if (!articleId) return '';
  if (highlightId) return `/library?articleId=${encodeURIComponent(articleId)}&highlightId=${encodeURIComponent(highlightId)}`;
  const anchor = source.anchor || {};
  return `/library?articleId=${encodeURIComponent(articleId)}#passage=${encodeURIComponent(JSON.stringify({
    v: 1,
    articleId,
    text: String(source.passage || ''),
    prefix: String(anchor.prefix || ''),
    suffix: String(anchor.suffix || ''),
    startOffsetApprox: Number.isFinite(Number(anchor.startOffsetApprox)) ? Number(anchor.startOffsetApprox) : null
  }))}`;
};

const originHref = (pageId, claimId) => (
  `/wiki/read/${encodeURIComponent(String(pageId || ''))}?claimId=${encodeURIComponent(String(claimId || ''))}&exploration=1`
);

const serializeExploration = (value, extras = {}) => {
  const row = plain(value) || {};
  const draft = { ...(plain(row.draft) || {}) };
  if (draft.selectedSource) draft.selectedSource = {
    ...plain(draft.selectedSource),
    title: String(draft.selectedSource.title || draft.selectedSource.articleTitle || 'Untitled article'),
    href: sourceHref(draft.selectedSource)
  };
  return {
    id: id(row),
    pageId: id(row.pageId),
    claimId: String(row.claimId || ''),
    ...(row.articleId ? { articleId: id(row.articleId), highlightId: id(row.highlightId) } : {}),
    revision: Number(row.revision || 0),
    origin: row.origin || {},
    draft,
    keeps: Array.isArray(row.keeps) ? row.keeps.map((keep) => ({
      destination: keep.destination,
      targetId: id(keep.targetId),
      mutationId: keep.mutationId,
      status: keep.status,
      at: keep.at || null
    })) : [],
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    ...extras
  };
};

const existingMutation = (row, mutationId) => (
  (Array.isArray(row?.mutations) ? row.mutations : []).find((mutation) => mutation.id === mutationId)
);

const replayedMutation = (row, mutation, digest) => {
  if (!mutation) return null;
  if (mutation.fingerprint !== digest) {
    throw new AuthoredExplorationError('mutationId was already used for different content.', 409, 'mutation_reused');
  }
  // The mutation acknowledges only the revision it committed. Returning a
  // later row would silently grant this client CAS authority over work saved
  // by another session after its acknowledgement was lost.
  if (Number(row?.revision) !== Number(mutation.revision)) {
    throw new AuthoredExplorationError(
      'The exploration changed after this save was accepted.',
      409,
      'stale_revision',
      { current: serializeExploration(row), acknowledgedRevision: Number(mutation.revision) }
    );
  }
  return serializeExploration(row, { idempotent: true });
};

const putExploration = async ({ AuthoredExploration, WikiPage, Article, userId, pageId, claimId, articleId, highlightId, expectedRevision, mutationId, draft }) => {
  const revision = Number(expectedRevision);
  const mutation = clean(mutationId, 100);
  if (!Number.isInteger(revision) || revision < 0) throw new AuthoredExplorationError('expectedRevision must be a non-negative integer.');
  if (!mutation) throw new AuthoredExplorationError('mutationId is required.');
  const context = await resolveOrigin({ WikiPage, Article, userId, pageId, claimId, articleId, highlightId });
  const currentClaimText = originText({ ...context, claimId });
  const normalized = normalizeDraft(draft);
  if (normalized.originalText && normalized.originalText !== currentClaimText) {
    throw new AuthoredExplorationError('The held sentence changed.', 409, 'stale_origin', { currentClaimText });
  }
  normalized.originalText = currentClaimText;
  const selectedSource = await resolveOwnedSelectedSource({ Article, userId, selectedSource: draft?.selectedSource });
  if (selectedSource) normalized.selectedSource = selectedSource;
  const key = explorationKey({ userId, pageId, claimId, articleId, highlightId });
  const digest = fingerprint(normalized);
  const existing = await resolveQuery(AuthoredExploration.findOne(key), { lean: true });
  const replay = existingMutation(existing, mutation);
  if (replay) return replayedMutation(existing, replay, digest);
  if (!existing) {
    if (revision !== 0) throw new AuthoredExplorationError('The exploration revision is stale.', 409, 'stale_revision', { current: null });
    try {
      const created = await AuthoredExploration.create({
        ...key,
        revision: 1,
        origin: originSnapshot(context, claimId),
        draft: normalized,
        mutations: [{ id: mutation, fingerprint: digest, revision: 1 }]
      });
      return serializeExploration(created);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const raced = await resolveQuery(AuthoredExploration.findOne(key), { lean: true });
      const racedMutation = existingMutation(raced, mutation);
      if (racedMutation) return replayedMutation(raced, racedMutation, digest);
      throw new AuthoredExplorationError('The exploration revision is stale.', 409, 'stale_revision', { current: serializeExploration(raced) });
    }
  }
  if (Number(existing.revision) !== revision) {
    throw new AuthoredExplorationError('The exploration revision is stale.', 409, 'stale_revision', { current: serializeExploration(existing) });
  }
  const nextRevision = revision + 1;
  const updated = await resolveQuery(AuthoredExploration.findOneAndUpdate(
    { ...key, revision, 'mutations.id': { $ne: mutation } },
    {
      $set: {
        origin: originSnapshot(context, claimId),
        draft: normalized
      },
      $inc: { revision: 1 },
      $push: { mutations: { $each: [{ id: mutation, fingerprint: digest, revision: nextRevision }], $slice: -MAX_MUTATIONS } }
    },
    { new: true, runValidators: true }
  ), { lean: true });
  if (updated) return serializeExploration(updated);
  const current = await resolveQuery(AuthoredExploration.findOne(key), { lean: true });
  const won = existingMutation(current, mutation);
  if (won) return replayedMutation(current, won, digest);
  throw new AuthoredExplorationError('The exploration revision is stale.', 409, 'stale_revision', { current: serializeExploration(current) });
};

const listExplorations = async ({ AuthoredExploration, WikiPage, Article, userId, pageId, claimId = '', articleId, highlightId }) => {
  const context = await resolveOrigin({ WikiPage, Article, userId, pageId, claimId, articleId, highlightId, requireClaim: false });
  const filter = articleId ? { userId, articleId } : { userId, pageId };
  if (claimId) filter.claimId = String(claimId);
  if (highlightId) filter.highlightId = highlightId;
  let query = AuthoredExploration.find(filter);
  if (query?.sort) query = query.sort({ updatedAt: -1, _id: -1 });
  const rows = await resolveQuery(query, { lean: true });
  return Promise.all((Array.isArray(rows) ? rows : []).map(async (row) => {
    const live = context.article
      ? { ...context, highlight: highlightFromArticle(context.article, row.highlightId) }
      : { ...context, claim: claimFromPage(context.page, row.claimId) };
    let originStale = false;
    try {
      originStale = originText({ ...live, claimId: row.claimId }) !== clean(row.origin?.claimText, 4000);
    } catch (_error) {
      originStale = true;
    }
    if (!row.draft?.selectedSource) return serializeExploration(row, { originStale });
    try {
      const selectedSource = await resolveOwnedSelectedSource({ Article, userId, selectedSource: row.draft.selectedSource });
      return serializeExploration({ ...row, draft: { ...plain(row.draft), selectedSource } }, { originStale });
    } catch (error) {
      if (!(error instanceof AuthoredExplorationError)) throw error;
      const stored = plain(row.draft.selectedSource) || {};
      return serializeExploration({
        ...row,
        draft: { ...plain(row.draft), selectedSource: { ...stored, available: false, stale: true } }
      }, {
        originStale,
        sourceIssue: { code: error.code, message: error.message }
      });
    }
  }));
};

const deleteExploration = async ({ AuthoredExploration, userId, pageId, claimId, articleId, highlightId, expectedRevision }) => {
  const revision = Number(expectedRevision);
  if (!Number.isInteger(revision) || revision < 1) throw new AuthoredExplorationError('expectedRevision must be a positive integer.');
  const key = explorationKey({ userId, pageId, claimId, articleId, highlightId });
  const removed = await resolveQuery(AuthoredExploration.findOneAndDelete({ ...key, revision }), { lean: true });
  if (removed) return true;
  const current = await resolveQuery(AuthoredExploration.findOne(key), { lean: true });
  if (!current) return false;
  throw new AuthoredExplorationError('The exploration revision is stale.', 409, 'stale_revision', { current: serializeExploration(current) });
};

const sourceBlock = ({ source, createBlockId, question = false }) => {
  if (!source?.passage) return null;
  const sourcePath = source.available === false ? '' : sourceHref(source);
  const articleTitle = clean(source.articleTitle || source.title || 'Untitled article', 500);
  return {
    id: createBlockId(),
    type: question ? (source.highlightId ? 'highlight-ref' : 'paragraph') : (source.highlightId ? 'highlight_embed' : 'quote'),
    text: source.passage,
    highlightId: source.highlightId || null,
    articleId: source.articleId || null,
    articleTitle,
    sourcePath
  };
};

const authoredImportMeta = ({ row, keep, selectedSource }) => ({
  provider: 'noeis',
  sourceType: 'authored_exploration',
  sourceLabel: row.origin?.pageTitle || 'Wiki',
  sourceUrl: row.origin?.href || originHref(id(row.pageId), row.claimId),
  sourcePath: selectedSource ? sourceHref(selectedSource) : '',
  externalId: id(row),
  importedAt: keep.at || new Date()
});

const notebookPayload = ({ row, keep, targetId, createBlockId }) => {
  const draft = row.draft || {};
  const selectedSource = draft.selectedSource;
  const primarySource = row.primarySource;
  const writing = boundedRaw(draft.writing || draft.essay?.text || draft.provisionalText, 20000);
  const title = clean(draft.title || writing.split('\n')[0] || draft.question || 'Untitled', 240) || 'Untitled';
  const blocks = [];
  if (writing) blocks.push({ id: createBlockId(), type: 'paragraph', text: writing });
  const primaryBlock = sourceBlock({ source: primarySource, createBlockId });
  const selectedBlock = sourceBlock({ source: selectedSource, createBlockId });
  if (primaryBlock) blocks.push(primaryBlock);
  if (selectedBlock) blocks.push(selectedBlock);
  return {
    _id: targetId,
    userId: row.userId,
    title,
    content: writing,
    blocks,
    type: 'note',
    linkedArticleId: selectedSource?.articleId || primarySource?.articleId || null,
    linkedHighlightIds: [...new Set([primarySource?.highlightId, selectedSource?.highlightId].filter(Boolean).map(id))],
    importMeta: authoredImportMeta({ row, keep, selectedSource })
  };
};

const questionPayload = ({ row, keep, targetId, createBlockId }) => {
  const draft = row.draft || {};
  const selectedSource = draft.selectedSource;
  const primarySource = row.primarySource;
  const writing = boundedRaw(draft.writing || draft.essay?.text, 20000);
  const blocks = [];
  if (writing) blocks.push({ id: createBlockId(), type: 'paragraph', text: writing });
  const primaryBlock = sourceBlock({ source: primarySource, createBlockId, question: true });
  const selectedBlock = sourceBlock({ source: selectedSource, createBlockId, question: true });
  if (primaryBlock) blocks.push(primaryBlock);
  if (selectedBlock) blocks.push(selectedBlock);
  const linkedHighlightIds = [...new Set([primarySource?.highlightId, selectedSource?.highlightId].filter(Boolean).map(id))];
  return {
    _id: targetId,
    userId: row.userId,
    text: clean(draft.question, 2000),
    status: 'open',
    blocks,
    linkedHighlightId: selectedSource?.highlightId || primarySource?.highlightId || null,
    linkedHighlightIds,
    importMeta: authoredImportMeta({ row, keep, selectedSource })
  };
};

const ensureDestination = async ({ row, keep, NotebookEntry, Question, createBlockId }) => {
  const Model = keep.destination === 'notebook' ? NotebookEntry : Question;
  const existing = await resolveQuery(Model.findOne({ _id: keep.targetId, userId: row.userId }));
  if (existing) return existing;
  if (keep.status === 'complete') {
    throw new AuthoredExplorationError(
      'This kept copy is no longer available and was not recreated.',
      410,
      'kept_copy_removed'
    );
  }
  const payload = keep.destination === 'notebook'
    ? notebookPayload({ row, keep, targetId: keep.targetId, createBlockId })
    : questionPayload({ row, keep, targetId: keep.targetId, createBlockId });
  if (keep.destination === 'question' && !payload.text) {
    throw new AuthoredExplorationError('Write a question before keeping it in Questions.', 400, 'question_required');
  }
  let created;
  try {
    created = await Model.create(payload);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    created = await resolveQuery(Model.findOne({ _id: keep.targetId, userId: row.userId }));
    if (!created) throw error;
  }
  return created;
};

const keepExploration = async ({ AuthoredExploration, WikiPage, Article, NotebookEntry, Question, userId, pageId, claimId, articleId, highlightId, expectedRevision, mutationId, destination, createBlockId, onNotebookKept = async () => {}, onQuestionKept = async () => {} }) => {
  const revision = Number(expectedRevision);
  const mutation = clean(mutationId, 100);
  if (!Number.isInteger(revision) || revision < 1) throw new AuthoredExplorationError('expectedRevision must be a positive integer.');
  if (!mutation) throw new AuthoredExplorationError('mutationId is required.');
  if (!['notebook', 'question'].includes(destination)) throw new AuthoredExplorationError('destination must be notebook or question.');
  const context = await resolveOrigin({ WikiPage, Article, userId, pageId, claimId, articleId, highlightId, requireClaim: false });
  const key = explorationKey({ userId, pageId, claimId, articleId, highlightId });
  let row = await resolveQuery(AuthoredExploration.findOne(key), { lean: true });
  if (!row) throw new AuthoredExplorationError('Exploration not found.', 404, 'exploration_not_found');
  let keep = (row.keeps || []).find((item) => item.destination === destination);
  if (!keep && existingMutation(row, mutation)) {
    throw new AuthoredExplorationError('mutationId was already used for a different action.', 409, 'mutation_reused');
  }
  if (!keep) {
    const currentClaimText = originText({ ...context, claimId });
    if (clean(row.origin?.claimText, 4000) !== currentClaimText) {
      throw new AuthoredExplorationError('The held sentence changed.', 409, 'stale_origin', { currentClaimText });
    }
    const selectedSource = row.draft?.selectedSource
      ? await resolveOwnedSelectedSource({ Article, userId, selectedSource: row.draft.selectedSource })
      : undefined;
    const primarySource = await primarySourceForOrigin({ context, Article, userId });
    if (destination === 'question' && !String(row.draft?.question || '').trim()) {
      throw new AuthoredExplorationError('Write a question before keeping it in Questions.', 400, 'question_required');
    }
    if (Number(row.revision) !== revision) throw new AuthoredExplorationError('The exploration revision is stale.', 409, 'stale_revision', { current: serializeExploration(row) });
    const targetId = new mongoose.Types.ObjectId();
    const digest = fingerprint({ destination });
    row = await resolveQuery(AuthoredExploration.findOneAndUpdate(
      { ...key, revision, keeps: { $not: { $elemMatch: { destination } } } },
      {
        $inc: { revision: 1 },
        $push: {
          keeps: {
            destination,
            targetId,
            mutationId: mutation,
            status: 'pending',
            snapshot: {
              origin: plain(row.origin) || {},
              draft: { ...(plain(row.draft) || {}), ...(selectedSource ? { selectedSource } : {}) },
              ...(primarySource ? { primarySource } : {})
            },
            at: new Date()
          },
          mutations: { $each: [{ id: mutation, fingerprint: digest, revision: revision + 1 }], $slice: -MAX_MUTATIONS }
        }
      },
      { new: true, runValidators: true }
    ), { lean: true });
    if (!row) {
      row = await resolveQuery(AuthoredExploration.findOne(key), { lean: true });
      keep = (row?.keeps || []).find((item) => item.destination === destination);
      if (!keep) throw new AuthoredExplorationError('The exploration revision is stale.', 409, 'stale_revision', { current: serializeExploration(row) });
    }
    keep = (row.keeps || []).find((item) => item.destination === destination);
  }
  const keptRow = keep.snapshot
    ? {
        ...row,
        origin: keep.snapshot.origin || row.origin,
        draft: keep.snapshot.draft || row.draft,
        primarySource: keep.snapshot.primarySource || null
      }
    : row;
  const target = await ensureDestination({ row: keptRow, keep, NotebookEntry, Question, createBlockId });
  if (keep.status !== 'complete') {
    try {
      // The object may already exist after an interrupted attempt. Its
      // idempotent queue writes must finish before dropping the snapshot.
      if (destination === 'notebook') await onNotebookKept(target);
      else await onQuestionKept(target);
    } catch (error) {
      throw new AuthoredExplorationError(
        'Your copy is saved. Finishing Keep was interrupted; try again.',
        503,
        'keep_pending',
        { current: serializeExploration(row) }
      );
    }
    await resolveQuery(AuthoredExploration.updateOne(
      { ...key, 'keeps.destination': destination, 'keeps.targetId': keep.targetId },
      { $set: { 'keeps.$.status': 'complete' }, $unset: { 'keeps.$.snapshot': 1 } }
    ));
    keep = { ...plain(keep), status: 'complete' };
  }
  const current = await resolveQuery(AuthoredExploration.findOne(key), { lean: true }) || row;
  const targetId = id(keep.targetId);
  return {
    href: destination === 'notebook'
      ? `/think?tab=notebook&entryId=${encodeURIComponent(targetId)}`
      : `/think?tab=questions&questionId=${encodeURIComponent(targetId)}`,
    title: clean(destination === 'notebook' ? target?.title : target?.text, destination === 'notebook' ? 240 : 2000),
    destination,
    targetId,
    exploration: serializeExploration(current)
  };
};

const resolveExplorationContext = async ({ userId, context, WikiPage, Article }) => {
  const exploration = context?.metadata?.exploration || context?.exploration;
  if (!exploration) return null;
  const enclosingPageId = clean(context?.pageId || context?.id || context?.metadata?.pageId, 100);
  const enclosingClaimId = clean(context?.claimId || context?.metadata?.claimId, 240);
  const pageId = clean(exploration.pageId, 100);
  const claimId = clean(exploration.claimId, 240);
  if (!pageId || !claimId || pageId !== enclosingPageId || claimId !== enclosingClaimId) {
    throw new AuthoredExplorationError('Private exploration does not match the opened sentence.', 400, 'exploration_context_mismatch');
  }
  const { page, claim } = await resolveOwnedPageClaim({ WikiPage, userId, pageId, claimId });
  const currentClaimText = liveClaimText({ page, claim, claimId });
  const draft = normalizeDraft(exploration.draft || exploration);
  if (draft.originalText && draft.originalText !== currentClaimText) {
    throw new AuthoredExplorationError('The held sentence changed. Review the earlier context before asking again.', 409, 'stale_origin');
  }
  draft.originalText = currentClaimText;
  const selectedSource = await resolveOwnedSelectedSource({ Article, userId, selectedSource: (exploration.draft || exploration).selectedSource });
  if (selectedSource) draft.selectedSource = selectedSource;
  const primarySource = await resolvePrimarySource({ Article, userId, page, claim });
  return { pageId, claimId, pageTitle: clean(page.title, 500), claimText: currentClaimText, primarySource, draft };
};

module.exports = {
  AuthoredExplorationError,
  deleteExploration,
  keepExploration,
  listExplorations,
  normalizeDraft,
  putExploration,
  resolveExplorationContext,
  resolveOwnedSelectedSource,
  resolvePrimarySource,
  serializeExploration
};
