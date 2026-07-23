#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { WikiPage, WikiRevision, WikiSourceEvent } = require('../server/models');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');
const { evaluateWikiArticleQuality } = require('../server/services/wikiMaintenanceService');
const { compareClaimLedgers } = require('../server/services/wikiClaimComparisonService');
const { buildSecPublicProofAcceptance } = require('../server/services/wikiPublicProofAcceptanceService');
const { buildPublicProofHeadHash } = require('../server/services/publicProofHeadService');
const {
  buildReverseExpectations,
  compoundAnnualGrowthRate,
  round
} = require('../server/services/investmentValuationService');
const { strictValidate: validatePush4Contract } = require('./enrich_nvidia_matched_workload_push4');
const { QUESTIONS: PUSH5_QUESTIONS } = require('./reshape_nvidia_investor_brief_push5');

const PAGE_ID = process.env.NVIDIA_PROOF_PAGE_ID || '6a5d225cd00276de99a7d168';
const OUTPUT_DIR = path.resolve(process.env.NVIDIA_PUSH6_OUTPUT || path.join(process.cwd(), 'output', 'nvidia-implied-expectations-push6-2026-07-23'));
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const RESEARCH_AS_OF = new Date('2026-07-23T23:15:18.000Z');
const SECTION_HEADING = 'What the price already requires';
const QUESTION_HEADING = 'Five questions that decide the thesis';

const VALUATION_INPUT = Object.freeze({
  price: 208.76,
  dilutedShares: 24.2,
  operatingBase: 96.676,
  annualReturn: 0.10,
  horizonYears: 5,
  terminalMultiples: [25, 30, 35, 40]
});
const valuation = buildReverseExpectations(VALUATION_INPUT);
const MARKET = Object.freeze({
  price: valuation.price,
  sharesBillions: valuation.dilutedShares,
  equityValueBillions: round(valuation.equityValue, 1),
  fy2026FcfBillions: valuation.operatingBase,
  q1FcfBillions: 48.587,
  q1AnnualizedFcfBillions: 194.348,
  fy2026PriceToFcf: round(valuation.currentOperatingMultiple, 1),
  fy2026FcfYieldPct: round(valuation.currentOperatingYield * 100, 2),
  requiredReturnPct: round(valuation.annualReturn * 100, 1),
  horizonYears: valuation.horizonYears
});

const SCENARIOS = Object.freeze(valuation.scenarios.map(row => ({
  terminalMultiple: row.terminalMultiple,
  requiredFcfBillions: round(row.requiredOperatingValue, 1),
  fy2026CagrPct: round(row.requiredOperatingCagr * 100, 1),
  q1RunRateCagrPct: round(compoundAnnualGrowthRate({
    beginningValue: MARKET.q1AnnualizedFcfBillions,
    endingValue: row.requiredOperatingValue,
    years: MARKET.horizonYears
  }) * 100, 1)
})));

const PRICE_SOURCE = Object.freeze({
  key: 'nasdaq-nvda-price-2026-07-23',
  type: 'external',
  provider: 'nasdaq',
  title: 'Nasdaq NVDA historical and market quote',
  url: 'https://www.nasdaq.com/market-activity/stocks/nvda/historical',
  snippet: 'Nasdaq market-data page used for the $208.76 NVDA share-price snapshot on July 23, 2026. The price is a dated market input, not a company-reported figure or a maintained SEC clock.'
});

const REWRITES = Object.freeze([
  {
    id: 'nvda-thesis-348e7670',
    support: 'partial',
    addSources: [PRICE_SOURCE.key],
    text: 'Current judgment. NVIDIA’s demand and operating engine are exceptional. The unresolved question is whether its system-level economic advantage can outrun the forward supply commitments, customer concentration, export-control constraints, and capital recycling required to sustain it. Those obligations can reinforce the platform while demand compounds; they make the downside nonlinear if customer build-outs slow or alternative accelerators absorb enough workloads. The evidence establishes exceptional business quality. At the July 23 market valuation, it does not by itself establish an attractive expected return; the stock must be underwritten as an expectations problem rather than as an automatic consequence of AI leadership.'
  },
  {
    id: 'nvda-method-bfbaf8b2',
    support: 'partial',
    addSources: [PRICE_SOURCE.key],
    text: 'Evidence status. Reported revenue, margins, cash flow, commitments, concentration, shares outstanding, and security issuances come from NVIDIA’s SEC filings; free cash flow is calculated as operating cash flow less property-and-equipment purchases and is not a company-reported GAAP measure. The July 23 share price is a dated Nasdaq market snapshot. Valuation outputs below are arithmetic sensitivities, not forecasts or price targets. This is a labeled historical maintenance backtest: the FY2026 10-K is the reconstructed baseline, the Q1 FY2027 filing is the operating update, and the June 2026 debt filing is the accepted-through balance-sheet event. It does not claim that Noeis observed those SEC events in real time.'
  }
]);

