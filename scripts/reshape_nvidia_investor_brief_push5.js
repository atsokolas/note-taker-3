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
const { strictValidate: validatePush4Contract } = require('./enrich_nvidia_matched_workload_push4');

const PAGE_ID = process.env.NVIDIA_PROOF_PAGE_ID || '6a5d225cd00276de99a7d168';
const OUTPUT_DIR = path.resolve(process.env.NVIDIA_PUSH5_OUTPUT || path.join(process.cwd(), 'output', 'nvidia-investor-brief-push5-2026-07-20'));
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';
const RESEARCH_AS_OF = new Date('2026-07-20T23:59:59.000Z');

const HEADINGS = Object.freeze({
  oldIntro: 'The underwriting question',
  intro: 'Investor brief',
  questions: 'Five questions that decide the thesis',
  matched: 'A matched case: where the platform moat has to earn its premium',
  decision: 'The decision surface: where should NVIDIA lose?',
  usefulWork: 'The unit that matters: cost per accepted unit of work',
  workload: 'Workload boundaries, not one AI-compute market'
});

const REWRITES = Object.freeze([
  {
    id: 'nvda-thesis-348e7670',
    support: 'partial',
    text: 'Current judgment. NVIDIA’s demand and operating engine are exceptional. The unresolved question is whether its system-level economic advantage can outrun the forward supply commitments, customer concentration, export-control constraints, and capital recycling required to sustain it. Those obligations can reinforce the platform while demand compounds; they make the downside nonlinear if customer build-outs slow or alternative accelerators absorb enough workloads. The thesis is therefore not merely that AI demand remains strong. It is that NVIDIA retains enough system-level advantage to earn an attractive return on the obligations created by that demand.'
  },
  {
    id: 'nvda-method-bfbaf8b2',
    support: 'partial',
    text: 'Evidence status. Reported revenue, margins, cash flow, commitments, concentration, and security issuances come from NVIDIA’s SEC filings; free cash flow is calculated as operating cash flow less property-and-equipment purchases and is not a company-reported GAAP measure. This is a labeled historical maintenance backtest: the FY2026 10-K is the reconstructed baseline, the Q1 FY2027 filing is the operating update, and the June 2026 debt filing is the accepted-through balance-sheet event. It does not claim that Noeis observed those events in real time.'
  }
]);

const QUESTIONS = Object.freeze([
  'Does NVIDIA retain a production economic advantage after alternative price, utilization, measured power, reliability, porting labor, and deployment delay are counted on the same workload?',
  'Does CUDA and the surrounding workflow capital still shorten time to production as frameworks and model-serving layers abstract more hardware differences?',
  'Does NVIDIA retain networking and system attach when hyperscalers deploy custom accelerators, heterogeneous racks, and open scale-up or scale-out fabrics?',
  'Do supply commitments and strategic investments secure durable demand, or do they become capital recycling and stranded-capacity exposure when customer build-outs normalize?',
  'Does customer concentration decline as adoption broadens, or does buyer power increase as the largest customers gain internal-silicon substitutes?'
]);

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '');
const nodeText = node => [node?.text || '', ...((node?.content || []).map(nodeText))].join('');
const headingText = node => node?.type === 'heading' ? clean(nodeText(node)) : '';

const questionList = () => ({
  type: 'orderedList',
  content: QUESTIONS.map(question => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: question }] }]
  }))
});

const rewriteClaim = ({ candidate, rewrite, now }) => {
  const claim = candidate.claims.find(row => row.claimId === rewrite.id);
  if (!claim) throw new Error(`Missing rewrite target ${rewrite.id}.`);
  const priorText = claim.text;
  claim.text = rewrite.text;
  claim.support = rewrite.support;
  claim.confidence = 0.78;
  claim.lastReviewedAt = now;
  claim.lastVerifiedAt = now;
  claim.history = [{
    at: now, event: 'edited', support: rewrite.support, text: rewrite.text, section: HEADINGS.intro,
    citationIds: claim.citationIds || [], sourceRefIds: claim.sourceRefIds || [], contradictedByCitationIds: claim.contradictedByCitationIds || [],
    summary: 'Push 5 compressed the opening into an investor-first current judgment and evidence-status statement.'
  }, ...(claim.history || [])];
  claim.section = HEADINGS.intro;
  let bodyMatch = false;
  candidate.body.content.forEach(node => {
    (node.content || []).forEach(child => {
      const mark = (child.marks || []).find(row => row.type === 'claim' && row.attrs?.claimId === rewrite.id);
      if (!mark) return;
      child.text = rewrite.text;
      mark.attrs.support = rewrite.support;
      bodyMatch = true;
    });
  });
  if (!bodyMatch) throw new Error(`Missing body mark for rewrite ${rewrite.id}.`);
  return priorText !== rewrite.text;
};

