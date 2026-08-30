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

const DEFAULT_LIMIT = 8;
const SCAN_LIMIT = 60;
const SNIPPET_BUDGET = 320;

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
const passageWindows = (text = '') => {
  const body = clean(String(text || '').replace(/<[^>]*>/g, ' '));
  if (!body) return [];
  const sentences = body
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])|\n+/)
    .map(clean)
    .filter(Boolean);
  if (sentences.length <= 1) return [body];
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
    return answersExactPassage(visible, terms) ? visible : passage;
  })
  .sort(comparePassageQuality)[0] || null;

const snippetAround = (text = '', terms = [], budget = SNIPPET_BUDGET) => {
  const body = clean(text);
  if (body.length <= budget) return body;
  const lower = body.toLowerCase();
  let at = -1;
  terms.some((term) => {
    const found = lower.indexOf(term);
    if (found >= 0) at = found;
    return found >= 0;
  });
  if (at < 0) return `${body.slice(0, budget - 1).trim()}…`;
  const start = Math.max(0, at - Math.floor(budget / 3));
  const slice = body.slice(start, start + budget).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + budget < body.length ? '…' : ''}`;
};

const sourceLabelFor = (article = {}) => {
  const title = clean(article.title) || 'Untitled source';
  const site = clean(article.siteName);
  return site && !title.toLowerCase().includes(site.toLowerCase()) ? `${title} · ${site}` : title;
};

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

const candidatesFromArticle = (article = {}, terms = []) => {
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

  const body = clean(String(article.content || '').replace(/<[^>]*>/g, ' '));
  /* The title helps Mongo find a document. It must not make unrelated body
     prose look like evidence. When the body is empty, the title itself is the
     only honest quotation available. */
  const bodyPassage = bestEvidencePassage(body || clean(article.title), terms);
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
  userId,
  claim,
  judgment = {},
  limit = DEFAULT_LIMIT
} = {}) => {
  const terms = claimTerms(claim);
  if (!terms.length || !Article || !userId) return { terms, candidates: [] };

  const query = Article.find(
    { userId, archived: { $ne: true }, $text: { $search: terms.join(' ') } },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(SCAN_LIMIT);

  const articles = await (query.lean ? query.lean() : query);
  const filed = alreadyFiled(judgment);
  const rows = (Array.isArray(articles) ? articles : [])
    .flatMap(article => candidatesFromArticle(article, terms))
    .filter(candidate => answersClaim(candidate.matched, terms))
    .filter(candidate => !isFiled(candidate, filed));

  return { terms, candidates: rankCandidates(rows, limit) };
};

module.exports = {
  DEFAULT_LIMIT,
  EVERGREEN_BONUS,
  claimTerms,
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
  findLibraryEvidence
};