const CLAIMS = Object.freeze([
  {
    id: 'nvda-push6-market-start',
    support: 'supported',
    sources: [PRICE_SOURCE.key, 'fy26', 'q1'],
    text: 'The starting valuation is demanding. A $208.76 share-price snapshot on July 23, 2026 multiplied by the 24.2 billion shares NVIDIA reported outstanding as of May 15 implies roughly $5.05 trillion of equity value. Against FY2026 free cash flow of $96.676 billion, that is about 52.3 times free cash flow and a 1.91% trailing free-cash-flow yield. The calculation deliberately uses equity value rather than enterprise value and does not adjust for later issuance, repurchases, cash, debt, or investment marks.'
  },
  {
    id: 'nvda-push6-return-hurdle',
    support: 'partial',
    sources: [PRICE_SOURCE.key, 'fy26', 'q1'],
    text: 'A reverse-expectations test makes the burden visible. For the July 23 equity-value boundary to compound at 10% annually for five years, the ending equity value would need to be about $8.14 trillion before dividends. If the market then capitalized free cash flow at 25, 30, 35, or 40 times, NVIDIA would need approximately $325.5 billion, $271.2 billion, $232.5 billion, or $203.4 billion of year-five free cash flow. Relative to FY2026 free cash flow, those outcomes require roughly 27.5%, 22.9%, 19.2%, or 16.0% annual growth. These are scenario identities, not probability estimates.'
  },
  {
    id: 'nvda-push6-run-rate',
    support: 'partial',
    sources: ['fy26', 'q1'],
    text: 'The valuation debate turns on the correct cash-flow base. Q1 FY2027 produced a calculated $48.587 billion of free cash flow; mechanically multiplying one quarter by four gives $194.348 billion, but that is a sensitivity boundary, not a forecast. From that annualized boundary, the same year-five free-cash-flow requirements imply only about 10.9%, 6.9%, 3.6%, or 0.9% annual growth across the 25-to-40-times terminal range. The enormous difference from the FY2026-based hurdle means the key question is whether Q1 cash generation represents a durable operating plateau, a temporary working-capital peak, or an early point on a still-rising curve.'
  },
  {
    id: 'nvda-push6-decision',
    support: 'partial',
    sources: [PRICE_SOURCE.key, 'fy26', 'q1'],
    text: 'The current evidence therefore supports a high-quality company at a price that leaves little room for an ordinary outcome. A defensible favorable case requires the Q1 cash-flow step-up to persist, system economics to protect margins as alternatives improve, and capital commitments to convert into shipped and paid-for useful work without progressively larger ecosystem financing. The dossier does not yet establish a single expected return because it lacks probability weights, a normalized cash-flow base, and a justified exit multiple. That is the honest boundary: the business case is strong; the security-level conclusion remains conditional.'
  }
]);

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '');
const nodeText = node => [node?.text || '', ...((node?.content || []).map(nodeText))].join('');
const headingText = node => node?.type === 'heading' ? clean(nodeText(node)) : '';
const sourceKey = source => clean(source?.metadata?.evidenceKey || source?.citationLabel).toLowerCase();

const sourceIndex = (candidate, key) => {
  const index = candidate.sourceRefs.findIndex(source => sourceKey(source) === clean(key).toLowerCase());
  if (index < 0) throw new Error(`Missing source ${key}.`);
  return index + 1;
};

const sourceRecord = (candidate, key) => {
  const source = candidate.sourceRefs.find(row => sourceKey(row) === clean(key).toLowerCase());
  if (!source) throw new Error(`Missing source ${key}.`);
  const citation = candidate.citations.find(row => id(row.sourceRefId) === id(source._id));
  if (!citation) throw new Error(`Missing citation for source ${key}.`);
  return { source, citation };
};

