#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BASE_URL = String(process.env.BASE_URL || 'http://localhost:5500').replace(/\/+$/, '');
const USERNAME = process.env.QA_WIKI_USERNAME || 'qa_wiki_seed';
const PASSWORD = process.env.QA_WIKI_PASSWORD || 'QaWikiSeed1234';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'output', 'noeis-judgment-qa-2026-07-19');

const request = async (route, { method = 'GET', token = '', body } = {}) => {
  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_error) { payload = { raw: text }; }
  return { status: response.status, body: payload };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const claimParagraph = ({ claimId, text, support }) => ({
  type: 'paragraph',
  content: [{
    type: 'text',
    text,
    marks: [{ type: 'claim', attrs: { claimId, support, citationIndexes: [], contradictionIndexes: [] } }]
  }]
});

const run = async () => {
  const login = await request('/api/auth/login', { method: 'POST', body: { username: USERNAME, password: PASSWORD } });
  assert(login.status === 200 && login.body?.token, `QA login failed (${login.status}).`);
  const token = login.body.token;
  const unique = new Date().toISOString().replace(/[:.]/g, '-');
  const title = `QA Demo — Industrial Electrification Living Thesis — ${unique}`;
  const created = await request('/api/wiki/pages', {
    method: 'POST', token,
    body: {
      title,
      pageType: 'overview',
      preset: 'living_thesis',
      governingQuestion: 'QA DEMO ONLY: Which evidence would change this synthetic electrification value-stack view?',
      createdFrom: { type: 'wiki_index', label: title, text: 'QA DEMO ONLY' }
    }
  });
  assert(created.status === 201, `Living thesis create failed (${created.status}): ${created.body?.error || ''}`);
  const pageId = created.body._id;
  assert(created.body.pageType === 'overview', 'Living thesis did not use the canonical overview page type.');
  assert(created.body.visibility === 'private', 'Living thesis did not default to private.');
  assert(created.body.judgment?.kind === 'thesis', 'Living thesis judgment contract is missing.');
  const headings = (created.body.body?.content || []).filter(node => node.type === 'heading').map(node => node.content?.[0]?.text);
  assert(headings.length === 13, `Expected 13 living-thesis headings, received ${headings.length}.`);

  const body = {
    ...created.body.body,
    content: [
      ...(created.body.body?.content || []),
      claimParagraph({ claimId: 'qa-electrification-claim-1', text: 'QA DEMO CLAIM: Grid investment grows in the fixture scenario.', support: 'unsupported' }),
      claimParagraph({ claimId: 'qa-electrification-claim-2', text: 'QA DEMO CLAIM: Component bottlenecks alter synthetic margins.', support: 'partial' }),
      claimParagraph({ claimId: 'qa-electrification-claim-3', text: 'QA DEMO CLAIM: Service intensity changes the fixture value pool.', support: 'conflicted' })
    ]
  };
  const populated = await request(`/api/wiki/pages/${pageId}`, {
    method: 'PATCH', token,
    body: {
      body,
      judgment: {
        ...created.body.judgment,
        currentJudgment: 'QA DEMO ONLY: A provisional synthetic judgment used solely to test persistence.',
        confidence: 0.41,
        status: 'researching',
        decisionPosture: 'investigate',
        strongestCounterargument: 'QA DEMO ONLY: The synthetic premise may mistake cyclical spending for durable value migration.',
        causalModel: { summary: 'QA DEMO ONLY: Investment, bottlenecks, and service intensity interact in this fixture narrative.', nodes: [], edges: [] },
        assumptions: [{ text: 'QA DEMO ONLY: The fixture assumes sustained grid spending.', status: 'unreviewed', confidence: 0.5 }],
        unknowns: [{ question: 'QA DEMO ONLY: Which layer captures synthetic returns?', priority: 'critical', status: 'open' }],
        falsifiers: [{ text: 'QA DEMO ONLY: Fixture spending fails to translate into durable returns.', observableSignal: 'Synthetic return profile remains flat.', status: 'unobserved' }],
        decisions: [{
          summary: 'QA DEMO ONLY: Review one bounded official-source evidence packet.',
          decisionType: 'research',
          rationale: 'Prove the decision ledger without taking an external action.',
          expectedOutcome: 'A QA-only evidence review record.',
          horizon: 'one QA session',
          status: 'planned',
          createdBy: 'user'
        }]
      },
      claimUpdates: [
        { claimId: 'qa-electrification-claim-1', epistemicStatus: 'established_fact', materiality: 'critical', implication: 'QA inconsistency flag should render.' },
        { claimId: 'qa-electrification-claim-2', epistemicStatus: 'supported_interpretation', materiality: 'major', implication: 'QA interpretation.' },
        { claimId: 'qa-electrification-claim-3', epistemicStatus: 'plausible_hypothesis', materiality: 'supporting', implication: 'QA hypothesis.' }
      ]
    }
  });
  assert(populated.status === 200, `Living thesis update failed (${populated.status}): ${populated.body?.error || ''}`);
  assert(populated.body.claims?.length >= 3, 'Three QA claims did not persist.');
  assert(populated.body.claims[0]?.epistemicStatus === 'established_fact', 'Claim epistemic status did not persist.');
  assert(populated.body.judgment?.causalModel?.nodes?.length === 0 && populated.body.judgment?.causalModel?.edges?.length === 0, 'Reserved causal arrays are not empty.');
  assert(populated.body.judgment?.assumptions?.[0]?.assumptionId, 'Stable assumption ID was not assigned.');
  assert(populated.body.judgment?.decisions?.[0]?.decisionId, 'Stable decision ID was not assigned.');

  const snapshot = await request(`/api/wiki/pages/${pageId}/judgment/initial-snapshot`, { method: 'POST', token });
  assert(snapshot.status === 201 && snapshot.body?.revisionId, `Initial snapshot failed (${snapshot.status}): ${snapshot.body?.error || ''}`);
  const initialRevisionId = snapshot.body.revisionId;
  assert(String(snapshot.body.page?.judgment?.initialRevisionId) === String(initialRevisionId), 'Initial revision pointer mismatch.');

  const changed = await request(`/api/wiki/pages/${pageId}`, {
    method: 'PATCH', token,
    body: { judgment: { ...snapshot.body.page.judgment, currentJudgment: 'QA DEMO ONLY: Changed after the initial snapshot.', confidence: 0.63 } }
  });
  assert(changed.status === 200 && changed.body.judgment?.confidence === 0.63, 'Post-snapshot edit failed.');
  const restored = await request(`/api/wiki/pages/${pageId}/judgment/initial-snapshot/restore`, { method: 'POST', token });
  assert(restored.status === 200, `Initial restore failed (${restored.status}): ${restored.body?.error || ''}`);
  assert(restored.body.page?.judgment?.confidence === 0.41, 'Initial judgment confidence was not restored.');
  assert(restored.body.page?.judgment?.currentJudgment === populated.body.judgment.currentJudgment, 'Initial judgment text was not restored.');
  assert(restored.body.page?.judgment?.assumptions?.length === 1, 'Initial assumptions were not restored.');
  assert(restored.body.page?.judgment?.decisions?.length === 1, 'Initial decisions were not restored.');
  assert(restored.body.page?.claims?.[0]?.epistemicStatus === 'established_fact', 'Initial claim epistemic state was not restored.');

  const secondSnapshot = await request(`/api/wiki/pages/${pageId}/judgment/initial-snapshot`, { method: 'POST', token });
  assert(secondSnapshot.status === 409, `Second snapshot should fail safely; received ${secondSnapshot.status}.`);
  const publicPrivate = await request(`/api/public/wiki/pages/${pageId}`);
  assert(publicPrivate.status === 404, `Private thesis should not be publicly readable; received ${publicPrivate.status}.`);

  const evidence = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    qaOnly: true,
    title,
    pageId,
    checks: {
      canonicalWikiPage: true,
      privateByDefault: true,
      orderedHeadingCount: headings.length,
      judgmentRoundTrip: true,
      narrativeCausalModel: restored.body.page.judgment.causalModel,
      claimEpistemicStatus: restored.body.page.claims.map(claim => ({ claimId: claim.claimId, epistemicStatus: claim.epistemicStatus, materiality: claim.materiality, support: claim.support })),
      stableIds: {
        assumptionId: restored.body.page.judgment.assumptions[0].assumptionId,
        unknownId: restored.body.page.judgment.unknowns[0].unknownId,
        falsifierId: restored.body.page.judgment.falsifiers[0].falsifierId,
        decisionId: restored.body.page.judgment.decisions[0].decisionId
      },
      initialRevisionId,
      restoreMatchedInitial: true,
      secondSnapshotStatus: secondSnapshot.status,
      privatePublicReadStatus: publicPrivate.status,
      decisionRecordOnly: true
    }
  };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'api-acceptance.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
};

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