const reshapeBody = candidate => {
  const content = candidate.body.content;
  const find = label => content.findIndex(node => headingText(node) === label);
  const intro = find(HEADINGS.oldIntro);
  const alreadyIntro = find(HEADINGS.intro);
  const decision = find(HEADINGS.decision);
  const usefulWork = find(HEADINGS.usefulWork);
  const matched = find(HEADINGS.matched);
  const workload = find(HEADINGS.workload);
  if (alreadyIntro >= 0 && find(HEADINGS.questions) >= 0 && alreadyIntro < matched && matched < decision && decision < usefulWork) {
    return false;
  }
  if ([intro, decision, usefulWork, matched, workload].some(index => index < 0)) {
    throw new Error('Could not locate the required Push 5 dossier sections.');
  }
  if (!(intro < decision && decision < usefulWork && usefulWork < matched && matched < workload)) {
    throw new Error('Unexpected pre-Push-5 dossier section order.');
  }
  content[intro].content[0].text = HEADINGS.intro;
  const prefix = content.slice(0, intro);
  const introSection = content.slice(intro, decision);
  const decisionSection = content.slice(decision, usefulWork);
  const usefulWorkSection = content.slice(usefulWork, matched);
  const matchedSection = content.slice(matched, workload);
  const rest = content.slice(workload);
  const questions = [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: HEADINGS.questions }] },
    questionList()
  ];
  candidate.body.content = [...prefix, ...introSection, ...questions, ...matchedSection, ...decisionSection, ...usefulWorkSection, ...rest];
  return true;
};

const applyPush = ({ page, now = new Date() }) => {
  const candidate = clone(page);
  candidate.claims = Array.isArray(candidate.claims) ? candidate.claims : [];
  candidate.body = candidate.body || { type: 'doc', content: [] };
  const complete = candidate.body.content.some(node => headingText(node) === HEADINGS.questions)
    && REWRITES.every(rewrite => candidate.claims.some(claim => claim.claimId === rewrite.id && clean(claim.text) === clean(rewrite.text)));
  if (complete) return { candidate, changed: false, rewrittenClaimCount: 0, questionsAdded: 0, reordered: false };
  const rewrittenClaimCount = REWRITES.reduce((count, rewrite) => count + (rewriteClaim({ candidate, rewrite, now }) ? 1 : 0), 0);
  const reordered = reshapeBody(candidate);
  candidate.plainText = candidate.body.content.map(nodeText).map(clean).filter(Boolean).join('\n\n');
  candidate.freshness = { ...(candidate.freshness || {}), status: 'fresh', lastMaintainedAt: now };
  candidate.aiState = {
    ...(candidate.aiState || {}), lastDraftedAt: now,
    maintenanceSummary: 'Reshaped the NVIDIA dossier into an investor-first brief, five decision questions, and a concrete-before-formula evidence sequence without changing the evidence set or SEC clock.',
    changeLog: [{
      type: 'editorial_revision',
      text: 'Push 5 surfaced the current judgment, five thesis-changing questions, and the matched workload case before the detailed diligence layer.',
      createdAt: now
    }, ...(candidate.aiState?.changeLog || [])]
  };
  return { candidate, changed: rewrittenClaimCount > 0 || reordered, rewrittenClaimCount, questionsAdded: QUESTIONS.length, reordered };
};