const ensurePriceSource = ({ candidate, now }) => {
  const existing = candidate.sourceRefs.filter(source => sourceKey(source) === PRICE_SOURCE.key);
  if (existing.length > 1) throw new Error('Duplicate Push 6 price sources exist.');
  if (existing.length === 1) return false;
  const sourceId = new mongoose.Types.ObjectId().toString();
  const citationId = new mongoose.Types.ObjectId().toString();
  candidate.sourceRefs.push({
    _id: sourceId,
    type: PRICE_SOURCE.type,
    title: PRICE_SOURCE.title,
    snippet: PRICE_SOURCE.snippet,
    url: PRICE_SOURCE.url,
    citationLabel: PRICE_SOURCE.key,
    provider: PRICE_SOURCE.provider,
    metadata: {
      evidenceKey: PRICE_SOURCE.key,
      asOf: RESEARCH_AS_OF.toISOString(),
      marketSnapshot: true,
      maintenanceClockEligible: false,
      price: MARKET.price,
      currency: 'USD'
    },
    addedBy: 'user',
    createdAt: now
  });
  candidate.citations.push({
    _id: citationId,
    sourceRefId: sourceId,
    sourceType: PRICE_SOURCE.type,
    sourceTitle: PRICE_SOURCE.title,
    quote: PRICE_SOURCE.snippet,
    url: PRICE_SOURCE.url,
    confidence: 0.9,
    createdAt: now
  });
  return true;
};

const rewriteOpeningClaim = ({ candidate, rewrite, now }) => {
  const claim = candidate.claims.find(row => row.claimId === rewrite.id);
  if (!claim) throw new Error(`Missing rewrite target ${rewrite.id}.`);
  const extra = rewrite.addSources.map(key => sourceRecord(candidate, key));
  claim.text = rewrite.text;
  claim.support = rewrite.support;
  claim.confidence = 0.78;
  claim.lastReviewedAt = now;
  claim.lastVerifiedAt = now;
  claim.sourceRefIds = Array.from(new Set([...(claim.sourceRefIds || []).map(id), ...extra.map(row => id(row.source._id))]));
  claim.citationIds = Array.from(new Set([...(claim.citationIds || []).map(id), ...extra.map(row => id(row.citation._id))]));
  claim.history = [{
    at: now,
    event: 'edited',
    support: rewrite.support,
    text: rewrite.text,
    section: 'Investor brief',
    citationIds: claim.citationIds,
    sourceRefIds: claim.sourceRefIds,
    contradictedByCitationIds: claim.contradictedByCitationIds || [],
    summary: 'Push 6 separated business quality from security attractiveness and labeled the dated valuation inputs.'
  }, ...(claim.history || [])];
  let matched = false;
  candidate.body.content.forEach(node => {
    (node.content || []).forEach(child => {
      const mark = (child.marks || []).find(row => row.type === 'claim' && row.attrs?.claimId === rewrite.id);
      if (!mark) return;
      child.text = rewrite.text;
      mark.attrs.support = rewrite.support;
      mark.attrs.citationIndexes = Array.from(new Set([
        ...(mark.attrs.citationIndexes || []),
        ...rewrite.addSources.map(key => sourceIndex(candidate, key))
      ])).sort((a, b) => a - b);
      matched = true;
    });
  });
  if (!matched) throw new Error(`Missing body mark for rewrite ${rewrite.id}.`);
};

const claimNode = ({ candidate, claim }) => {
  const records = claim.sources.map(key => sourceRecord(candidate, key));
  return {
    ledger: {
      claimId: claim.id,
      text: claim.text,
      section: SECTION_HEADING,
      support: claim.support,
      confidence: claim.support === 'supported' ? 0.92 : 0.78,
      citationIds: records.map(row => id(row.citation._id)),
      sourceRefIds: records.map(row => id(row.source._id)),
      contradictedByCitationIds: [],
      history: []
    },
    body: {
      type: 'paragraph',
      content: [{
        type: 'text',
        text: claim.text,
        marks: [{
          type: 'claim',
          attrs: {
            claimId: claim.id,
            support: claim.support,
            citationIndexes: claim.sources.map(key => sourceIndex(candidate, key)),
            contradictionIndexes: []
          }
        }]
      }]
    }
  };
};

