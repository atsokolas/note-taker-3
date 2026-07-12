const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'among', 'because', 'before', 'being', 'between',
  'could', 'from', 'have', 'into', 'more', 'most', 'other', 'over', 'same', 'should', 'than',
  'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'very', 'were',
  'what', 'when', 'where', 'which', 'while', 'with', 'would', 'alphabet', 'company', 'filing'
]);

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const tokens = (value = '') => Array.from(new Set(
  clean(value)
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{3,}/g) || []
)).filter(token => !STOPWORDS.has(token));

const numericTokens = (value = '') => Array.from(new Set(
  clean(value).match(/\$?\d+(?:\.\d+)?(?:\s*(?:billion|million|trillion|percent|%))?/gi) || []
)).map(value => value.toLowerCase().replace(/\s+/g, ''));

const evidenceSentences = (value = '') => clean(value)
  .split(/(?<=[.!?])\s+|\n+/)
  .map(clean)
  .filter(sentence => sentence.length >= 40 && sentence.length <= 1200)
  .slice(0, 4000);

const assessClaim = ({ claim = {}, sentences = [] } = {}) => {
  const claimTokens = tokens(claim.text);
  const claimNumbers = numericTokens(claim.text);
  if (claimTokens.length < 5) return null;
  let best = null;
  sentences.forEach((sentence) => {
    const sentenceTokens = new Set(tokens(sentence));
    const matched = claimTokens.filter(token => sentenceTokens.has(token));
    const coverage = matched.length / claimTokens.length;
    const sentenceNumbers = new Set(numericTokens(sentence));
    const numbersMatch = claimNumbers.every(number => sentenceNumbers.has(number));
    const score = numbersMatch ? coverage : coverage * 0.35;
    if (!best || score > best.score) {
      best = { score, coverage, numbersMatch, matched, sentence };
    }
  });
  if (!best || best.coverage < 0.7 || !best.numbersMatch) return null;
  return {
    claimId: String(claim.claimId || claim._id || claim.id || ''),
    claimText: clean(claim.text).slice(0, 500),
    section: clean(claim.section).slice(0, 160),
    score: Number(best.score.toFixed(3)),
    matchedTerms: best.matched.slice(0, 16),
    numericTerms: claimNumbers,
    evidenceQuote: best.sentence.slice(0, 700)
  };
};

const assessEventAgainstClaims = ({ event = {}, claims = [] } = {}) => {
  const sentences = evidenceSentences(event.text || event.summary);
  const matches = (Array.isArray(claims) ? claims : [])
    .map(claim => assessClaim({ claim, sentences }))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  return {
    version: 1,
    decision: matches.length ? 'direct_claim_matches' : 'no_direct_claim_match',
    reviewedClaimCount: Array.isArray(claims) ? claims.length : 0,
    directMatchCount: matches.length,
    matches
  };
};

module.exports = {
  assessEventAgainstClaims,
  __testables: { assessClaim, evidenceSentences, numericTokens, tokens }
};
