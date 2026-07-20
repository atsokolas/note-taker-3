#!/usr/bin/env node
const mongoose = require('mongoose');
const { WikiPage, WikiRevision, WikiSourceEvent } = require('../server/models');
const { compareClaimLedgers } = require('../server/services/wikiClaimComparisonService');
const { buildPublicProofHeadHash } = require('../server/services/publicProofHeadService');
const { buildSecPublicProofAcceptance } = require('../server/services/wikiPublicProofAcceptanceService');
const { createWikiRevision, snapshotPage } = require('../server/services/wikiRevisionService');

const PAGE_ID = '6a5d225cd00276de99a7d168';
const BAD_URL = 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000051/nvda-20260426.htm';
const CORRECT_URL = 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000051/nvda-20260520.htm';
const APPLY = process.argv.includes('--apply');

const id = value => String(value?._id || value?.id || value || '');
const summary = page => ({
  pageId: id(page),
  words: String(page.plainText || '').trim().split(/\s+/).filter(Boolean).length,
  sources: page.sourceRefs?.length || 0,
  claims: page.claims?.length || 0,
  grade: page.publicProof?.grade || '',
  headHash: buildPublicProofHeadHash(page),
  acceptedHeadHash: page.publicProof?.acceptanceSnapshot?.headContentHash || ''
});

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const page = await WikiPage.findById(PAGE_ID);
  if (!page || page.status !== 'published' || page.visibility !== 'shared' || page.publicProof?.grade !== 'proven') {
    throw new Error('Target must be the published, shared, proven NVIDIA dossier.');
  }
  const bad = page.sourceRefs.filter(source => source.url === BAD_URL);
  const correct = page.sourceRefs.filter(source => source.url === CORRECT_URL);
  if (!bad.length && correct.length === 1) {
    const state = summary(page);
    if (state.headHash !== state.acceptedHeadHash) throw new Error('Correct URL exists, but the public proof head is not accepted.');
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', idempotent: true, page: state }, null, 2));
    return;
  }
  if (bad.length !== 1 || correct.length) throw new Error('Expected exactly one bad Q1 FY2027 8-K reference and no corrected duplicate.');

  const sourceId = id(bad[0]._id);
  const citedClaims = page.claims.filter(claim => (claim.sourceRefIds || []).some(value => id(value) === sourceId));
  const preview = {
    mode: APPLY ? 'apply' : 'dry-run',
    idempotent: false,
    before: summary(page),
    source: { id: sourceId, title: bad[0].title, from: BAD_URL, to: CORRECT_URL },
    citedClaimCount: citedClaims.length
  };
  if (!APPLY) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  const before = snapshotPage(page);
  bad[0].url = CORRECT_URL;
  page.markModified('sourceRefs');
  await page.save();
  const correctionEvent = new WikiSourceEvent({
    userId: page.userId,
    sourceType: 'external',
    provider: 'sec-edgar-correction',
    externalId: 'nvda-q1-fy2027-8k-primary-document-url-correction',
    eventType: 'updated',
    title: 'Corrected NVIDIA Q1 FY2027 earnings Form 8-K primary document URL',
    summary: 'Replaced a nonexistent SEC primary-document path with the filing’s actual May 20, 2026 Form 8-K document URL.',
    text: 'The filing accession was correct, but the primary-document filename incorrectly used the quarter-end date. SEC’s filing identifies nvda-20260520.htm as the Form 8-K primary document.',
    url: CORRECT_URL,
    sourceUpdatedAt: new Date('2026-05-20T00:00:00.000Z'),
    status: 'processed',
    affectedPageIds: [page._id],
    processedAt: new Date(),
    metadata: { source: 'sec-edgar-correction', maintenanceClockEligible: false, correctedSourceRefId: sourceId }
  });
  await correctionEvent.save();
  const comparison = compareClaimLedgers({ beforeClaims: before.claims, afterClaims: page.claims, outcome: 'accepted' });
  const revision = await createWikiRevision({
    WikiRevision,
    userId: page.userId,
    page,
    before,
    after: snapshotPage(page),
    reason: 'source_event',
    actorType: 'agent',
    sourceEventId: correctionEvent._id,
    promotionStatus: 'promoted',
    sourceVersion: { provider: 'sec-edgar-correction', url: CORRECT_URL, maintenanceClockEligible: false },
    quality: { comparison, citedClaimCount: citedClaims.length },
    summary: 'Corrected the dead NVIDIA Q1 FY2027 Form 8-K primary-document URL without changing the dossier’s claims or filing clock.'
  });

  const clock = before.publicProof?.acceptedClocks?.find(row => row.type === 'sec_edgar');
  if (!clock) throw new Error('Existing NVIDIA acceptance has no SEC clock.');
  const [clockEvent, clockRevision] = await Promise.all([
    WikiSourceEvent.findById(clock.sourceEventId),
    WikiRevision.findById(clock.revisionId)
  ]);
  if (!clockEvent || !clockRevision) throw new Error('Existing accepted SEC clock cannot be resolved.');
  const acceptance = buildSecPublicProofAcceptance({
    page,
    requestedClocks: [{ sourceEventId: clockEvent._id, revisionId: clockRevision._id }],
    events: [clockEvent],
    revisions: [clockRevision, revision],
    acceptedHeadRevision: revision,
    comparison,
    researchAsOf: before.publicProof?.acceptanceSnapshot?.researchAsOf || null,
    identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ },
    reason: 'The historical SEC clock remains pinned to the June 2026 filing; this accepted head corrects a dead Q1 FY2027 SEC primary-document URL without changing any claim.',
    now: new Date()
  });
  if (!acceptance.ok) throw new Error(`Head-bound acceptance failed: ${acceptance.errors.join(' ')}`);
  page.publicProof = acceptance.record;
  page.markModified('publicProof');
  await page.save();
  const after = summary(page);
  if (after.headHash !== after.acceptedHeadHash) throw new Error('Corrected page is not bound to its accepted head.');
  console.log(JSON.stringify({
    ...preview,
    mode: 'apply',
    correctionEventId: id(correctionEvent),
    revisionId: id(revision),
    after,
    invariants: {
      claimCountPreserved: before.claims.length === page.claims.length,
      sourceCountPreserved: before.sourceRefs.length === page.sourceRefs.length,
      acceptedSecClockPreserved: acceptance.record.acceptedClocks.some(row => row.type === 'sec_edgar' && row.revisionId === id(clockRevision)),
      exactHeadAccepted: after.headHash === after.acceptedHeadHash
    }
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
  });
