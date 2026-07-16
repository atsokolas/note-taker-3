#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  eventIsSubstantive,
  providerKind
} = require('../server/services/alphabetProofAcceptanceService');

const API_URL = process.env.NOEIS_API_URL || 'https://note-taker-3-unrg.onrender.com';
const USERNAME = process.env.NOEIS_USERNAME || process.env.NOEIS_QA_USERNAME || '';
const PASSWORD = process.env.NOEIS_PASSWORD || process.env.NOEIS_QA_PASSWORD || '';
const PAGE_ID = process.env.ALPHABET_PAGE_ID || '';
const ACCEPTANCE_REASON = process.env.ALPHABET_ACCEPTANCE_REASON
  || 'The authoritative SEC filing clock and its claim-level effects passed editorial review.';

const hasFlag = name => process.argv.includes(name);
const argValue = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const id = value => String(value?._id || value?.id || value || '').trim();
const list = value => (Array.isArray(value) ? value : []);
const sameId = (left, right) => Boolean(id(left) && id(left) === id(right));

const requestJson = async (pathname, { token = '', method = 'GET', body } = {}) => {
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; } catch (_error) { payload = raw; }
  if (!response.ok) {
    const error = new Error(`${method} ${pathname} failed: ${response.status} ${payload?.error || response.statusText}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const selectClockCandidates = ({ page = {}, events = [], revisions = [] } = {}) => {
  const pageId = id(page);
  const eligible = list(events)
    .filter(event => list(event.affectedPageIds).some(value => sameId(value, pageId)))
    .filter(event => eventIsSubstantive(event))
    .map(event => {
      const revision = list(revisions)
        .filter(row => sameId(row.pageId, pageId)
          && sameId(row.sourceEventId, event)
          && row.promotionStatus === 'promoted'
          && ['source_event', 'agent_maintenance'].includes(row.reason))
        .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))[0];
      return revision ? { event, revision, kind: providerKind(event) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.event.processedAt || right.event.createdAt || 0)
      - new Date(left.event.processedAt || left.event.createdAt || 0));

  const filing = eligible.find(candidate => candidate.kind === 'filing') || null;
  const transcript = eligible.find(candidate => candidate.kind === 'transcript') || null;
  return { filing, transcript };
};

const publicClock = candidate => candidate ? {
  sourceEventId: id(candidate.event),
  revisionId: id(candidate.revision),
  title: candidate.event.title || '',
  provider: candidate.event.provider || '',
  processedAt: candidate.event.processedAt || null
} : null;

const loadState = async token => {
  const [page, eventPayload, revisionPayload, registry] = await Promise.all([
    requestJson(`/api/wiki/pages/${encodeURIComponent(PAGE_ID)}`, { token }),
    requestJson('/api/wiki/source-events?limit=200', { token }),
    requestJson(`/api/wiki/pages/${encodeURIComponent(PAGE_ID)}/revisions?limit=200`, { token }),
    requestJson('/api/public/wiki/proof')
  ]);
  const events = eventPayload?.events || eventPayload || [];
  const revisions = revisionPayload?.revisions || revisionPayload || [];
  return { page, events, revisions, registry, clocks: selectClockCandidates({ page, events, revisions }) };
};

const readinessReport = state => {
  const page = state.page || {};
  const clocks = state.clocks || {};
  const gaps = [];
  if (!clocks.filing) gaps.push('No substantive SEC event has a promoted maintenance revision.');
  return {
    readyForAcceptancePreview: gaps.length === 0,
    page: {
      id: id(page),
      title: page.title || '',
      visibility: page.visibility || '',
      proofGrade: page.publicProof?.grade || '',
      acceptedThrough: page.freshness?.acceptedThrough || null,
      sourcePolicy: 'free_authoritative_sources_only'
    },
    clocks: { filing: publicClock(clocks.filing), transcript: publicClock(clocks.transcript) },
    gaps
  };
};

const acceptanceBody = clocks => ({
  acceptedClocks: [clocks.filing].filter(Boolean).map(candidate => ({
    sourceEventId: id(candidate.event),
    revisionId: id(candidate.revision)
  })),
  reason: ACCEPTANCE_REASON,
  publishAsFlagship: true
});

const writeReport = report => {
  const outputDir = path.resolve(argValue('--output', path.join('output', `alphabet-filing-acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}`)));
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, 'report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return reportPath;
};

const main = async () => {
  if (!USERNAME || !PASSWORD || !PAGE_ID) {
    throw new Error('Set NOEIS_USERNAME, NOEIS_PASSWORD, and ALPHABET_PAGE_ID.');
  }
  const auth = await requestJson('/api/auth/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD }
  });
  if (!auth?.token) throw new Error('Login returned no token.');
  const token = auth.token;
  const actions = [];
  let state = await loadState(token);

  if (hasFlag('--trigger-transcript')) {
    throw new Error('Paid transcript providers are disabled by the free-source policy.');
  }

  const readiness = readinessReport(state);
  let acceptancePreview = null;
  let acceptanceResult = null;
  if (readiness.readyForAcceptancePreview && (hasFlag('--preview') || hasFlag('--apply'))) {
    const body = acceptanceBody(state.clocks);
    acceptancePreview = await requestJson(`/api/wiki/pages/${encodeURIComponent(PAGE_ID)}/public-proof/accept`, {
      token,
      method: 'POST',
      body
    });
    actions.push({ action: 'preview_acceptance', ready: acceptancePreview?.ready === true });

    if (hasFlag('--apply')) {
      if (process.env.ACCEPT_ALPHABET_PUBLIC_PROOF !== 'YES') {
        throw new Error('Refusing acceptance write. Set ACCEPT_ALPHABET_PUBLIC_PROOF=YES after human review.');
      }
      if (acceptancePreview?.ready !== true) throw new Error('Acceptance preview did not return ready=true.');
      acceptanceResult = await requestJson(`/api/wiki/pages/${encodeURIComponent(PAGE_ID)}/public-proof/accept`, {
        token,
        method: 'POST',
        body: { ...body, confirm: true, decision: 'accept_alphabet_public_proof' }
      });
      actions.push({ action: 'apply_acceptance', ready: acceptanceResult?.ready === true });
      state = await loadState(token);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    mode: hasFlag('--apply') ? 'apply' : 'read_only',
    actions,
    readiness: readinessReport(state),
    acceptancePreview: acceptancePreview ? {
      dryRun: acceptancePreview.dryRun,
      ready: acceptancePreview.ready,
      publishAsFlagship: acceptancePreview.publishAsFlagship,
      proofGrade: acceptancePreview.proofGrade
    } : null,
    acceptanceResult: acceptanceResult ? {
      ready: acceptanceResult.ready,
      unchanged: acceptanceResult.unchanged || false,
      publishedAsFlagship: acceptanceResult.publishedAsFlagship || false,
      proofGrade: acceptanceResult.proofGrade
    } : null
  };
  const reportPath = writeReport(report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  if (!report.readiness.readyForAcceptancePreview && hasFlag('--preview')) process.exitCode = 2;
};

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    if (error.payload?.gaps) console.error(JSON.stringify({ gaps: error.payload.gaps }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  acceptanceBody,
  readinessReport,
  selectClockCandidates
};
