/* Whether each claim is supported by what it cites, asked of a model one
   batch at a time. The judge sees only the passages of the cited sources
   that look most like the claim, never the rest of the page, so it cannot
   be talked round by the page's own argument. */

const { chatComplete } = require('../ai/hfTextClient');

const CHUNK = 700;
const OVERLAP = 150;
const PASSAGES_PER_SOURCE = 2;
const BATCH = 10;
const VERDICTS = new Set(['supported', 'partial', 'unsupported']);

const terms = text => new Set(String(text || '').toLowerCase().match(/[a-z]{4,}|\d[\d.,]*/g) || []);

/* The stretches of a source that share the most words and figures with the claim. */
const passagesFor = (claim, source = '', count = PASSAGES_PER_SOURCE) => {
  const text = String(source || '').replace(/\s+/g, ' ');
  if (!text) return [];
  const wanted = terms(claim);
  const chunks = [];
  for (let start = 0; start < text.length; start += CHUNK - OVERLAP) {
    const chunk = text.slice(start, start + CHUNK);
    const have = terms(chunk);
    let shared = 0;
    wanted.forEach((term) => { if (have.has(term)) shared += /\d/.test(term) ? 3 : 1; });
    chunks.push({ start, chunk, shared });
    if (start + CHUNK >= text.length) break;
  }
  return chunks
    .sort((a, b) => b.shared - a.shared || a.start - b.start)
    .slice(0, count)
    .sort((a, b) => a.start - b.start)
    .map(item => item.chunk);
};

const promptFor = items => [
  'For each claim, decide from the passages alone whether they support it.',
  'supported: every fact and figure in the claim is stated in, or plainly follows from, the passages.',
  'partial: some of it is, and the rest is interpretation the passages do not state.',
  'unsupported: the passages do not say it, or say something different.',
  'Return JSON only: {"verdicts":[{"id":1,"verdict":"supported","reason":"one short sentence"}]}',
  '',
  JSON.stringify(items, null, 1)
].join('\n');

/**
 * claims:  [{ text, citationIndexes }] (from score.claimsOf)
 * sources: texts in sourceRefs order
 * Returns one verdict per claim; uncited claims and claims whose sources
 * could not be read are marked without asking.
 */
const judgeClaims = async ({ claims = [], sources = [], chat = chatComplete } = {}) => {
  const results = claims.map(claim => ({ text: claim.text, verdict: '', reason: '' }));
  const asked = [];
  claims.forEach((claim, index) => {
    if (!claim.citationIndexes.length) {
      results[index].verdict = 'uncited';
      return;
    }
    const passages = claim.citationIndexes.flatMap(cite => passagesFor(claim.text, sources[cite - 1]));
    if (!passages.length) {
      results[index].verdict = 'unread';
      return;
    }
    asked.push({ index, item: { id: asked.length + 1, claim: claim.text, passages } });
  });

  for (let start = 0; start < asked.length; start += BATCH) {
    const batch = asked.slice(start, start + BATCH);
    let verdicts = [];
    try {
      const completion = await chat({
        route: 'critique',
        temperature: 0,
        maxTokens: 1800,
        reasoningEffort: 'low',
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You check claims against source passages. Be strict about figures. Return valid JSON only.' },
          { role: 'user', content: promptFor(batch.map(entry => entry.item)) }
        ]
      });
      const raw = String(completion?.text || '');
      verdicts = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).verdicts || [];
    } catch (error) {
      verdicts = [];
    }
    batch.forEach(({ index, item }) => {
      const found = verdicts.find(verdict => Number(verdict?.id) === item.id);
      results[index].verdict = VERDICTS.has(found?.verdict) ? found.verdict : 'unjudged';
      results[index].reason = String(found?.reason || '').slice(0, 240);
    });
  }
  return results;
};

const summarizeVerdicts = (verdicts = []) => {
  const count = name => verdicts.filter(item => item.verdict === name).length;
  const judged = count('supported') + count('partial') + count('unsupported');
  return {
    supported: count('supported'),
    partial: count('partial'),
    unsupported: count('unsupported'),
    uncited: count('uncited'),
    unread: count('unread'),
    unjudged: count('unjudged'),
    supportedShare: judged ? count('supported') / judged : null
  };
};

module.exports = { judgeClaims, summarizeVerdicts, passagesFor };
