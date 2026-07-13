#!/usr/bin/env node

/** Read-only, production-safe verifier for the full Alphabet public-proof loop. */
const fs = require('fs');
const path = require('path');
const { evaluateAlphabetProof } = require('../server/services/alphabetProofAcceptanceService');

const API_URL = process.env.NOEIS_API_URL || 'https://note-taker-3-unrg.onrender.com';
const USERNAME = process.env.NOEIS_USERNAME || process.env.NOEIS_QA_USERNAME || '';
const PASSWORD = process.env.NOEIS_PASSWORD || process.env.NOEIS_QA_PASSWORD || '';
const PAGE_ID = process.env.ALPHABET_PAGE_ID || '';
const REQUIRE_COMPLETE = /^(1|true|yes)$/i.test(process.env.REQUIRE_COMPLETE_ALPHABET_PROOF || '');
const OUTPUT_DIR = process.env.ALPHABET_PROOF_OUTPUT || path.join(process.cwd(), 'output', `alphabet-proof-acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}`);

const requestJson = async (pathname, options = {}) => {
  const response = await fetch(`${API_URL}${pathname}`, options);
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch (_error) { data = raw; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${pathname} failed: ${response.status} ${data?.error || response.statusText}`);
  return data;
};

const authHeaders = token => ({ Authorization: `Bearer ${token}` });

const findAlphabetRegistryItem = payload => {
  const items = payload?.objects || payload?.items || payload?.proof || [];
  return items.find(item => item.slot === 'alphabet' || item.key === 'alphabet' || /alphabet/i.test(String(item.title || ''))) || null;
};

const main = async () => {
  if (!USERNAME || !PASSWORD || !PAGE_ID) {
    throw new Error('Set NOEIS_USERNAME, NOEIS_PASSWORD, and ALPHABET_PAGE_ID. This verifier never mutates data.');
  }
  const auth = await requestJson('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  });
  if (!auth?.token) throw new Error('Login returned no token.');
  const headers = authHeaders(auth.token);
  const [page, eventPayload, revisionPayload, briefing, registry] = await Promise.all([
    requestJson(`/api/wiki/pages/${encodeURIComponent(PAGE_ID)}`, { headers }),
    requestJson('/api/wiki/source-events?limit=100', { headers }),
    requestJson(`/api/wiki/pages/${encodeURIComponent(PAGE_ID)}/revisions?limit=100`, { headers }),
    requestJson('/api/wiki/briefing', { headers }),
    requestJson('/api/public/wiki/proof')
  ]);
  const registryItem = findAlphabetRegistryItem(registry);
  const publicIdentifier = registryItem?.id
    || registryItem?.pageId
    || registryItem?.slug
    || String(registryItem?.publicUrl || '').split('/').filter(Boolean).pop()
    || PAGE_ID;
  let publicPage = null;
  try {
    publicPage = (await requestJson(`/api/public/wiki/pages/${encodeURIComponent(publicIdentifier)}`))?.page || null;
  } catch (_error) {}
  const result = evaluateAlphabetProof({
    page,
    events: eventPayload?.events,
    revisions: revisionPayload?.revisions,
    briefing,
    registryItem,
    publicPage
  });
  const report = { generatedAt: new Date().toISOString(), apiUrl: API_URL, mode: 'read_only', ...result };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  if (REQUIRE_COMPLETE && result.verdict !== 'accepted') process.exitCode = 2;
};

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
