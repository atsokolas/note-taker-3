const crypto = require('crypto');

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'before', 'being', 'between', 'could',
  'every', 'from', 'have', 'into', 'more', 'most', 'over', 'should', 'that', 'their', 'there',
  'these', 'this', 'through', 'under', 'what', 'when', 'where', 'which', 'while', 'with', 'would'
]);

const toText = (value = '') => String(value || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeKey = (value = '') => toText(value)
  .toLowerCase()
  .replace(/&/g, ' ')
  .replace(/[^a-z0-9\s]+/g, ' ')
  .split(/\s+/)
  .filter(token => token.length > 2 && !STOPWORDS.has(token))
  .join(' ');

const slugify = (value = '') => normalizeKey(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'emerging-wiki';

const titleize = (value = '') => normalizeKey(value)
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 6)
  .map(token => token.charAt(0).toUpperCase() + token.slice(1))
  .join(' ');

const materialHash = (value = '') => crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);

const addSignal = (signals, {
  type,
  label,
  weight = 1,
  sourceType = '',
  sourceObjectId = null,
  title = '',
  snippet = '',
  url = ''
}) => {
  const normalized = normalizeKey(label);
  if (!normalized) return;
  const variants = new Set([normalized]);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i + 1]) variants.add(`${tokens[i]} ${tokens[i + 1]}`);
    if (tokens[i + 1] && tokens[i + 2]) variants.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  variants.forEach((key) => signals.push({
    key,
    type,
    label: titleize(key) || toText(label).slice(0, 80),
    weight,
    sourceType,
    sourceObjectId,
    title: toText(title || label).slice(0, 240),
    snippet: toText(snippet || label).slice(0, 600),
    url: toText(url).slice(0, 1000)
  }));
};

const buildArchiveSignals = ({
  articles = [],
  notebooks = [],
  concepts = [],
  pages = [],
  questions = []
} = {}) => {
  const signals = [];
  articles.forEach(article => {
    addSignal(signals, {
      type: 'phrase',
      label: article.title,
      weight: 1.2,
      sourceType: 'article',
      sourceObjectId: article._id,
      title: article.title,
      snippet: article.content || article.summary || '',
      url: article.url || ''
    });
    (article.highlights || []).forEach(highlight => {
      addSignal(signals, {
        type: 'highlight',
        label: highlight.text || highlight.note,
        weight: 1.5,
        sourceType: 'highlight',
        sourceObjectId: highlight._id,
        title: article.title,
        snippet: highlight.text || highlight.note || '',
        url: article.url || ''
      });
      (highlight.tags || []).forEach(tag => addSignal(signals, {
        type: 'tag',
        label: tag,
        weight: 1.1,
        sourceType: 'highlight',
        sourceObjectId: highlight._id,
        title: article.title,
        snippet: highlight.text || ''
      }));
    });
  });
  notebooks.forEach(note => addSignal(signals, {
    type: 'note',
    label: note.title || note.content || note.plainText,
    weight: 1.2,
    sourceType: 'notebook',
    sourceObjectId: note._id,
    title: note.title,
    snippet: note.plainText || note.content || ''
  }));
  concepts.forEach(concept => addSignal(signals, {
    type: 'concept',
    label: concept.name || concept.title,
    weight: 1.4,
    sourceType: 'concept',
    sourceObjectId: concept._id,
    title: concept.name || concept.title,
    snippet: concept.description || ''
  }));
  pages.forEach(page => addSignal(signals, {
    type: 'wiki_page',
    label: page.title,
    weight: 1,
    sourceType: 'wiki_page',
    sourceObjectId: page._id,
    title: page.title,
    snippet: page.plainText || ''
  }));
  questions.forEach(question => addSignal(signals, {
    type: 'question',
    label: question.text || question.title,
    weight: 1.1,
    sourceType: 'question',
    sourceObjectId: question._id,
    title: question.title || question.text,
    snippet: question.text || question.body || ''
  }));
  return signals;
};

const candidateRef = (signal, reason = '') => ({
  type: signal.sourceType === 'wiki_page' ? 'wiki_page' : (signal.sourceType || 'external'),
  objectId: signal.sourceObjectId || null,
  title: signal.title || signal.label,
  snippet: signal.snippet || '',
  url: signal.url || '',
  reason
});

