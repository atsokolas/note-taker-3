const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  OPENCLAW_AFTERNOON_RESEARCH_JOB_ID,
  buildWeekendReadingsIntake,
  loadPriorWeekendReadingsUrls,
  parseAutomationMemory,
  validateOpenClawHandoff
} = require('./weekendReadingsIntakeService');

const openClawHandoff = () => ({
  schemaVersion: '1',
  generatedAt: '2026-07-19T20:00:00.000Z',
  sourceJobId: OPENCLAW_AFTERNOON_RESEARCH_JOB_ID,
  signalQuality: 'high',
  takeaway: 'Industrial automation evidence was unusually decision-relevant.',
  items: [
    {
      externalId: 'paper-1',
      title: 'Industrial load flexibility',
      canonicalUrl: 'https://example.com/paper?a=1&utm_source=jarvis',
      sourceLabel: 'Example Journal',
      publishedAt: '2026-07-18',
      summary: 'A bounded empirical study.',
      whyItMatters: 'It tests whether flexible industrial loads can monetize grid constraints.',
      lanes: ['electrification', 'public_equity'],
      proposedEvidenceRole: 'support',
      proposedThesisRefs: ['Living Thesis 001'],
      requiresHumanAcceptance: true
    },
    {
      externalId: 'paper-2',
      title: 'Automation countercase',
      canonicalUrl: 'https://example.org/countercase',
      sourceLabel: 'Example Institute',
      summary: 'A countercase on integration costs.',
      whyItMatters: 'It challenges margin expansion assumptions.',
      lanes: ['automation'],
      proposedEvidenceRole: 'counterevidence',
      proposedThesisRefs: [],
      requiresHumanAcceptance: true
    },
    {
      externalId: 'paper-3',
      title: 'Broad systems history',
      canonicalUrl: 'https://history.example.net/system',
      sourceLabel: 'History Review',
      summary: 'A history of industrial coordination.',
      whyItMatters: 'It broadens the institutional analogy.',
      lanes: ['institutions'],
      proposedEvidenceRole: 'broadening',
      proposedThesisRefs: [],
      requiresHumanAcceptance: true
    }
  ]
});