const insertValuationSection = ({ candidate, now }) => {
  const headings = candidate.body.content.map(headingText);
  if (headings.filter(heading => heading === SECTION_HEADING).length > 1) {
    throw new Error('Duplicate Push 6 valuation sections exist.');
  }
  if (headings.includes(SECTION_HEADING)) return 0;
  const questionsIndex = headings.findIndex(heading => heading === QUESTION_HEADING);
  if (questionsIndex < 0) throw new Error('Could not locate the thesis questions section.');
  const nodes = CLAIMS.map(claim => claimNode({ candidate, claim }));
  nodes.forEach(({ ledger }) => {
    ledger.lastReviewedAt = now;
    ledger.lastVerifiedAt = now;
    ledger.history = [{
      at: now,
      event: 'created',
      support: ledger.support,
      text: ledger.text,
      section: ledger.section,
      citationIds: ledger.citationIds,
      sourceRefIds: ledger.sourceRefIds,
      contradictedByCitationIds: [],
      summary: 'Push 6 added the reverse-expectations valuation layer.'
    }];
    candidate.claims.push(ledger);
  });
  candidate.body.content.splice(questionsIndex, 0,
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: SECTION_HEADING }] },
    ...nodes.map(row => row.body)
  );
  return nodes.length;
};

const applyPush = ({ page, now = new Date() }) => {
  const candidate = clone(page);
  candidate.sourceRefs = Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [];
  candidate.citations = Array.isArray(candidate.citations) ? candidate.citations : [];
  candidate.claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  candidate.body = candidate.body || { type: 'doc', content: [] };
  const alreadyComplete = candidate.body.content.some(node => headingText(node) === SECTION_HEADING)
    && CLAIMS.every(expected => candidate.claims.some(claim => claim.claimId === expected.id && clean(claim.text) === clean(expected.text)))
    && REWRITES.every(expected => candidate.claims.some(claim => claim.claimId === expected.id && clean(claim.text) === clean(expected.text)))
    && candidate.sourceRefs.some(source => sourceKey(source) === PRICE_SOURCE.key);
  if (alreadyComplete) return { candidate, changed: false, sourceAdded: false, claimsAdded: 0, claimsRewritten: 0 };
  const sourceAdded = ensurePriceSource({ candidate, now });
  REWRITES.forEach(rewrite => rewriteOpeningClaim({ candidate, rewrite, now }));
  const claimsAdded = insertValuationSection({ candidate, now });
  candidate.plainText = candidate.body.content.map(nodeText).map(clean).filter(Boolean).join('\n\n');
  candidate.freshness = { ...(candidate.freshness || {}), status: 'fresh', lastMaintainedAt: now };
  candidate.aiState = {
    ...(candidate.aiState || {}),
    lastDraftedAt: now,
    maintenanceSummary: 'Added a dated reverse-expectations valuation layer that separates NVIDIA’s business quality from the return burden embedded in the share price.',
    changeLog: [{
      type: 'editorial_revision',
      text: 'Push 6 added a July 23 market-value boundary, trailing free-cash-flow yield, five-year return hurdles, and a full-year-versus-Q1 run-rate sensitivity.',
      createdAt: now
    }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, changed: true, sourceAdded, claimsAdded, claimsRewritten: REWRITES.length };
};

const strictValidate = (page, { validateUpstream = true } = {}) => {
  const upstream = validateUpstream
    ? validatePush4Contract(page)
    : { ok: true, errors: [], claimCount: page.claims?.length || 0 };
  const errors = [...upstream.errors];
  const headings = (page.body?.content || []).map(headingText).filter(Boolean);
  if (headings.filter(heading => heading === SECTION_HEADING).length !== 1) errors.push('Valuation section must appear exactly once.');
  const introIndex = headings.indexOf('Investor brief');
  const valuationIndex = headings.indexOf(SECTION_HEADING);
  const questionsIndex = headings.indexOf(QUESTION_HEADING);
  if (!(introIndex >= 0 && introIndex < valuationIndex && valuationIndex < questionsIndex)) {
    errors.push('Valuation must appear between the investor brief and thesis questions.');
  }
  const questionList = (page.body?.content || []).find(node => (
    node.type === 'orderedList'
    && PUSH5_QUESTIONS.every(question => nodeText(node).includes(question))
  ));
  if (!questionList || (questionList.content || []).length !== PUSH5_QUESTIONS.length) {
    errors.push('Push 5 thesis-changing questions are missing or malformed.');
  }
  if ((page.sourceRefs || []).filter(source => sourceKey(source) === PRICE_SOURCE.key).length !== 1) {
    errors.push('Dated Nasdaq market source must appear exactly once.');
  }
  [...REWRITES, ...CLAIMS].forEach(expected => {
    const claim = (page.claims || []).find(row => row.claimId === expected.id);
    if (!claim || clean(claim.text) !== clean(expected.text)) errors.push(`${expected.id} is missing or not exact.`);
    if (claim?.support !== expected.support) errors.push(`${expected.id} has the wrong support state.`);
    if (!clean(page.plainText).includes(clean(expected.text))) errors.push(`${expected.id} is missing from plain text.`);
  });
  const requiredNumbers = ['$5.05 trillion', '52.3 times', '1.91%', '$271.2 billion', '22.9%', '$194.348 billion', '6.9%'];
  requiredNumbers.forEach(value => {
    if (!clean(page.plainText).includes(value)) errors.push(`Valuation layer omits ${value}.`);
  });
  return { ...upstream, ok: errors.length === 0, errors };
};

const summarize = page => ({
  id: id(page),
  title: page.title,
  status: page.status,
  visibility: page.visibility,
  words: clean(page.plainText).split(/\s+/).filter(Boolean).length,
  sources: page.sourceRefs?.length || 0,
  claims: page.claims?.length || 0,
  acceptedThrough: page.freshness?.acceptedThrough || null,
  publicProof: page.publicProof || null,
  headHash: buildPublicProofHeadHash(page)
});

const writeJson = (name, payload) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const target = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return target;
};

