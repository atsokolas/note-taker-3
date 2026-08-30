/*
 * What your library already says about a claim you hold.
 *
 * A judgment could only be filled by typing into it or by accepting a line an
 * agent happened to bring past. Everything the reader had already saved and
 * marked as worth keeping sat one room away and could not be reached from the
 * claim it bore on.
 *
 * This retrieves; it never decides. Candidates come back with the words that
 * matched and where they came from, and the human files each one under Why or
 * Against. It deliberately does not guess which side a passage falls on: term
 * overlap cannot tell support from contradiction, and a product about grounded
 * belief must not pretend otherwise.
 */

const {
  similarToVectorItem,
  rawCosineToAtlasScore,
  contentHashOf
} = require('../ai/vectorStore');
const {
  exactArticlePassage,
  isArticlePassageSubId
} = require('../ai/articlePassages');

const DEFAULT_LIMIT = 8;
const HIGHLIGHT_SCAN_LIMIT = 32;
const BODY_SCAN_LIMIT = 16;
const SEARCH_TERM_LIMIT = 12;
const QUERY_TIMEOUT_MS = 4000;
const SNIPPET_BUDGET = 320;
const SEMANTIC_HIGHLIGHT_LIMIT = 16;
const SEMANTIC_RAW_COSINE_FLOOR = 0.72;
const SEMANTIC_ATLAS_SCORE_FLOOR = rawCosineToAtlasScore(SEMANTIC_RAW_COSINE_FLOOR);
const SEMANTIC_SOURCE_LIMIT = 32;
const SEMANTIC_COMBINED_LIMIT = 64;
const SEMANTIC_SOURCE_ATLAS_SCORE_FLOOR = 0.72;
const SEMANTIC_SOURCE_LEAD_MARGIN = 0.03;
const SEMANTIC_SOURCE_EXCERPT_BUDGET = 800;

/* Words that match everything and therefore mean nothing. */
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here',
  'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'me', 'more', 'most', 'my', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'our', 'ours', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will',
  'with', 'would', 'you', 'your', 'yours'
]);

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

/**
 * The words in a claim worth searching for. Short words and stopwords are
 * dropped: a claim about "the" is a claim about nothing.
 */
const claimTerms = (claim = '') => {
  const seen = new Set();
  return clean(claim)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map(word => word.replace(/^[-']+|[-']+$/g, ''))
    .filter(word => word.length > 2 && !STOPWORDS.has(word))
    .filter((word) => {
      if (seen.has(word)) return false;
      seen.add(word);
      return true;
    });
};

/* Mongo's text index is shared by the corpus, so sending every noun from a
   paragraph-sized judgment can turn a small personal-library read into a very
   broad posting-list scan. Keep short sentences exact; for longer holds, lead
   with the most discriminating words and let the passage gate below judge the
   full sentence. This changes recall at the candidate-discovery boundary, not
   the evidence bar. */
const searchTermsForClaim = (terms = [], limit = SEARCH_TERM_LIMIT) => [...terms]
  .map((term, index) => ({ term, index }))
  .sort((left, right) => right.term.length - left.term.length || left.index - right.index)
  .slice(0, Math.max(1, limit))
  .sort((left, right) => left.index - right.index)
  .map(({ term }) => term);

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const searchPatternForClaim = (terms = []) => {
  const bounded = searchTermsForClaim(terms).map(escapeRegExp).filter(Boolean);
  return bounded.length ? new RegExp(bounded.join('|'), 'i') : null;
};

/* Both sides reduce to the same root, so a claim about "capacity" is answered
   by a passage about "capacities". Stemming only the term would not do it:
   neither word contains the other. This is deliberately crude — it is a
   retrieval hint, and the human reads the passage before filing it. */
const stem = (word = '') => {
  const lower = String(word || '').toLowerCase();
  if (lower.length < 5) return lower;
  return lower.replace(/(ies|ied|ing|ed|es|s|y)$/, '');
};