const strictValidate = (page, { validateUpstream = true } = {}) => {
  const upstream = validateUpstream
    ? validatePush4Contract(page)
    : { ok: true, errors: [], claimCount: page.claims?.length || 0 };
  const errors = [...upstream.errors];
  const headings = (page.body?.content || []).map(headingText).filter(Boolean);
  if (headings.includes(HEADINGS.oldIntro)) errors.push('Old underwriting heading remains.');
  for (const heading of [HEADINGS.intro, HEADINGS.questions, HEADINGS.matched, HEADINGS.decision, HEADINGS.usefulWork]) {
    if (!headings.includes(heading)) errors.push(`Missing heading: ${heading}`);
  }
  const indexes = Object.fromEntries(headings.map((heading, index) => [heading, index]));
  if (!(indexes[HEADINGS.intro] < indexes[HEADINGS.questions]
    && indexes[HEADINGS.questions] < indexes[HEADINGS.matched]
    && indexes[HEADINGS.matched] < indexes[HEADINGS.decision]
    && indexes[HEADINGS.decision] < indexes[HEADINGS.usefulWork])) {
    errors.push('Investor-first section order is incorrect.');
  }
  REWRITES.forEach(expected => {
    const claim = page.claims.find(row => row.claimId === expected.id);
    if (!claim || clean(claim.text) !== clean(expected.text)) errors.push(`${expected.id} is missing or not exact.`);
    if (claim?.support !== expected.support || claim?.section !== HEADINGS.intro) errors.push(`${expected.id} has the wrong support or section.`);
  });
  const list = (page.body?.content || []).find(node => node.type === 'orderedList' && QUESTIONS.every(question => nodeText(node).includes(question)));
  if (!list || (list.content || []).length !== QUESTIONS.length) errors.push('Five thesis questions are missing or malformed.');
  if (!QUESTIONS.every(question => clean(page.plainText).includes(clean(question)))) errors.push('Plain text omits one or more thesis questions.');
  return { ...upstream, ok: errors.length === 0, errors };
};

