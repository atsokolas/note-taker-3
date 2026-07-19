#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BASE_URL = String(process.env.BASE_URL || 'http://localhost:5500').replace(/\/+$/, '');
const USERNAME = process.env.QA_WIKI_USERNAME || 'qa_wiki_seed';
const PASSWORD = process.env.QA_WIKI_PASSWORD || 'QaWikiSeed1234';
const OUTPUT_DIR = path.resolve(process.env.DAILY_LOOP_QA_OUTPUT || 'output/noeis-daily-loop-qa-2026-07-19');
const PAGE_TITLE = 'Complementary Machines and Human Capability';
const FEED_URL = process.env.DAILY_LOOP_QA_FEED_URL
  || 'https://github.com/nodejs/node/releases.atom?noeis_qa=20260719-final2';

const request = async (route, options = {}) => {
  const response = await fetch(`${BASE_URL}${route}`, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (_error) { data = text; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${route} failed: ${response.status} ${data?.error || text}`);
  return data;
};

const authHeaders = token => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

const main = async () => {
  const auth = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  });
  const token = auth.token;
  const pages = await request(`/api/wiki/pages?q=${encodeURIComponent(PAGE_TITLE)}&limit=10`, {
    headers: authHeaders(token)
  });
  const page = pages.find(candidate => candidate.title === PAGE_TITLE);
  if (!page?._id) throw new Error(`QA page not found: ${PAGE_TITLE}`);

  const fullPage = await request(`/api/wiki/pages/${page._id}`, { headers: authHeaders(token) });
  const lifecycleClaim = (fullPage.claims || []).find(claim => claim.claimId && claim.checkInStatus !== 'retired');
  if (!lifecycleClaim) throw new Error('QA page has no active claim for lifecycle acceptance.');

  const arm = await request(`/api/wiki/pages/${page._id}/reading-watch`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ feedUrl: FEED_URL, label: 'QA · Node.js releases' })
  });
  const daily = await request('/api/daily-loop', { headers: authHeaders(token) });
  const briefing = daily.briefing || {};
  const visit = await request(`/api/daily-loop/page-visits/${page._id}`, {
    method: 'POST', headers: authHeaders(token), body: '{}'
  });
  const retired = await request(`/api/daily-loop/check-ins/${page._id}/${encodeURIComponent(lifecycleClaim.claimId)}`, {
    method: 'POST', headers: authHeaders(token), body: JSON.stringify({ action: 'retired', note: 'QA lifecycle acceptance only.' })
  });
  const restored = await request(`/api/daily-loop/check-ins/${page._id}/${encodeURIComponent(lifecycleClaim.claimId)}`, {
    method: 'POST', headers: authHeaders(token), body: JSON.stringify({ action: 'restored', note: 'QA lifecycle acceptance complete.' })
  });
  const settings = await request('/api/morning-paper/settings', { headers: authHeaders(token) });

  const evidence = {
    generatedAt: new Date().toISOString(),
    identity: 'qa_wiki_seed',
    page: { id: String(page._id), title: page.title },
    readingWatch: {
      feedUrl: FEED_URL,
      status: arm.page?.externalWatches?.reading?.status,
      eventCount: arm.events?.length || 0,
      affectedPageIds: (arm.events || []).flatMap(event => event.affectedPageIds || []).map(String)
    },
    durableVisit: { pageId: String(visit.pageId || page._id), visitCount: visit.visitCount, lastVisitedAt: visit.lastVisitedAt },
    claimLifecycle: {
      claimId: lifecycleClaim.claimId,
      retiredStatus: retired.claim?.checkInStatus,
      retiredAtRecorded: Boolean(retired.claim?.retiredAt),
      restoredStatus: restored.claim?.checkInStatus,
      restoredAtRecorded: Boolean(restored.claim?.restoredAt),
      revisionIds: [retired.revisionId, restored.revisionId].filter(Boolean).map(String)
    },
    morningPaper: {
      since: briefing.since,
      watcherLead: briefing.lead ? {
        provider: briefing.lead.provider,
        pageId: briefing.lead.page?.id,
        maintenanceStatus: briefing.lead.maintenanceStatus,
        impactSummary: briefing.lead.impactSummary
      } : null,
      watchingCount: briefing.watching?.length || 0,
      claimCheckInPresent: Boolean(briefing.claimCheckIn),
      emailConfiguration: settings.settings?.configuration || null,
      emailEnabled: Boolean(settings.settings?.enabled)
    }
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'api-acceptance.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, outputPath, ...evidence }, null, 2));
};

main().catch(error => {
  console.error(`Daily Loop QA acceptance failed: ${error.message}`);
  process.exit(1);
});
