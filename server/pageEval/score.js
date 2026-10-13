/* What a reader would check before sharing a page: does every claim say where
   it came from, does every number appear in the source it cites, does any
   quotation exist only on the page, is it current, and does the app's own
   vocabulary leak into the prose. Deterministic, so it runs without a model;
   whether a source actually says what a claim says is the judge's question
   (judge.js), and this file only gathers what the judge needs. */

const { inventedQuotes, figuresIn, valuesIn, statedIn } = require('../services/agentGrounding');

/* The app talking to itself. None of these belong in a page a stranger reads. */
const LEAKS = [
  /\bpush \d\b/i,
  /\bbacktest\b/i,
  /\bledger\b/i,
  /\bacceptance\b/i,
  /\baccepted[- ]through\b/i,
  /\bclaim units?\b/i,
  /\bevidence archetypes?\b/i,
  /\bresearch modules?\b/i,
  /\bsource events?\b/i,
  /\bmaintenance (?:pass|run|test)\b/i,
  /\bevidence queue\b/i,
  /\btrusted head\b/i,
  /\bwatch armed\b/i
];

/* A claim is one run of text under one claim mark; a paragraph with none is
   one uncited claim. */
const claimsOf = (body = {}) => {
  const claims = [];
  const visitParagraph = (node) => {
    let open = null;
    let marked = false;
    let plain = '';
    (node.content || []).forEach((child) => {
      const mark = (child.marks || []).find(item => item.type === 'claim');
      const text = String(child.text || '');
      plain += text;
      if (!mark) {
        open = null;
        return;
      }
      marked = true;
      const key = mark.attrs?.claimId || JSON.stringify(mark.attrs?.citationIndexes || []);
      if (open && open.key === key) {
        open.text += text;
        return;
      }
      open = {
        key,
        text,
        support: mark.attrs?.support || '',
        citationIndexes: (mark.attrs?.citationIndexes || []).map(Number).filter(Number.isFinite)
      };
      claims.push(open);
    });
    if (!marked && plain.trim().split(/\s+/).length >= 8) {
      claims.push({ key: '', text: plain, support: '', citationIndexes: [] });
    }
  };
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'paragraph' || node.type === 'listItem') {
      visitParagraph(node.type === 'listItem' ? { content: (node.content || []).flatMap(child => child.content || []) } : node);
      return;
    }
    (node.content || []).forEach(walk);
  };
  walk(body);
  return claims.map(({ key, ...claim }) => ({ ...claim, text: claim.text.trim() })).filter(claim => claim.text);
};

const textOf = (body = {}) => {
  const parts = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.text === 'string') parts.push(node.text);
    (node.content || []).forEach(walk);
    if (['paragraph', 'heading', 'listItem'].includes(node.type)) parts.push('\n');
  };
  walk(body);
  return parts.join('').replace(/[ \t]+\n/g, '\n').trim();
};

/**
 * Score one page.
 *   page:    { title, body, sourceRefs }
 *   sources: texts in sourceRefs order (sources[i] is citation [i + 1]); '' when unread
 *   dates:   { latestCited, latestAvailable } ISO dates, for pages that track filings
 */
const scorePage = ({ page = {}, sources = [], dates = {} } = {}) => {
  const claims = claimsOf(page.body);
  const text = textOf(page.body);
  const words = text.split(/\s+/).filter(Boolean).length;
  const cited = claims.filter(claim => claim.citationIndexes.length);
  const dangling = cited.filter(claim => claim.citationIndexes.some(index => index < 1 || index > (page.sourceRefs || []).length));

  const valuesBySource = sources.map(source => (source ? valuesIn(source) : null));
  const figures = [];
  claims.forEach((claim) => {
    figuresIn(claim.text).forEach((figure) => {
      const read = claim.citationIndexes.map(index => valuesBySource[index - 1]).filter(Boolean);
      figures.push({
        claim: claim.text.slice(0, 160),
        figure: figure.raw,
        status: !claim.citationIndexes.length ? 'uncited'
          : !read.length ? 'unread'
            : read.some(values => statedIn(figure, values)) ? 'stated' : 'not_stated'
      });
    });
  });
  const checkable = figures.filter(item => item.status === 'stated' || item.status === 'not_stated');

  const leaks = LEAKS.flatMap(pattern => (text.match(new RegExp(pattern.source, 'gi')) || []));
  const days = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000);
  const stale = dates.latestCited && dates.latestAvailable ? Math.max(0, days(dates.latestCited, dates.latestAvailable)) : null;

  const usedSources = new Set(cited.flatMap(claim => claim.citationIndexes));
  return {
    words,
    claims: claims.length,
    citedShare: claims.length ? cited.length / claims.length : 0,
    danglingCitations: dangling.length,
    sourcesCited: usedSources.size,
    sourcesListed: (page.sourceRefs || []).length,
    figures: {
      total: figures.length,
      checkable: checkable.length,
      statedShare: checkable.length ? checkable.filter(item => item.status === 'stated').length / checkable.length : null,
      notStated: figures.filter(item => item.status === 'not_stated'),
      uncited: figures.filter(item => item.status === 'uncited').length
    },
    inventedQuotes: sources.some(Boolean) ? inventedQuotes(text, sources.filter(Boolean)) : null,
    leaks: [...new Set(leaks.map(leak => leak.toLowerCase()))],
    daysBehindLatestFiling: stale
  };
};

module.exports = { scorePage, claimsOf, textOf };