const rootsOf = (text = '') => {
  const roots = new Set();
  clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .forEach((word) => {
      const token = word.replace(/^[-']+|[-']+$/g, '');
      if (!token) return;
      roots.add(token);
      roots.add(stem(token));
    });
  return roots;
};

const wordsOf = (text = '') => clean(text)
  .toLowerCase()
  .replace(/[^a-z0-9\s'-]/g, ' ')
  .split(/\s+/)
  .map(word => word.replace(/^[-']+|[-']+$/g, ''))
  .filter(Boolean);

const matchedTerms = (text = '', terms = []) => {
  const roots = rootsOf(text);
  return terms.filter(term => roots.has(term) || roots.has(stem(term)));
};

/* A suggestion has to answer the sentence, not merely share a loose word.
   Short holds need almost complete coverage; longer ones need both multiple
   matches and enough of the sentence to be recognizable. When nothing clears
   this bar, the truthful product state is silence. */
const answersClaim = (matched = [], terms = []) => {
  if (!terms.length || !matched.length) return false;
  if (terms.length === 1) return matched.length === 1;
  if (terms.length <= 3) return matched.length >= 2;
  return matched.length >= Math.ceil(terms.length * (2 / 3));
};

const explainMatch = (matched = [], terms = []) => {
  if (!answersClaim(matched, terms)) return '';
  return `Answers ${matched.length} of ${terms.length} key terms · ${matched.join(' · ')}`;
};

/* Retrieval used to score a whole article and then quote whichever 320
   characters happened to surround the first matching word. That could make
   the explanation true of the document but false of the words shown to the
   reader. Choose the smallest complete passage that clears the same quality
   bar, then score and explain those exact visible words. */
const evidenceSentences = (text = '') => (
  clean(String(text || '').replace(/<[^>]*>/g, ' '))
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])|\n+/)
    .map(clean)
    .filter(sentence => sentence && !/^(?:…|\.\.\.)(?=[a-z'])/.test(sentence))
);

const passageWindows = (text = '') => {
  const sentences = evidenceSentences(text);
  if (!sentences.length) return [];
  if (sentences.length === 1) return sentences;
  return sentences.flatMap((sentence, index) => {
    const pair = index < sentences.length - 1 ? clean(`${sentence} ${sentences[index + 1]}`) : '';
    return pair ? [sentence, pair] : [sentence];
  });
};

const orderedPhraseMatches = (text = '', terms = []) => {
  const words = wordsOf(text).map(stem);
  return terms.slice(0, -1).reduce((count, term, index) => {
    const left = stem(term);
    const right = stem(terms[index + 1]);
    const at = words.findIndex(word => word === left);
    if (at < 0) return count;
    return words.slice(at + 1, at + 4).includes(right) ? count + 1 : count;
  }, 0);
};

const passageQuality = (text = '', terms = []) => {
  const visible = clean(text);
  const matched = matchedTerms(visible, terms);
  const wordCount = Math.max(1, wordsOf(visible).length);
  return {
    text: visible,
    matched,
    coverage: terms.length ? matched.length / terms.length : 0,
    phraseMatches: orderedPhraseMatches(visible, terms),
    density: matched.length / wordCount
  };
};

/* Two-thirds coverage is already the relationship gate for longer holds.
   Phrase continuity still breaks ranking ties, but it must not rescue a loose
   cluster of topic words into eligibility. */
const answersExactPassage = (passage = {}, terms = []) => {
  return answersClaim(passage.matched, terms);
};

const comparePassageQuality = (left = {}, right = {}) => (
  (Number(right.coverage) || 0) - (Number(left.coverage) || 0)
  || (right.matched?.length || 0) - (left.matched?.length || 0)
  || (Number(right.phraseMatches) || 0) - (Number(left.phraseMatches) || 0)
  || (Number(right.density) || 0) - (Number(left.density) || 0)
  || clean(left.text).length - clean(right.text).length
);

const bestEvidencePassage = (text = '', terms = [], budget = SNIPPET_BUDGET) => passageWindows(text)
  .map(window => passageQuality(window, terms))
  .filter(passage => answersExactPassage(passage, terms))
  .map((passage) => {
    if (passage.text.length <= budget) return passage;
    const clipped = snippetAround(passage.text, passage.matched, budget);
    const visible = passageQuality(clipped, terms);
    return answersExactPassage(visible, terms) ? visible : null;
  })
  .filter(Boolean)
  .sort(comparePassageQuality)[0] || null;

const snippetAround = (text = '', terms = [], budget = SNIPPET_BUDGET) => {
  const body = clean(text);
  const sentences = evidenceSentences(body);
  if (!sentences.length) return '';
  if (body.length <= budget && sentences.join(' ') === body) return body;
  const candidates = sentences.filter(sentence => sentence.length <= budget);
  if (!candidates.length) return '';

  // Evidence is a sentence, not a character window. A saved excerpt may
  // itself begin or end halfway through the source; selecting the strongest
  // complete sentence prevents that damaged edge from entering the casebook.
  return candidates.reduce((best, sentence) => {
    const score = matchedTerms(sentence, terms).length;
    if (!best || score > best.score) return { sentence, score };
    return best;
  }, null)?.sentence || body;
};

const sourceLabelFor = (article = {}) => {
  const title = clean(article.title) || 'Untitled source';
  const site = clean(article.siteName);
  return site && !title.toLowerCase().includes(site.toLowerCase()) ? `${title} · ${site}` : title;
};

/* Article vectors predate the durable queue. The original backfill embedded a
   normalized 800-character opening; current saves embed a bounded 4,000-byte
   source record. Accept either known contract, but nothing else: an edited
   source with a stale vector must be silent until it is indexed again. */
const articleVectorVariants = (article = {}) => {
  const title = String(article.title || '');
  const content = String(article.content || '');
  const normalizedBody = clean(content.replace(/<[^>]*>/g, ' '));
  return [
    {
      text: [title, content].filter(Boolean).join('\n').slice(0, 4000),
      excerpt: normalizedBody
    },
    {
      text: clean(`${title}\n${normalizedBody.slice(0, 800)}`),
      excerpt: normalizedBody.slice(0, 800)
    }
  ];
};

const exactArticleExcerpt = (article = {}, expectedHash = '') => {
  const variant = articleVectorVariants(article)
    .find(candidate => contentHashOf(candidate.text) === String(expectedHash || ''));
  if (!variant) return '';
  const visible = clean(variant.excerpt);
  if (!visible) return '';
  if (visible.length <= SEMANTIC_SOURCE_EXCERPT_BUDGET) return visible;
  const bounded = visible.slice(0, SEMANTIC_SOURCE_EXCERPT_BUDGET + 1);
  const sentenceEnd = Math.max(bounded.lastIndexOf('. '), bounded.lastIndexOf('? '), bounded.lastIndexOf('! '));
  return clean(sentenceEnd >= 240 ? bounded.slice(0, sentenceEnd + 1) : bounded.slice(0, SEMANTIC_SOURCE_EXCERPT_BUDGET));
};

const exactSemanticSourceText = (article = {}, row = {}) => (
  isArticlePassageSubId(row?.subId)
    ? exactArticlePassage(article, row)
    : exactArticleExcerpt(article, row?.contentHash)
);

/*
 * A highlight is worth more than a paragraph of body text, because the reader
 * already decided the highlight mattered. We still consider the source body:
 * a complete article passage should outrank a thin saved fragment.
 */
const HIGHLIGHT_WEIGHT = 3;
const BODY_WEIGHT = 1;
/* Evergreen is a whisper, not a ranking. A kept source that barely touches
   the sentence must not outrank a passage that actually answers it. */
const EVERGREEN_BONUS = 1;

const candidatesFromArticle = (article = {}, terms = [], { includeBody = true } = {}) => {
  const rows = [];
  const label = sourceLabelFor(article);
  const articleId = String(article._id || '');
  const highlights = Array.isArray(article.highlights) ? article.highlights : [];

  highlights.forEach((highlight) => {
    const text = clean(highlight?.text);
    if (!text) return;
    /* A note may explain why a highlight matters, but it cannot make unrelated
       quoted words eligible. The filed object is the highlight text. */
    const passage = bestEvidencePassage(text, terms);
    if (!passage) return;
    const hits = passage.matched;
    rows.push({
      id: `highlight:${articleId}:${String(highlight?._id || rows.length)}`,
      kind: 'highlight',
      text: passage.text,
      note: clean(highlight?.note),
      sourceLabel: label,
      articleId,
      highlightId: String(highlight?._id || ''),
      url: clean(article.url),
      savedAt: highlight?.createdAt || article.createdAt || null,
      matched: hits,
      coverage: passage.coverage,
      phraseMatches: passage.phraseMatches,
      density: passage.density,
      whyThisSource: explainMatch(hits, terms),
      evergreen: Boolean(article.evergreen),
      score: hits.length * HIGHLIGHT_WEIGHT
        + passage.phraseMatches
        + passage.density
        + (article.evergreen ? EVERGREEN_BONUS : 0)
    });
  });

  const body = includeBody ? clean(String(article.content || '').replace(/<[^>]*>/g, ' ')) : '';
  /* The title helps Mongo find a document. It must not make unrelated body
     prose look like evidence. When the body is empty, the title itself is the
     only honest quotation available. */
  const bodyPassage = includeBody ? bestEvidencePassage(body || clean(article.title), terms) : null;
  if (bodyPassage) {
    rows.push({
      id: `article:${articleId}`,
      kind: 'source',
      text: bodyPassage.text,
      note: '',
      sourceLabel: label,
      articleId,
      highlightId: '',
      url: clean(article.url),
      savedAt: article.createdAt || null,
      matched: bodyPassage.matched,
      coverage: bodyPassage.coverage,
      phraseMatches: bodyPassage.phraseMatches,
      density: bodyPassage.density,
      whyThisSource: explainMatch(bodyPassage.matched, terms),
      evergreen: Boolean(article.evergreen),
      score: bodyPassage.matched.length * BODY_WEIGHT
        + bodyPassage.phraseMatches
        + bodyPassage.density
        + (article.evergreen ? EVERGREEN_BONUS : 0)
    });
  }
  return rows;
};

const rankCandidates = (rows = [], limit = DEFAULT_LIMIT) => [...rows]
  .sort((left, right) => (
    (Number(right.coverage) || 0) - (Number(left.coverage) || 0)
    || (right.matched?.length || 0) - (left.matched?.length || 0)
    || (Number(right.phraseMatches) || 0) - (Number(left.phraseMatches) || 0)
    || (Number(right.density) || 0) - (Number(left.density) || 0)
    || (Number(right.semanticScore) || 0) - (Number(left.semanticScore) || 0)
    || right.score - left.score
    || (new Date(right.savedAt || 0).getTime() || 0) - (new Date(left.savedAt || 0).getTime() || 0)
    || String(left.id).localeCompare(String(right.id))
  ))
  .slice(0, Math.max(1, limit));

/* Lines already filed under Why or Against, so the same passage is not offered
   back to a reader who has already made up their mind about it. */
const alreadyFiled = (judgment = {}) => {
  const filed = new Set();
  ['why', 'against'].forEach((field) => {
    (Array.isArray(judgment?.[field]) ? judgment[field] : []).forEach((line) => {
      const from = clean(line?.acceptedFrom);
      if (from) filed.add(from);
      const text = clean(line?.text).toLowerCase();
      if (text) filed.add(`text:${text.slice(0, 120)}`);
    });
  });
  return filed;
};

const isFiled = (candidate, filed) => (
  filed.has(candidate.id)
  || filed.has(`text:${clean(candidate.text).toLowerCase().slice(0, 120)}`)
);

/* Semantic search discovers identities; it never authors evidence. A saved
   highlight maps to words the reader chose. An article passage maps back to a
   deterministic slice of the owned source and must pass its current hash. */
const findSemanticHighlightEvidence = async ({
  Article,
  VectorItem,
  userId,
  pageId,
  claim,
  similar = similarToVectorItem
} = {}) => {
  if (!Article?.find || !VectorItem || !userId || !pageId || !clean(claim)) return [];
  try {
    const matches = (await similar({
      VectorItem,
      userId,
      objectType: 'judgment_claim',
      objectId: String(pageId),
      expectedText: claim,
      limit: SEMANTIC_HIGHLIGHT_LIMIT,
      objectTypes: ['highlight']
    }))
      .filter(row => row?.objectType === 'highlight')
      .filter(row => Number(row.score || 0) >= SEMANTIC_ATLAS_SCORE_FLOOR)
      .filter(row => clean(row.metadata?.articleId) && clean(row.objectId));
    if (!matches.length) return [];

    const articleIds = [...new Set(matches.map(row => clean(row.metadata.articleId)))];
    const scoreByHighlight = new Map(matches.map(row => [clean(row.objectId), Number(row.score || 0)]));
    const query = Article.find(
      { userId, archived: { $ne: true }, _id: { $in: articleIds } },
      { title: 1, siteName: 1, url: 1, highlights: 1, createdAt: 1, evergreen: 1 }
    ).limit(SEMANTIC_HIGHLIGHT_LIMIT);
    if (typeof query.maxTimeMS === 'function') query.maxTimeMS(QUERY_TIMEOUT_MS);
    const articles = await (query.lean ? query.lean() : query);

    return (Array.isArray(articles) ? articles : []).flatMap((article) => {
      const articleId = String(article?._id || '');
      const sourceLabel = sourceLabelFor(article);
      return (Array.isArray(article?.highlights) ? article.highlights : []).flatMap((highlight) => {
        const highlightId = String(highlight?._id || '');
        const semanticScore = scoreByHighlight.get(highlightId);
        const text = clean(highlight?.text);
        if (!semanticScore || !text) return [];
        return [{
          id: `highlight:${articleId}:${highlightId}`,
          kind: 'highlight',
          text,
          note: clean(highlight?.note),
          sourceLabel,
          articleId,
          highlightId,
          url: clean(article.url),
          savedAt: highlight?.createdAt || article.createdAt || null,
          matched: matchedTerms(text, claimTerms(claim)),
          coverage: 0,
          phraseMatches: 0,
          density: 0,
          semanticScore,
          whyThisSource: 'Meaning matches the held sentence',
          evergreen: Boolean(article.evergreen),
          score: semanticScore
        }];
      });
    });
  } catch (_error) {
    // Atlas indexing is additive. A missing, sleeping, or stale vector path
    // must preserve the deterministic lexical result rather than fail the
    // Judgment page or quietly broaden the quality bar.
    return [];
  }
};

/* A saved article can help even when the reader never highlighted it. Passage
   vectors point to the exact relevant slice; the summary row remains a
   compatibility fallback for sources indexed before passages shipped. Multiple
   chunks from one article count as one source when measuring a clear lead. */
const findSemanticSourceEvidence = async ({
  Article,
  VectorItem,
  userId,
  pageId,
  claim,
  similar = similarToVectorItem
} = {}) => {
  if (!Article?.find || !VectorItem || !userId || !pageId || !clean(claim)) return [];
  try {
    const matches = (await similar({
      VectorItem,
      userId,
      objectType: 'judgment_claim',
      objectId: String(pageId),
      expectedText: claim,
      limit: SEMANTIC_SOURCE_LIMIT,
      objectTypes: ['article']
    }))
      .filter(row => row?.objectType === 'article' && clean(row.objectId));
    const strongestByArticle = new Map();
    matches.forEach((row) => {
      const objectId = clean(row.objectId);
      const current = strongestByArticle.get(objectId);
      if (!current || Number(row.score || 0) > Number(current.score || 0)) {
        strongestByArticle.set(objectId, row);
      }
    });
    const ranked = [...strongestByArticle.values()]
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
    const lead = ranked[0];
    const runnerUp = ranked[1];
    if (!lead || Number(lead.score || 0) < SEMANTIC_SOURCE_ATLAS_SCORE_FLOOR) return [];
    if (runnerUp && Number(lead.score || 0) - Number(runnerUp.score || 0) < SEMANTIC_SOURCE_LEAD_MARGIN) return [];

    const query = Article.find(
      { userId, archived: { $ne: true }, _id: lead.objectId },
      { title: 1, siteName: 1, url: 1, content: 1, createdAt: 1, evergreen: 1 }
    ).limit(1);
    if (typeof query.maxTimeMS === 'function') query.maxTimeMS(QUERY_TIMEOUT_MS);
    const articles = await (query.lean ? query.lean() : query);
    const article = Array.isArray(articles) ? articles[0] : null;
    const text = exactSemanticSourceText(article, lead);
    if (!article || !text) return [];
    const articleId = String(article._id || '');
    return [{
      id: `article:${articleId}`,
      kind: 'source',
      text,
      note: '',
      sourceLabel: sourceLabelFor(article),
      articleId,
      highlightId: '',
      url: clean(article.url),
      savedAt: article.createdAt || null,
      matched: matchedTerms(text, claimTerms(claim)),
      coverage: 0,
      phraseMatches: 0,
      density: 0,
      semanticScore: Number(lead.score || 0),
      whyThisSource: isArticlePassageSubId(lead.subId)
        ? 'Closest saved passage · exact source words'
        : 'Closest saved source · exact opening excerpt',
      evergreen: Boolean(article.evergreen),
      score: Number(lead.score || 0)
    }];
  } catch (_error) {
    return [];
  }
};

/* Highlights and source excerpts share the same held-sentence vector. One ANN
   read is both faster and simpler than asking Atlas the same question twice;
   the two evidence gates still judge their own identities independently. */
const findSemanticEvidence = async ({
  Article,
  VectorItem,
  userId,
  pageId,
  claim,
  similar = similarToVectorItem
} = {}) => {
  if (!Article?.find || !VectorItem || !userId || !pageId || !clean(claim)) return [];
  try {
    const rows = await similar({
      VectorItem,
      userId,
      objectType: 'judgment_claim',
      objectId: String(pageId),
      expectedText: claim,
      limit: SEMANTIC_COMBINED_LIMIT,
      objectTypes: ['highlight', 'article']
    });
    const replay = async ({ objectTypes = [] } = {}) => (
      (Array.isArray(rows) ? rows : []).filter(row => objectTypes.includes(row?.objectType))
    );
    const [highlights, sources] = await Promise.all([
      findSemanticHighlightEvidence({ Article, VectorItem, userId, pageId, claim, similar: replay }),
      findSemanticSourceEvidence({ Article, VectorItem, userId, pageId, claim, similar: replay })
    ]);
    return [...highlights, ...sources];
  } catch (_error) {
    return [];
  }
};

/**
 * Find what the library already holds about one claim.
 *
 * @param {object} params
 * @param {object} params.Article mongoose Article model
 * @param {string} params.userId
 * @param {string} params.claim the claim sentence
 * @param {object} [params.judgment] the judgment, so filed lines are not re-offered
 * @param {number} [params.limit]
 */
const findLibraryEvidence = async ({
  Article,
  VectorItem = null,
  userId,
  pageId = '',
  claim,
  judgment = {},
  limit = DEFAULT_LIMIT
} = {}) => {
  const terms = claimTerms(claim);
  if (!terms.length || !Article || !userId) return { terms, candidates: [] };

  const pattern = searchPatternForClaim(terms);
  if (!pattern) return { terms, candidates: [] };

  const base = { userId, archived: { $ne: true } };
  const highlightQuery = Article.find(
    { ...base, 'highlights.text': pattern },
    {
      title: 1,
      siteName: 1,
      url: 1,
      highlights: { $elemMatch: { text: pattern } },
      createdAt: 1,
      evergreen: 1
    }
  ).sort({ createdAt: -1, _id: -1 }).limit(HIGHLIGHT_SCAN_LIMIT);
  const bodyQuery = Article.find(
    { ...base, content: pattern },
    {
      title: 1,
      siteName: 1,
      url: 1,
      content: 1,
      createdAt: 1,
      evergreen: 1
    }
  ).sort({ createdAt: -1, _id: -1 }).limit(BODY_SCAN_LIMIT);

  /* The old global text-index read could walk postings for every account and
     then hydrate sixty complete articles. Two user-indexed, projection-tight
     reads keep the personal corpus boundary first: one matching saved quote
     per source, and only a small set of complete bodies. */
  [highlightQuery, bodyQuery].forEach((query) => {
    if (typeof query.maxTimeMS === 'function') query.maxTimeMS(QUERY_TIMEOUT_MS);
  });

  const [highlightArticles, bodyArticles, semanticRows] = await Promise.all([
    highlightQuery.lean ? highlightQuery.lean() : highlightQuery,
    bodyQuery.lean ? bodyQuery.lean() : bodyQuery,
    findSemanticEvidence({ Article, VectorItem, userId, pageId, claim })
  ]);
  const filed = alreadyFiled(judgment);
  const rows = [
    /* Discovery comes first so a deterministic exact-term match with the same
       identity replaces it below. Semantic recall should fill gaps, never
       erase the stronger explanation we already know how to prove. */
    ...(Array.isArray(semanticRows) ? semanticRows : []),
    ...(Array.isArray(highlightArticles) ? highlightArticles : [])
      .flatMap(article => candidatesFromArticle(article, terms, { includeBody: false })),
    ...(Array.isArray(bodyArticles) ? bodyArticles : [])
      .flatMap(article => candidatesFromArticle(article, terms))
  ]
    .filter(candidate => candidate.semanticScore || answersClaim(candidate.matched, terms))
    .filter(candidate => !isFiled(candidate, filed));

  const uniqueRows = [...new Map(rows.map(candidate => [candidate.id, candidate])).values()];

  return { terms, candidates: rankCandidates(uniqueRows, limit) };
};

module.exports = {
  DEFAULT_LIMIT,
  EVERGREEN_BONUS,
  HIGHLIGHT_SCAN_LIMIT,
  BODY_SCAN_LIMIT,
  SEARCH_TERM_LIMIT,
  QUERY_TIMEOUT_MS,
  claimTerms,
  searchTermsForClaim,
  searchPatternForClaim,
  stem,
  matchedTerms,
  answersClaim,
  explainMatch,
  passageWindows,
  passageQuality,
  answersExactPassage,
  bestEvidencePassage,
  snippetAround,
  candidatesFromArticle,
  rankCandidates,
  alreadyFiled,
  SEMANTIC_HIGHLIGHT_LIMIT,
  SEMANTIC_RAW_COSINE_FLOOR,
  SEMANTIC_ATLAS_SCORE_FLOOR,
  SEMANTIC_SOURCE_LIMIT,
  SEMANTIC_COMBINED_LIMIT,
  SEMANTIC_SOURCE_ATLAS_SCORE_FLOOR,
  SEMANTIC_SOURCE_LEAD_MARGIN,
  articleVectorVariants,
  exactArticleExcerpt,
  exactSemanticSourceText,
  findSemanticHighlightEvidence,
  findSemanticSourceEvidence,
  findSemanticEvidence,
  findLibraryEvidence
};