const buildProposalCandidates = ({ signals = [], existingPages = [] } = {}) => {
  const existingKeys = new Set(existingPages.map(page => normalizeKey(page.title)).filter(Boolean));
  const byKey = new Map();
  signals.forEach(signal => {
    if (!signal.key || existingKeys.has(signal.key)) return;
    const bucket = byKey.get(signal.key) || [];
    bucket.push(signal);
    byKey.set(signal.key, bucket);
  });

  const candidates = [];
  byKey.forEach((bucket, key) => {
    const uniqueSources = new Map(bucket.map(signal => [`${signal.sourceType}:${signal.sourceObjectId || signal.title}`, signal]));
    const sourceRefs = Array.from(uniqueSources.values()).filter(signal => signal.sourceType !== 'wiki_page').slice(0, 6);
    if (sourceRefs.length >= 2) {
      candidates.push({
        proposalType: 'repeated_theme',
        title: titleize(key),
        slugCandidate: slugify(key),
        summary: `Recurring theme found across ${sourceRefs.length} archive sources.`,
        thesis: `${titleize(key)} appears repeatedly enough to deserve a maintained page.`,
        whyNow: `Noeis found ${sourceRefs.length} separate signals for this idea in your archive.`,
        confidence: Math.min(0.92, 0.48 + (sourceRefs.length * 0.11)),
        clusterKey: `theme:${key}`,
        sourceRefs: sourceRefs.map(signal => candidateRef(signal, 'Recurring archive signal')),
        connectedPageRefs: [],
        connectedConceptRefs: bucket.filter(signal => signal.sourceType === 'concept').map(signal => candidateRef(signal, 'Related concept')).slice(0, 4),
        signals: bucket.slice(0, 12).map(signal => ({
          type: signal.type,
          label: signal.label,
          weight: signal.weight,
          sourceType: signal.sourceType,
          sourceObjectId: signal.sourceObjectId,
          snippet: signal.snippet
        })),
        starterClaims: sourceRefs.slice(0, 3).map(signal => signal.snippet || signal.title).filter(Boolean),
        openQuestions: [`What would make ${titleize(key)} actionable or false?`],
        generation: {
          source: 'deterministic',
          generatedAt: new Date(),
          materialHash: materialHash(bucket.map(signal => signal.snippet || signal.title).join('|')),
          signalCount: bucket.length
        }
      });
    }

    const connectedPages = existingPages.filter(page => {
      const pageKey = normalizeKey(`${page.title} ${page.plainText || ''}`);
      return key.split(' ').some(token => token.length > 3 && pageKey.includes(token));
    }).slice(0, 4);
    if (connectedPages.length >= 2 && sourceRefs.length >= 1) {
      candidates.push({
        proposalType: 'bridge_idea',
        title: titleize(key),
        slugCandidate: slugify(key),
        summary: `Bridge idea connecting ${connectedPages.length} existing wiki pages.`,
        thesis: `${titleize(key)} may connect pages that are currently separate.`,
        whyNow: `Noeis found this idea touching ${connectedPages.map(page => page.title).join(', ')}.`,
        confidence: Math.min(0.88, 0.56 + (connectedPages.length * 0.08) + (sourceRefs.length * 0.04)),
        clusterKey: `bridge:${key}`,
        sourceRefs: sourceRefs.map(signal => candidateRef(signal, 'Bridge source')).slice(0, 5),
        connectedPageRefs: connectedPages.map(page => ({
          type: 'wiki_page',
          objectId: page._id,
          title: page.title,
          snippet: page.plainText || '',
          reason: 'Shares archive language'
        })),
        connectedConceptRefs: bucket.filter(signal => signal.sourceType === 'concept').map(signal => candidateRef(signal, 'Related concept')).slice(0, 4),
        signals: bucket.slice(0, 12).map(signal => ({
          type: signal.type,
          label: signal.label,
          weight: signal.weight,
          sourceType: signal.sourceType,
          sourceObjectId: signal.sourceObjectId,
          snippet: signal.snippet
        })),
        starterClaims: sourceRefs.slice(0, 2).map(signal => signal.snippet || signal.title).filter(Boolean),
        openQuestions: [`Does ${titleize(key)} actually unify these pages, or only share vocabulary?`],
        generation: {
          source: 'deterministic',
          generatedAt: new Date(),
          materialHash: materialHash(bucket.map(signal => signal.snippet || signal.title).join('|')),
          signalCount: bucket.length
        }
      });
    }
  });
  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 12);
};

const upsertProposalCandidates = async ({ WikiProposal, userId, candidates = [] } = {}) => {
  if (!WikiProposal || !userId) return [];
  const proposals = [];
  for (const candidate of candidates) {
    const proposal = await WikiProposal.findOneAndUpdate(
      { userId, clusterKey: candidate.clusterKey },
      { $setOnInsert: { status: 'pending' }, $set: { ...candidate, userId } },
      { upsert: true, new: true }
    );
    proposals.push(proposal);
  }
  return proposals;
};

