#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert');
const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('Missing AUTH_TOKEN environment variable.');
  process.exit(1);
}

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 20000
});

const now = Date.now();

const run = async () => {
  console.log(`Testing claim/evidence routes against ${API_BASE_URL}`);

  // Notebook note structure + endpoints
  const claimNoteRes = await client.post('/api/notebook', {
    title: `Claim note ${now}`,
    content: '<p>Claim note body</p>',
    blocks: [],
    tags: []
  });
  const claimNote = claimNoteRes.data;
  assert.strictEqual(claimNote.type || 'note', 'note', 'new notes should default to type=note');

  const evidenceNoteRes = await client.post('/api/notebook', {
    title: `Evidence note ${now}`,
    content: '<p>Evidence note body</p>',
    blocks: [],
    tags: []
  });
  const evidenceNote = evidenceNoteRes.data;
  assert.strictEqual(evidenceNote.type || 'note', 'note', 'new notes should default to type=note');

  const patchedClaimNote = await client.patch(`/api/notebook/${claimNote._id}/organize`, {
    type: 'claim',
    tags: ['thesis', 'argument']
  });
  assert.strictEqual(patchedClaimNote.data.type, 'claim', 'note should update to claim');
  assert.deepStrictEqual(patchedClaimNote.data.tags, ['thesis', 'argument'], 'note tags should persist');

  const linkedEvidenceNote = await client.post(`/api/notebook/${evidenceNote._id}/link-claim`, {
    claimId: claimNote._id
  });
  assert.strictEqual(linkedEvidenceNote.data.type, 'evidence', 'evidence note should become type=evidence');
  assert.strictEqual(String(linkedEvidenceNote.data.claimId), String(claimNote._id), 'evidence note should link claimId');

  const notebookClaimBundle = await client.get(`/api/notebook/${claimNote._id}/claim`);
  const notebookEvidence = notebookClaimBundle.data?.evidence || [];
  assert.ok(Array.isArray(notebookEvidence), 'claim response should include evidence array');
  assert.ok(
    notebookEvidence.some(item => String(item._id) === String(evidenceNote._id)),
    'claim response should include linked evidence note'
  );

  // Highlight structure + endpoints
  const articleUrl = `https://claim-evidence-test.local/${now}`;
  const articleRes = await client.post('/save-article', {
    title: `Claim Evidence Test Article ${now}`,
    url: articleUrl,
    content: '<p>Example content for claim/evidence tests.</p>'
  });
  const article = articleRes.data;
  assert.ok(article?._id, 'expected article to be created');

  const claimHighlightRes = await client.post(`/articles/${article._id}/highlights`, {
    text: 'This is a highlight that should become a claim.',
    tags: []
  });
  const claimHighlight = claimHighlightRes.data?.highlight;
  assert.strictEqual(claimHighlight?.type || 'note', 'note', 'new highlights should default to type=note');

  const evidenceHighlightRes = await client.post(`/articles/${article._id}/highlights`, {
    text: 'This is an evidence highlight supporting the claim.',
    tags: []
  });
  const evidenceHighlight = evidenceHighlightRes.data?.highlight;
  assert.strictEqual(evidenceHighlight?.type || 'note', 'note', 'new highlights should default to type=note');

  const patchedClaimHighlight = await client.patch(`/api/highlights/${claimHighlight._id}/organize`, {
    type: 'claim',
    tags: ['supporting', 'primary']
  });
  assert.strictEqual(patchedClaimHighlight.data.type, 'claim', 'highlight should update to claim');
  assert.deepStrictEqual(patchedClaimHighlight.data.tags, ['supporting', 'primary'], 'highlight tags should persist');

  const linkedEvidenceHighlight = await client.post(`/api/highlights/${evidenceHighlight._id}/link-claim`, {
    claimId: claimHighlight._id
  });
  assert.strictEqual(linkedEvidenceHighlight.data.type, 'evidence', 'linked highlight should be type=evidence');
  assert.strictEqual(
    String(linkedEvidenceHighlight.data.claimId),
    String(claimHighlight._id),
    'linked highlight should store claimId'
  );

  const claimBundle = await client.get(`/api/highlights/${claimHighlight._id}/claim`);
  const evidenceRows = claimBundle.data?.evidence || [];
  assert.ok(Array.isArray(evidenceRows), 'highlight claim response should include evidence array');
  assert.ok(
    evidenceRows.some(item => String(item._id) === String(evidenceHighlight._id)),
    'highlight claim response should include linked evidence highlight'
  );

  console.log('Claim/evidence route tests passed.');
};

run().catch((error) => {
  const status = error.response?.status;
  const data = error.response?.data;
  console.error('Claim/evidence route tests failed.');
  if (status) {
    console.error(`HTTP ${status}`, data || '');
  } else {
    console.error(error.message);
  }
  process.exit(1);
});