const assignCandidate = (page, candidate) => {
  Object.entries(candidate).forEach(([key, value]) => {
    if (['_id', 'id', 'userId', 'createdAt', 'updatedAt', '__v', 'publicProof'].includes(key)) return;
    page[key] = clone(value);
    page.markModified(key);
  });
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const page = await WikiPage.findById(PAGE_ID);
  if (!page || page.status !== 'published' || page.visibility !== 'shared'
    || page.externalWatches?.edgar?.ticker !== 'NVDA' || page.publicProof?.grade !== 'proven') {
    throw new Error('Target must be the published, shared, explicitly proven NVDA dossier.');
  }
  const before = snapshotPage(page);
  const push = applyPush({ page: page.toObject({ virtuals: false }) });
  if (!push.changed) {
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', idempotent: true, page: summarize(page) }, null, 2));
    return;
  }
  const strict = strictValidate(push.candidate);
  if (!strict.ok) throw new Error(`Strict proof validation failed: ${JSON.stringify(strict.errors)}`);
  const quality = evaluateWikiArticleQuality({
    page: push.candidate,
    body: push.candidate.body,
    claims: push.candidate.claims,
    sourceRefs: push.candidate.sourceRefs,
    now: new Date()
  });
  if (!quality.ok) throw new Error(`Quality gate failed: ${JSON.stringify(quality)}`);
  const comparison = compareClaimLedgers({ beforeClaims: before.claims, afterClaims: push.candidate.claims, outcome: 'accepted' });
  if (JSON.stringify(before.freshness?.acceptedThrough) !== JSON.stringify(push.candidate.freshness?.acceptedThrough)) {
    throw new Error('Push 6 must not advance or rewrite the SEC accepted-through clock.');
  }
  if ((push.candidate.sourceRefs || []).length !== (before.sourceRefs || []).length + 1) {
    throw new Error('Push 6 must add exactly one dated market source.');
  }
  if ((push.candidate.claims || []).length !== (before.claims || []).length + CLAIMS.length) {
    throw new Error('Push 6 must add exactly four valuation claims.');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preview = {
    mode: APPLY ? 'apply' : 'dry-run',
    idempotent: false,
    before: summarize(page),
    after: summarize(push.candidate),
    sourceAdded: push.sourceAdded,
    claimsAdded: push.claimsAdded,
    claimsRewritten: push.claimsRewritten,
    market: MARKET,
    scenarios: SCENARIOS,
    quality,
    strict,
    comparison: comparison.counts,
    researchAsOf: RESEARCH_AS_OF,
    invariants: {
      secAcceptedThroughPreserved: true,
      exactlyOneMarketSourceAdded: true,
      exactlyFourClaimsAdded: true
    }
  };
  const dryRunPath = writeJson(`dry-run-${stamp}.json`, preview);
  const comparisonPath = writeJson(`comparison-${stamp}.json`, comparison);
  if (!APPLY) {
    console.log(JSON.stringify({ ...preview, dryRunPath, comparisonPath }, null, 2));
    return;
  }
  const beforePath = writeJson(`before-${stamp}.json`, {
    capturedAt: new Date().toISOString(),
    page: page.toObject({ virtuals: false }),
    preview
  });
  const researchEvent = new WikiSourceEvent({
    userId: page.userId,
    sourceType: 'external',
    provider: 'nvidia-implied-expectations-review',
    externalId: `nvidia-implied-expectations-push6:${RESEARCH_AS_OF.toISOString()}`,
    eventType: 'updated',
    title: 'NVIDIA implied-expectations valuation review',
    summary: 'Added a dated market-value boundary and reverse-expectations scenarios without advancing the SEC maintenance clock.',
    text: 'The review separates business quality from security attractiveness, labels the market input, and shows the free-cash-flow outcomes required for a five-year 10% return across terminal multiples.',
    url: PRICE_SOURCE.url,
    sourceUpdatedAt: RESEARCH_AS_OF,
    status: 'processed',
    affectedPageIds: [page._id],
    processedAt: new Date(),
    metadata: {
      source: 'nvidia-implied-expectations-review',
      researchRevision: true,
      maintenanceClockEligible: false,
      asOf: RESEARCH_AS_OF,
      marketSnapshot: true,
      price: MARKET.price
    }
  });
  await researchEvent.save();
  assignCandidate(page, push.candidate);
  page.aiState.quality = quality;
  page.markModified('aiState');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision,
    userId: page.userId,
    page,
    before,
    after: snapshotPage(page),
    reason: 'source_event',
    actorType: 'agent',
    sourceEventId: researchEvent._id,
    promotionStatus: 'promoted',
    sourceVersion: {
      provider: 'nasdaq',
      asOf: RESEARCH_AS_OF,
      sourceCount: 1,
      marketSnapshot: true,
      maintenanceClockEligible: false,
      price: MARKET.price
    },
    quality: { ...quality, strict, comparison },
    summary: 'Added NVIDIA’s dated valuation boundary, reverse-expectations hurdles, and full-year-versus-Q1 cash-flow sensitivity.'
  });
  const clock = before.publicProof?.acceptedClocks?.find(row => row.type === 'sec_edgar');
  if (!clock) throw new Error('The existing proven record has no SEC clock.');
  const [clockEvent, clockRevision] = await Promise.all([
    WikiSourceEvent.findById(clock.sourceEventId),
    WikiRevision.findById(clock.revisionId)
  ]);
  if (!clockEvent || !clockRevision) throw new Error('The existing accepted SEC clock cannot be resolved.');
  const acceptance = buildSecPublicProofAcceptance({
    page,
    requestedClocks: [{ sourceEventId: clockEvent._id, revisionId: clockRevision._id }],
    events: [clockEvent],
    revisions: [clockRevision, revision],
    acceptedHeadRevision: revision,
    comparison,
    researchAsOf: RESEARCH_AS_OF,
    identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ },
    reason: 'The accepted SEC clock remains unchanged; Push 6 adds a dated, non-clock market input and binds the proven head to a reverse-expectations valuation layer.',
    now: new Date()
  });
  if (!acceptance.ok) throw new Error(`Head-bound acceptance failed: ${acceptance.errors.join(' ')}`);
  page.publicProof = acceptance.record;
  page.markModified('publicProof');
  await page.save();
  const result = {
    ...preview,
    mode: 'apply',
    page: summarize(page),
    researchEventId: id(researchEvent),
    revisionId: id(revision),
    acceptedHeadRevisionId: acceptance.record.acceptanceSnapshot.revisionId,
    beforePath,
    dryRunPath,
    comparisonPath,
    acceptanceInvariants: {
      secClockRevisionPreserved: acceptance.record.acceptedClocks.some(row => row.type === 'sec_edgar' && row.revisionId === id(clockRevision)),
      currentHeadBound: acceptance.record.acceptanceSnapshot.headContentHash === buildPublicProofHeadHash(page),
      marketEventClockEligible: false
    },
    rollback: {
      pageId: id(page),
      researchEventId: id(researchEvent),
      revisionId: id(revision),
      restoreSnapshotFrom: beforePath
    }
  };
  const resultPath = writeJson(`result-${stamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) main()
  .catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_error) {
      // Best-effort disconnect.
    }
  });

module.exports = {
  APPLY,
  CLAIMS,
  MARKET,
  PRICE_SOURCE,
  RESEARCH_AS_OF,
  REWRITES,
  SCENARIOS,
  SECTION_HEADING,
  applyPush,
  strictValidate
};