const refreshWikiProposals = async ({ userId, models = {}, limit = 8 } = {}) => {
  const { WikiProposal, WikiPage, Article, NotebookEntry, TagMeta, Question } = models;
  if (!WikiProposal || !WikiPage || !userId) return { proposals: [], generated: false };
  const [pages, articles, notebooks, concepts, questions] = await Promise.all([
    WikiPage.find({ userId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(80).lean(),
    Article ? Article.find({ userId }).sort({ updatedAt: -1 }).limit(80).lean() : [],
    NotebookEntry ? NotebookEntry.find({ userId }).sort({ updatedAt: -1 }).limit(80).lean() : [],
    TagMeta ? TagMeta.find({ userId }).sort({ updatedAt: -1 }).limit(80).lean() : [],
    Question ? Question.find({ userId }).sort({ updatedAt: -1 }).limit(80).lean() : []
  ]);
  const signals = buildArchiveSignals({ articles, notebooks, concepts, pages, questions });
  const candidates = buildProposalCandidates({ signals, existingPages: pages });
  await upsertProposalCandidates({ WikiProposal, userId, candidates });
  const proposals = await WikiProposal.find({ userId, status: { $in: ['pending', 'watched'] } })
    .sort({ confidence: -1, updatedAt: -1 })
    .limit(limit)
    .lean();
  return { proposals, generated: candidates.length > 0 };
};

const createDraftPageFromProposal = async ({ proposal, WikiPage, buildUniqueSlug }) => {
  if (!proposal || !WikiPage) return null;
  const title = proposal.title || 'Untitled Wiki Page';
  const starterClaims = (proposal.starterClaims || []).filter(Boolean).slice(0, 5);
  const openQuestions = (proposal.openQuestions || []).filter(Boolean).slice(0, 5);
  const body = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Current Understanding' }] },
      { type: 'paragraph', content: [{ type: 'text', text: proposal.thesis || proposal.summary || '' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why This Page Exists' }] },
      { type: 'paragraph', content: [{ type: 'text', text: proposal.whyNow || 'Noeis found repeated signals for this page in your archive.' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Source-Backed Claims' }] },
      ...(starterClaims.length ? starterClaims : ['Review the attached sources and promote only well-supported claims into durable page claims.']).map(claim => ({
        type: 'paragraph',
        content: [{ type: 'text', text: claim }]
      })),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Open Questions' }] },
      ...(openQuestions.length ? openQuestions : [`What does your archive most strongly support about ${title}?`]).map(question => ({
        type: 'paragraph',
        content: [{ type: 'text', text: question }]
      })),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Next Investigation' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Use this page to decide what to read, ask, or scout next.' }] }
    ]
  };
  const plainText = body.content
    .flatMap(block => (block.content || []).map(child => child.text).filter(Boolean))
    .join(' ');
  const page = new WikiPage({
    userId: proposal.userId,
    title,
    slug: buildUniqueSlug ? await buildUniqueSlug(proposal.userId, title) : `${proposal.slugCandidate || slugify(title)}-${Date.now()}`,
    pageType: proposal.proposalType === 'bridge_idea' ? 'synthesis' : 'topic',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'selected_sources',
    createdFrom: {
      type: 'sources',
      objectIds: (proposal.sourceRefs || []).map(ref => ref.objectId).filter(Boolean),
      text: proposal.thesis || proposal.summary || '',
      label: title
    },
    body,
    plainText,
    sourceRefs: [
      ...(proposal.sourceRefs || []),
      ...(proposal.connectedPageRefs || []),
      ...(proposal.connectedConceptRefs || [])
    ].map(ref => ({
      type: ref.type === 'wiki_page' ? 'external' : ref.type,
      objectId: ref.objectId || null,
      title: ref.title || title,
      snippet: ref.snippet || ref.reason || '',
      url: ref.url || '',
      addedBy: 'ai'
    })),
    freshness: { status: 'needs_review', lastMaintainedAt: null },
    aiState: {
      draftStatus: 'maintaining',
      draftRequestedAt: new Date(),
      draftStartedAt: new Date(),
      maintenanceSummary: `Created from ${proposal.proposalType === 'bridge_idea' ? 'bridge idea' : 'recurring theme'} proposal.`
    }
  });
  await page.save();
  proposal.status = 'accepted';
  proposal.createdPageId = page._id;
  await proposal.save();
  return page;
};

const createProposalFromSourceEvent = async ({ WikiProposal, event } = {}) => {
  void WikiProposal;
  void event;
  return null;
};

module.exports = {
  buildArchiveSignals,
  buildProposalCandidates,
  createDraftPageFromProposal,
  createProposalFromSourceEvent,
  normalizeKey,
  refreshWikiProposals,
  slugify,
  upsertProposalCandidates
};
