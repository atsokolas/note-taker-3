// Scores one agent turn against what a good reader's assistant would do:
// find the right sources, bring their actual words into the answer, cite only
// what it used, never invent a quotation, and say so when the library is silent.
// Every check is deterministic so the eval can run, and fail, without a model.

const { words, drawsOn, inventedQuotes: quotesMissingFrom } = require('../services/agentGrounding');

// Replies the agent produces without reading anything. A real answer never
// needs these phrasings.
const TEMPLATE_PATTERNS = [
  /I can see the frame around/i,
  /not enough attached material is indexed/i,
  /\bCore claim:/,
  /\bBest support in view:/,
  /\bPressure to keep in view:/,
  /I sorted the best leads/i,
  /has not been named yet/i
];

const DECLINE_PATTERN = /\b(nothing|no (?:source|passage|note|highlight|mention|material)s?|(?:could ?n[o']t|can ?not|did ?n[o']t|do ?n[o']t) (?:find|see|have anything)|not (?:in|anywhere in) your|does ?n[o']t (?:say|mention|cover|discuss)|is ?n[o']t (?:in|covered))/i;

const inventedQuotes = (reply, texts) => quotesMissingFrom(reply, Object.values(texts));

const keysFor = (items = [], keyById) => new Set(
  items.map(item => keyById.get(String(item?.id || ''))).filter(Boolean)
);

const scoreCase = ({ evalCase, result = {}, ids, texts }) => {
  const keyById = new Map(Object.entries(ids).map(([key, id]) => [id, key]));
  const reply = String(result.reply || '');
  const found = keysFor([result.context, ...(result.relatedItems || []), ...(result.citations || [])], keyById);
  const cited = keysFor(result.citations || [], keyById);
  const bound = evalCase.surface.startsWith('article:') ? evalCase.surface.slice('article:'.length) : '';
  const invented = inventedQuotes(reply, texts);
  const templated = TEMPLATE_PATTERNS.some(pattern => pattern.test(reply));

  let checks;
  if (evalCase.abstain) {
    checks = {
      declines: DECLINE_PATTERN.test(reply),
      citesNothing: cited.size === 0,
      noInventedQuotes: invented.length === 0,
      notTemplate: !templated
    };
  } else {
    const required = evalCase.sources || [];
    const oneOf = evalCase.oneOf || [];
    const relevant = new Set([...required, ...oneOf, ...(evalCase.allowed || []), bound].filter(Boolean));
    const drawnOn = key => drawsOn(reply, texts[key]);
    checks = {
      found: required.every(key => found.has(key)) && (!oneOf.length || oneOf.some(key => found.has(key))),
      drawsOnPassages: required.every(drawnOn) && (!oneOf.length || oneOf.some(drawnOn)),
      citesOnlyRelevant: cited.size > 0 && [...cited].every(key => relevant.has(key)),
      noInventedQuotes: invented.length === 0,
      notTemplate: !templated
    };
  }

  return {
    id: evalCase.id,
    surface: evalCase.surface,
    ask: evalCase.ask,
    pass: Object.values(checks).every(Boolean),
    checks,
    found: [...found],
    cited: [...cited],
    invented,
    mode: String(result.mode || ''),
    model: String(result.model || ''),
    reply
  };
};

const summarize = (scored = []) => {
  const rate = (list) => (list.length ? Number((list.filter(Boolean).length / list.length).toFixed(3)) : null);
  const checkNames = [...new Set(scored.flatMap(item => Object.keys(item.checks)))];
  return {
    total: scored.length,
    passed: scored.filter(item => item.pass).length,
    passRate: rate(scored.map(item => item.pass)),
    checks: Object.fromEntries(checkNames.map(name => [
      name,
      rate(scored.filter(item => name in item.checks).map(item => item.checks[name]))
    ])),
    modelAnswered: rate(scored.map(item => item.mode !== '' && item.mode !== 'internal_only'))
  };
};

// A run regresses when any rate it shares with the baseline falls.
const regressions = (summary, baseline) => {
  if (!baseline) return [];
  const pairs = [['passRate', summary.passRate, baseline.passRate],
    ...Object.entries(baseline.checks || {}).map(([name, value]) => [name, summary.checks[name], value])];
  return pairs
    .filter(([, now, before]) => typeof before === 'number' && typeof now === 'number' && now < before)
    .map(([name, now, before]) => ({ name, now, before }));
};

module.exports = { scoreCase, summarize, regressions, __testables: { drawsOn, inventedQuotes, words, TEMPLATE_PATTERNS, DECLINE_PATTERN } };
