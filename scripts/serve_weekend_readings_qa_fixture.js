#!/usr/bin/env node

const http = require('http');
const {
  APPROVAL_CONFIRMATION,
  PUBLICATION_CONFIRMATION,
  REVIEW_CONFIRMATION,
  buildApprovalCandidate,
  buildApprovalReceipt,
  buildPublicationReceipt,
  buildReviewRequestReceipt,
  serializePublishedArtifact
} = require('../server/services/weekendReadingsApprovalService');
const {
  privateSentinel,
  weekendReadingsLeakFixture
} = require('../server/services/fixtures/weekendReadingsLeakFixture');

if (process.env.NODE_ENV === 'production') {
  throw new Error('The Weekend Readings QA fixture server cannot run in production.');
}

const port = Number(process.env.PORT || 5600);
const slug = 'weekend-readings-qa';
const pageId = 'weekend-readings-qa-page';
const actorUserId = 'qa-weekend-readings-seed';
const revisionId = 'qa-approved-revision-001';
const candidate = buildApprovalCandidate({ snapshot: weekendReadingsLeakFixture(), revisionId });
const review = buildReviewRequestReceipt({
  candidate,
  pageId,
  actorUserId,
  confirmation: REVIEW_CONFIRMATION,
  at: '2026-07-19T12:00:00.000Z'
});
const approval = buildApprovalReceipt({
  candidate,
  reviewReceipt: review,
  pageId,
  actorUserId,
  confirmation: APPROVAL_CONFIRMATION,
  at: '2026-07-19T12:05:00.000Z'
});
const publication = buildPublicationReceipt({
  approvalReceipt: approval,
  currentRevisionId: revisionId,
  pageId,
  actorUserId,
  confirmation: PUBLICATION_CONFIRMATION,
  at: '2026-07-19T12:10:00.000Z'
});
const page = serializePublishedArtifact({
  approvalReceipt: approval,
  publicationReceipt: publication,
  slug
});

if (!page || JSON.stringify(page).includes(privateSentinel)) {
  throw new Error('Synthetic QA artifact failed the public/private leak gate.');
}

const sendJson = (res, status, body) => {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end();
  }
  if (req.method === 'GET' && req.url === `/api/public/wiki/pages/${slug}`) {
    return sendJson(res, 200, { page, sharedAt: page.publication.publishedAt });
  }
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true, fixture: slug });
  }
  return sendJson(res, 404, { error: 'Synthetic QA fixture route not found.' });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Weekend Readings QA fixture listening on http://127.0.0.1:${port}\n`);
});