const signedArtifact = (sourceRefs = []) => {
  const artifact = {
    artifactType: 'weekend_readings',
    editionKey: 'weekend-readings:owner-a:2026-07-01:2026-07-14',
    revisionId: 'revision-1',
    title: 'Weekend Readings',
    body: {
      type: 'doc',
      content: sourceRefs.map(source => ({
        type: 'paragraph',
        content: [{ type: 'text', text: source.url, marks: [{ type: 'link', attrs: { href: source.url } }] }]
      }))
    },
    sourceRefs
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
  return { ...artifact, digest };
};

test('validates OpenClaw handoff and preserves private producer provenance', () => {
  const validated = validateOpenClawHandoff(openClawHandoff(), { sourceName: '/private/path/2026-07-19.json' });
  assert.equal(validated.items.length, 3);
  assert.equal(validated.items[0].canonicalUrl, 'https://example.com/paper?a=1');
  assert.equal(validated.items[0].provenance[0].sourceName, '2026-07-19.json');
  assert.equal(validated.items[0].provenance[0].sourceJobId, OPENCLAW_AFTERNOON_RESEARCH_JOB_ID);
  assert.equal(validated.items[0].requiresHumanAcceptance, true);
});

test('rejects malformed, unsafe, duplicate, or auto-accepted OpenClaw handoffs', () => {
  const tooShort = openClawHandoff();
  tooShort.items = tooShort.items.slice(0, 2);
  assert.throws(() => validateOpenClawHandoff(tooShort), /3-5 items/);

  const duplicate = openClawHandoff();
  duplicate.items[1].canonicalUrl = 'https://EXAMPLE.com/paper?utm_campaign=x&a=1#duplicate';
  assert.throws(() => validateOpenClawHandoff(duplicate), /duplicate canonical URL/);

  const secret = openClawHandoff();
  secret.items[0].canonicalUrl = 'https://example.com/paper?accessToken=SECRET';
  assert.throws(() => validateOpenClawHandoff(secret), /sensitive query parameter/);

  const autoAccepted = openClawHandoff();
  autoAccepted.items[0].requiresHumanAcceptance = false;
  assert.throws(() => validateOpenClawHandoff(autoAccepted), /requiresHumanAcceptance=true/);

  const missingArrays = openClawHandoff();
  delete missingArrays.items[0].lanes;
  assert.throws(() => validateOpenClawHandoff(missingArrays), /requires lanes and proposedThesisRefs arrays/);
});

test('parses dated Sunday and Friday URL memories without inventing missing editorial fields', () => {
  const sunday = parseAutomationMemory({
    sourceKind: 'sunday_reading_sweep',
    sourceName: 'memory.md',
    windowStart: '2026-07-13',
    windowEnd: '2026-07-19',
    text: [
      '## 2026-07-12 run',
      '1. Old item - https://old.example.com',
      '## 2026-07-19 run',
      '1. Construction and automation - https://EXAMPLE.com/report/?utm_source=email#top'
    ].join('\n')
  });
  assert.equal(sunday.items.length, 1);
  assert.equal(sunday.items[0].title, 'Construction and automation');
  assert.equal(sunday.items[0].canonicalUrl, 'https://example.com/report');
  assert.equal(sunday.items[0].whyItMatters, '');
  assert.equal(sunday.items[0].requiresHumanAcceptance, true);

  const papers = parseAutomationMemory({
    sourceKind: 'friday_research_papers',
    sourceName: 'memory.md',
    windowStart: '2026-07-13',
    windowEnd: '2026-07-19',
    text: 'Last updated: 2026-07-17 07:34:20 CDT\nFinal list contained 13 direct links.'
  });
  assert.equal(papers.items.length, 0);
  assert.match(papers.warnings[0], /does not preserve item URLs/);
});

test('dedupes across producers, preserves every provenance receipt, and excludes prior editions', () => {
  const handoff = openClawHandoff();
  const preview = buildWeekendReadingsIntake({
    openClawHandoffs: [{ sourceName: '2026-07-19.json', payload: handoff }],
    automationMemories: [{
      sourceKind: 'sunday_reading_sweep',
      sourceName: 'memory.md',
      windowStart: '2026-07-13',
      windowEnd: '2026-07-19',
      text: '## 2026-07-19 run\n1. Same paper - https://example.com/paper?a=1&utm_medium=email\n2. Prior - https://prior.example.com/item'
    }],
    priorEditionUrls: ['https://PRIOR.example.com/item#published']
  });
  assert.equal(preview.summary.sourceItemCount, 5);
  assert.equal(preview.summary.duplicateCount, 1);
  assert.equal(preview.summary.priorEditionExcludedCount, 1);
  assert.equal(preview.candidates.length, 3);
  const merged = preview.candidates.find(item => item.canonicalUrl === 'https://example.com/paper?a=1');
  assert.equal(merged.intakeProvenance.length, 2);
  assert.equal(merged.readingRole, 'thesis_evidence');
  assert.equal(merged.accepted, false);
  assert.equal(merged.requiresHumanAcceptance, true);
  assert.ok(merged.needsHumanFields.includes('sourceQuality'));
});

test('loads only digest-valid, owner-scoped published edition URLs and fails closed on broken history', async () => {
  const artifact = signedArtifact([{ url: 'https://example.com/already-published' }]);
  const publication = {
    receiptId: 'publication-1',
    kind: 'weekend_readings_revision_published',
    status: 'published',
    provenance: {
      approvalReceiptId: 'approval-1',
      pageId: 'page-1',
      revisionId: 'revision-1',
      editionKey: artifact.editionKey,
      digest: artifact.digest
    }
  };
  const approval = {
    receiptId: 'approval-1',
    kind: 'weekend_readings_revision_approved',
    status: 'approved',
    provenance: {
      pageId: 'page-1',
      revisionId: 'revision-1',
      editionKey: artifact.editionKey,
      digest: artifact.digest,
      publicArtifact: artifact
    }
  };
  const queries = [];
  const NoeisReceipt = {
    find(query) {
      queries.push(query);
      return { lean: async () => query.kind === 'weekend_readings_revision_published' ? [publication] : [approval] };
    }
  };
  assert.deepEqual(await loadPriorWeekendReadingsUrls({ NoeisReceipt, userId: 'owner-a' }), ['https://example.com/already-published']);
  assert.equal(queries.length, 2);
  assert.equal(queries[0].userId, 'owner-a');
  assert.equal(queries[1].userId, 'owner-a');

  approval.provenance.publicArtifact.sourceRefs[0].url = 'https://example.com/tampered';
  await assert.rejects(() => loadPriorWeekendReadingsUrls({ NoeisReceipt, userId: 'owner-a' }), /failed closed/);
});

test('published history rejects missing digest and cross-edition or revision chains', async () => {
  const artifact = signedArtifact([{ url: 'https://example.com/already-published' }]);
  const publication = {
    receiptId: 'publication-1',
    kind: 'weekend_readings_revision_published',
    status: 'published',
    provenance: {
      approvalReceiptId: 'approval-1',
      pageId: 'page-1',
      revisionId: 'revision-1',
      editionKey: artifact.editionKey,
      digest: artifact.digest
    }
  };
  const approval = {
    receiptId: 'approval-1',
    kind: 'weekend_readings_revision_approved',
    status: 'approved',
    provenance: {
      pageId: 'page-1',
      revisionId: 'revision-1',
      editionKey: artifact.editionKey,
      digest: artifact.digest,
      publicArtifact: artifact
    }
  };
  const NoeisReceipt = {
    find(query) {
      return { lean: async () => query.kind === 'weekend_readings_revision_published' ? [publication] : [approval] };
    }
  };
  delete publication.provenance.digest;
  await assert.rejects(() => loadPriorWeekendReadingsUrls({ NoeisReceipt, userId: 'owner-a' }), /failed closed/);
  publication.provenance.digest = artifact.digest;
  publication.provenance.editionKey = 'weekend-readings:owner-a:2026-07-15:2026-07-28';
  await assert.rejects(() => loadPriorWeekendReadingsUrls({ NoeisReceipt, userId: 'owner-a' }), /failed closed/);
  publication.provenance.editionKey = artifact.editionKey;
  artifact.revisionId = 'revision-crossed';
  artifact.digest = crypto.createHash('sha256').update(JSON.stringify({ ...artifact, digest: undefined })).digest('hex');
  approval.provenance.digest = artifact.digest;
  publication.provenance.digest = artifact.digest;
  await assert.rejects(() => loadPriorWeekendReadingsUrls({ NoeisReceipt, userId: 'owner-a' }), /failed closed/);
});