const summarize = page => ({
  id: id(page), title: page.title, status: page.status, visibility: page.visibility,
  words: clean(page.plainText).split(/\s+/).filter(Boolean).length,
  sources: page.sourceRefs?.length || 0, claims: page.claims?.length || 0,
  acceptedThrough: page.freshness?.acceptedThrough || null, publicProof: page.publicProof || null,
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
    page: push.candidate, body: push.candidate.body, claims: push.candidate.claims,
    sourceRefs: push.candidate.sourceRefs, now: new Date()
  });
  if (!quality.ok) throw new Error(`Quality gate failed: ${JSON.stringify(quality)}`);
  const comparison = compareClaimLedgers({ beforeClaims: before.claims, afterClaims: push.candidate.claims, outcome: 'accepted' });
  if (JSON.stringify(before.freshness?.acceptedThrough) !== JSON.stringify(push.candidate.freshness?.acceptedThrough)) {
    throw new Error('Push 5 must not advance or rewrite the SEC accepted-through clock.');
  }
  if ((before.sourceRefs || []).length !== (push.candidate.sourceRefs || []).length || (before.claims || []).length !== (push.candidate.claims || []).length) {
    throw new Error('Push 5 must not add or remove sources or claims.');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preview = {
    mode: APPLY ? 'apply' : 'dry-run', idempotent: false,
    before: summarize(page), after: summarize(push.candidate),
    rewrittenClaimCount: push.rewrittenClaimCount, questionsAdded: push.questionsAdded, reordered: push.reordered,
    quality, strict, comparison: comparison.counts, researchAsOf: RESEARCH_AS_OF,
    invariants: { sourceCountPreserved: true, claimCountPreserved: true, acceptedThroughPreserved: true }
  };
  const dryRunPath = writeJson(`dry-run-${stamp}.json`, preview);
  const comparisonPath = writeJson(`comparison-${stamp}.json`, comparison);
  if (!APPLY) {
    console.log(JSON.stringify({ ...preview, dryRunPath, comparisonPath }, null, 2));
    return;
  }
  const beforePath = writeJson(`before-${stamp}.json`, { capturedAt: new Date().toISOString(), page: page.toObject({ virtuals: false }), preview });
  const researchEvent = new WikiSourceEvent({
    userId: page.userId, sourceType: 'external', provider: 'nvidia-investor-brief-review',
    externalId: `nvidia-investor-brief-push5:${RESEARCH_AS_OF.toISOString()}`,
    eventType: 'updated', title: 'NVIDIA investor-brief editorial review',
    summary: 'An editorial pass moved the current judgment, five thesis-changing questions, and matched workload case ahead of the detailed evidence layer.',
    text: 'This editorial research revision adds no sources or claims, does not advance the SEC filing clock, and preserves the full diligence record.',
    url: 'https://www.noeis.io/share/wiki/6a5d225cd00276de99a7d168',
    sourceUpdatedAt: RESEARCH_AS_OF, status: 'processed', affectedPageIds: [page._id], processedAt: new Date(),
    metadata: { source: 'nvidia-investor-brief-review', researchRevision: true, maintenanceClockEligible: false, asOf: RESEARCH_AS_OF, editorialOnly: true }
  });
  await researchEvent.save();
  assignCandidate(page, push.candidate);
  page.aiState.quality = quality;
  page.markModified('aiState');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision, userId: page.userId, page, before, after: snapshotPage(page),
    reason: 'source_event', actorType: 'agent', sourceEventId: researchEvent._id, promotionStatus: 'promoted',
    sourceVersion: { provider: 'nvidia-investor-brief-review', asOf: RESEARCH_AS_OF, sourceCount: 0, researchRevision: true, maintenanceClockEligible: false, editorialOnly: true },
    quality: { ...quality, strict, comparison },
    summary: 'Reshaped the NVIDIA dossier into an investor-first brief, five decision questions, and a concrete-before-formula evidence sequence.'
  });
  const clock = before.publicProof?.acceptedClocks?.find(row => row.type === 'sec_edgar');
  if (!clock) throw new Error('The existing proven record has no SEC clock.');
  const [clockEvent, clockRevision] = await Promise.all([
    WikiSourceEvent.findById(clock.sourceEventId), WikiRevision.findById(clock.revisionId)
  ]);
  if (!clockEvent || !clockRevision) throw new Error('The existing accepted SEC clock cannot be resolved.');
  const acceptance = buildSecPublicProofAcceptance({
    page, requestedClocks: [{ sourceEventId: clockEvent._id, revisionId: clockRevision._id }],
    events: [clockEvent], revisions: [clockRevision, revision], acceptedHeadRevision: revision,
    comparison, researchAsOf: RESEARCH_AS_OF,
    identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ },
    reason: 'The SEC clock and evidence set remain unchanged; Push 5 makes the accepted head investor-first by surfacing the judgment, thesis-changing questions, and matched workload evidence before the detailed diligence layer.',
    now: new Date()
  });
  if (!acceptance.ok) throw new Error(`Head-bound acceptance failed: ${acceptance.errors.join(' ')}`);
  page.publicProof = acceptance.record;
  page.markModified('publicProof');
  await page.save();
  const result = {
    ...preview, mode: 'apply', page: summarize(page), researchEventId: id(researchEvent), revisionId: id(revision),
    acceptedHeadRevisionId: acceptance.record.acceptanceSnapshot.revisionId,
    beforePath, dryRunPath, comparisonPath,
    acceptanceInvariants: {
      secClockRevisionPreserved: acceptance.record.acceptedClocks.some(row => row.type === 'sec_edgar' && row.revisionId === id(clockRevision)),
      currentHeadBound: acceptance.record.acceptanceSnapshot.headContentHash === buildPublicProofHeadHash(page),
      researchEventClockEligible: false
    },
    rollback: { pageId: id(page), researchEventId: id(researchEvent), revisionId: id(revision), restoreSnapshotFrom: beforePath }
  };
  const resultPath = writeJson(`result-${stamp}.json`, result);
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
};

if (require.main === module) main()
  .catch(error => { console.error(error.stack || error.message); process.exitCode = 1; })
  .finally(async () => { try { await mongoose.disconnect(); } catch (_error) {} });

module.exports = { APPLY, HEADINGS, QUESTIONS, RESEARCH_AS_OF, REWRITES, applyPush, strictValidate };
