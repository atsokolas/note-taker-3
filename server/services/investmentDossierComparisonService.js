const clean = (value = '', limit = 600) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const number = value => (
  value === null || value === undefined || value === ''
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null
);

const materiallyDifferent = (left, right, tolerance = 1e-9) => {
  const a = number(left);
  const b = number(right);
  if (a === null || b === null) return a !== b;
  return Math.abs(a - b) > tolerance * Math.max(1, Math.abs(a), Math.abs(b));
};

const percent = (value) => {
  const parsed = number(value);
  return parsed === null ? 'not available' : `${(parsed * 100).toFixed(1)}%`;
};

const money = (value, unitScale = 'millions', currency = 'USD') => {
  const parsed = number(value);
  if (parsed === null) return 'not available';
  const suffix = unitScale === 'billions' ? 'B' : unitScale === 'millions' ? 'M' : '';
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${parsed.toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`;
};

const sectionImpact = (section = '') => {
  const normalized = clean(section, 160).toLowerCase();
  if (/market|valuation|expectation|price/.test(normalized)) {
    return 'This changes the operating performance the current valuation must justify.';
  }
  if (/moat|product|technical|competitive/.test(normalized)) {
    return 'This changes the durability or erosion risk of the company’s competitive advantage.';
  }
  if (/economic|margin|cash|capital|unit/.test(normalized)) {
    return 'This changes the path from customer value to cash generation and owner returns.';
  }
  if (/risk|falsifier|obligation|policy|concentration/.test(normalized)) {
    return 'This changes the evidence that would weaken, falsify, or constrain the thesis.';
  }
  if (/judgment|thesis|decision/.test(normalized)) {
    return 'This bears directly on the owner’s current judgment and required return.';
  }
  return 'This changes a decision-relevant assertion in the maintained dossier.';
};

const claimNarrative = (kind, row = {}) => {
  const before = row.before || {};
  const after = row.after || {};
  const section = clean(after.section || before.section, 160) || 'Unclassified section';
  const prior = clean(before.text);
  const current = clean(after.text);
  if (kind === 'added') {
    return {
      kind,
      section,
      title: `New claim in ${section}`,
      detail: current,
      whyItMatters: sectionImpact(section)
    };
  }
  if (kind === 'removed') {
    return {
      kind,
      section,
      title: `Claim removed from ${section}`,
      detail: prior,
      whyItMatters: `Readers are no longer asked to rely on this assertion. ${sectionImpact(section)}`
    };
  }
  if (kind === 'gainedSupport') {
    return {
      kind,
      section,
      title: `Evidence strengthened in ${section}`,
      detail: `${current || prior} Support moved from ${clean(before.support, 40) || 'unrated'} to ${clean(after.support, 40) || 'unrated'}.`,
      whyItMatters: sectionImpact(section)
    };
  }
  if (kind === 'contradicted') {
    return {
      kind,
      section,
      title: `Evidence now conflicts with a claim in ${section}`,
      detail: current || prior,
      whyItMatters: `The prior conclusion can no longer be treated as settled. ${sectionImpact(section)}`
    };
  }
  return {
    kind: 'changed',
    section,
    title: `Conclusion revised in ${section}`,
    detail: prior && current
      ? `The accepted claim changed from “${prior}” to “${current}”.`
      : current || prior,
    whyItMatters: sectionImpact(section)
  };
};

const compareScenarios = (before = [], after = []) => {
  const priorByMultiple = new Map(
    (Array.isArray(before) ? before : []).map(row => [Number(row?.terminalMultiple), row])
  );
  const afterByMultiple = new Map(
    (Array.isArray(after) ? after : []).map(row => [Number(row?.terminalMultiple), row])
  );
  return Array.from(new Set([...priorByMultiple.keys(), ...afterByMultiple.keys()]))
    .sort((left, right) => left - right)
    .map((terminalMultiple) => {
    const prior = priorByMultiple.get(terminalMultiple);
    const row = afterByMultiple.get(terminalMultiple);
    return {
      terminalMultiple,
      beforeRequiredCagr: number(prior?.requiredCagr),
      afterRequiredCagr: number(row?.requiredCagr),
      disposition: !prior ? 'added' : !row ? 'removed' : 'retained',
      changed: materiallyDifferent(prior?.requiredCagr, row?.requiredCagr)
    };
  });
};

const expectationSignature = (valuation = {}) => ({
  asOf: clean(valuation.asOf, 40),
  currency: clean(valuation.currency, 8),
  unitScale: clean(valuation.unitScale, 20),
  price: number(valuation.price),
  dilutedShares: number(valuation.dilutedShares),
  netCashOrDebt: number(valuation.netCashOrDebt),
  enterpriseValue: number(valuation.enterpriseValue),
  operatingMetric: clean(valuation.operatingBase?.metric, 80),
  operatingPeriod: clean(valuation.operatingBase?.period, 80),
  operatingValue: number(valuation.operatingBase?.value),
  operatingDerivation: clean(valuation.operatingBase?.derivation),
  operatingSources: Array.isArray(valuation.operatingBase?.sourceRefIds)
    ? valuation.operatingBase.sourceRefIds.map(String).sort()
    : [],
  annualReturn: number(valuation.hurdle?.annualReturn),
  horizonYears: number(valuation.hurdle?.horizonYears),
  terminalMultiples: Array.isArray(valuation.hurdle?.terminalMultiples)
    ? valuation.hurdle.terminalMultiples.map(Number).sort((left, right) => left - right)
    : []
});

const compareExpectations = (before = {}, after = {}) => {
  const previous = before || {};
  const current = after || {};
  if (current.status !== 'complete') {
    return {
      status: 'unavailable',
      title: 'Implied expectations are not yet calculated',
      summary: 'A dated price, share count, net cash or debt, and source-backed operating base are still required.',
      scenarios: []
    };
  }
  if (previous.status !== 'complete') {
    return {
      status: 'established',
      title: 'Implied expectations were established',
      summary: `At ${money(current.enterpriseValue, current.unitScale, current.currency)} of enterprise value, the dossier now shows the operating growth required to clear the owner hurdle.`,
      scenarios: compareScenarios([], current.scenarios)
    };
  }
  const scenarios = compareScenarios(previous.scenarios, current.scenarios);
  const changed = JSON.stringify(expectationSignature(previous)) !== JSON.stringify(expectationSignature(current))
    || scenarios.some(row => row.changed);
  if (!changed) {
    return {
      status: 'unchanged',
      title: 'The valuation burden did not change',
      summary: `The ${current.asOf || 'current'} price snapshot, operating base, and required-growth scenarios were preserved.`,
      scenarios
    };
  }
  return {
    status: 'changed',
    title: 'The valuation burden changed',
    summary: `Price moved from ${money(previous.price, 'ones', previous.currency)} to ${money(current.price, 'ones', current.currency)}; enterprise value moved from ${money(previous.enterpriseValue, previous.unitScale, previous.currency)} to ${money(current.enterpriseValue, current.unitScale, current.currency)}. Required growth changed across ${scenarios.filter(row => row.changed).length} terminal scenario${scenarios.filter(row => row.changed).length === 1 ? '' : 's'}.`,
    scenarios
  };
};

const buildInvestmentMaintenanceComparison = ({
  before = {},
  after = {},
  claimComparison = {},
  sourceLabel = '',
  sourceEventId = '',
  revisionId = '',
  now = new Date()
} = {}) => {
  const deltas = claimComparison.deltas || {};
  const narratives = [];
  ['contradicted', 'changed', 'gainedSupport', 'added', 'removed'].forEach((kind) => {
    (Array.isArray(deltas[kind]) ? deltas[kind] : []).forEach((row) => {
      if (narratives.length < 8) narratives.push(claimNarrative(kind, row));
    });
  });
  const counts = claimComparison.counts || {};
  const materialCount = Number(counts.added || 0)
    + Number(counts.changed || 0)
    + Number(counts.removed || 0)
    + Number(counts.gainedSupport || 0)
    + Number(counts.contradicted || 0);
  const expectations = compareExpectations(
    before?.investmentDossier?.valuation,
    after?.investmentDossier?.valuation
  );
  const source = clean(sourceLabel, 160) || 'The latest accepted evidence';
  return {
    version: 1,
    generatedAt: now,
    sourceLabel: source,
    headline: materialCount
      ? `${source} changed ${materialCount} decision-relevant claim${materialCount === 1 ? '' : 's'}.`
      : `${source} preserved the accepted claim ledger.`,
    summary: narratives.length
      ? narratives[0].whyItMatters
      : `${Number(counts.preserved || 0)} accepted claim${Number(counts.preserved || 0) === 1 ? '' : 's'} survived review without a material rewrite.`,
    counts,
    claimChanges: narratives,
    expectations,
    sourceEventId: clean(sourceEventId, 80),
    revisionId: clean(revisionId, 80),
    nextEvidenceTest: clean(
      after?.investmentDossier?.researchPlan?.nextEvidenceTest
      || after?.investmentDossier?.nextEvidenceTest
      || after?.judgment?.nextReviewTrigger
    ),
    judgmentChanged: JSON.stringify({
      judgment: clean(before?.judgment?.currentJudgment),
      confidence: number(before?.judgment?.confidence),
      posture: clean(before?.judgment?.decisionPosture)
    }) !== JSON.stringify({
      judgment: clean(after?.judgment?.currentJudgment),
      confidence: number(after?.judgment?.confidence),
      posture: clean(after?.judgment?.decisionPosture)
    }),
    judgmentSummary: JSON.stringify({
      judgment: clean(before?.judgment?.currentJudgment),
      confidence: number(before?.judgment?.confidence),
      posture: clean(before?.judgment?.decisionPosture)
    }) !== JSON.stringify({
      judgment: clean(after?.judgment?.currentJudgment),
      confidence: number(after?.judgment?.confidence),
      posture: clean(after?.judgment?.decisionPosture)
    })
      ? 'The owner judgment changed and requires explicit owner review.'
      : 'The owner judgment was preserved.'
  };
};

module.exports = {
  buildInvestmentMaintenanceComparison,
  claimNarrative,
  compareExpectations,
  sectionImpact
};
