#!/usr/bin/env node
const assert = require('assert');

const baseUrl = (process.env.API_BASE_URL || process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const token = process.env.AUTH_TOKEN || '';

if (!token) {
  console.error('AUTH_TOKEN is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const requestJson = async (path, options = {}) => {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = null;
  }
  return { res, text, data };
};

const createConcept = async (name) => {
  const response = await requestJson(`/api/concepts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      description: 'Route test concept for idea workbench persistence.'
    })
  });
  assert.strictEqual(
    response.res.status,
    200,
    `create concept failed status=${response.res.status} body=${response.text}`
  );
  return response.data;
};

const getWorkbench = async (conceptName) => {
  const response = await requestJson(`/api/concepts/${encodeURIComponent(conceptName)}/idea-workbench`, {
    method: 'GET',
    headers
  });
  assert.strictEqual(
    response.res.status,
    200,
    `get workbench failed status=${response.res.status} body=${response.text}`
  );
  return response.data;
};

const putWorkbench = async (conceptName, ideaWorkbench, baseRevision) => requestJson(
  `/api/concepts/${encodeURIComponent(conceptName)}/idea-workbench`,
  {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ideaWorkbench, baseRevision })
  }
);

const appendEvents = async (conceptName, events) => requestJson(
  `/api/concepts/${encodeURIComponent(conceptName)}/idea-workbench/events`,
  {
    method: 'POST',
    headers,
    body: JSON.stringify({ events })
  }
);

const buildWorkbench = (suffix = 'alpha') => ({
  version: 1,
  header: {
    label: 'Idea',
    title: `Conflict test ${suffix}`,
    prompt: 'What changed across revisions?',
    stage: 'Forming'
  },
  workspaceDraft: `Draft ${suffix}`,
  workspaceDraftType: 'Note',
  importedSourceKeys: [`source:${suffix}`],
  cards: [
    {
      id: `card-${suffix}`,
      sourceKey: `source:${suffix}`,
      zone: 'workspace',
      type: 'Note',
      title: `Card ${suffix}`,
      content: `Workspace note ${suffix}`,
      source: 'Route test',
      sourcePath: '',
      whyItMatters: 'Needed for route verification.',
      confidence: 'Working',
      strength: 'Low',
      agentAnnotation: '',
      relatedHypothesisLabel: '',
      origin: 'user',
      tags: ['route-test'],
      createdAt: new Date().toISOString()
    }
  ],
  hypothesis: {
    html: `<p>Hypothesis ${suffix}</p>`,
    versions: [
      {
        id: `version-${suffix}`,
        label: 'v1',
        maturity: 'Early',
        html: `<p>Hypothesis ${suffix}</p>`,
        summary: `Version ${suffix}`,
        createdAt: new Date().toISOString()
      }
    ]
  },
  agent: {
    comments: [
      {
        id: `comment-${suffix}`,
        title: `Comment ${suffix}`,
        body: `Comment body ${suffix}`,
        tone: 'signal',
        anchorText: '',
        relatedCardId: '',
        target: 'hypothesis',
        createdAt: new Date().toISOString()
      }
    ],
    messages: [
      {
        id: `message-${suffix}`,
        role: 'assistant',
        text: `Message ${suffix}`,
        action: 'route-test',
        suggestedCards: []
      }
    ]
  }
});

const run = async () => {
  const conceptName = `Idea Workbench Route ${Date.now()}`;
  await createConcept(conceptName);

  const initial = await getWorkbench(conceptName);
  assert.strictEqual(initial.conceptName, conceptName, 'concept name mismatch');
  assert.strictEqual(initial.revision, 0, 'new workbench should start at revision 0');
  assert.strictEqual(initial.ideaWorkbench, null, 'new concept should not have workbench payload yet');
  assert.deepStrictEqual(initial.events, [], 'new concept should not have workbench events');

  const firstPayload = buildWorkbench('alpha');
  const firstSave = await putWorkbench(conceptName, firstPayload, 0);
  assert.strictEqual(firstSave.res.status, 200, `first save failed status=${firstSave.res.status} body=${firstSave.text}`);
  assert.strictEqual(firstSave.data?.revision, 1, 'first save should increment revision to 1');
  assert.strictEqual(firstSave.data?.ideaWorkbench?.header?.title, firstPayload.header.title, 'saved title mismatch');
  assert.strictEqual(firstSave.data?.ideaWorkbench?.cards?.length, 1, 'expected one saved card');

  const afterSave = await getWorkbench(conceptName);
  assert.strictEqual(afterSave.revision, 1, 'revision after save should be 1');
  assert.strictEqual(afterSave.ideaWorkbench?.workspaceDraft, 'Draft alpha', 'workspace draft should round-trip');
  assert.strictEqual(afterSave.ideaWorkbench?.agent?.messages?.[0]?.text, 'Message alpha', 'agent message should round-trip');

  const eventBatch = [
    {
      id: `event-${Date.now()}`,
      type: 'route_test_event',
      actor: 'user',
      summary: 'Added a route test event.',
      createdAt: new Date().toISOString(),
      payload: { route: 'idea-workbench' }
    }
  ];
  const eventAppend = await appendEvents(conceptName, eventBatch);
  assert.strictEqual(
    eventAppend.res.status,
    200,
    `event append failed status=${eventAppend.res.status} body=${eventAppend.text}`
  );
  assert.ok(Array.isArray(eventAppend.data?.events), 'events array missing after append');
  assert.ok(eventAppend.data.events.some((event) => event.type === 'route_test_event'), 'route test event missing after append');

  const stalePayload = buildWorkbench('stale');
  const conflictSave = await putWorkbench(conceptName, stalePayload, 0);
  assert.strictEqual(
    conflictSave.res.status,
    409,
    `stale revision save should conflict status=${conflictSave.res.status} body=${conflictSave.text}`
  );
  assert.strictEqual(conflictSave.data?.revision, 1, 'conflict response should expose current revision');
  assert.strictEqual(
    conflictSave.data?.ideaWorkbench?.header?.title,
    firstPayload.header.title,
    'conflict should return current server workbench'
  );
  assert.ok(Array.isArray(conflictSave.data?.events), 'conflict should include current event log');

  const resolvedPayload = buildWorkbench('resolved');
  const resolvedSave = await putWorkbench(conceptName, resolvedPayload, 1);
  assert.strictEqual(
    resolvedSave.res.status,
    200,
    `resolved save failed status=${resolvedSave.res.status} body=${resolvedSave.text}`
  );
  assert.strictEqual(resolvedSave.data?.revision, 2, 'resolved save should increment revision to 2');
  assert.strictEqual(resolvedSave.data?.ideaWorkbench?.header?.title, resolvedPayload.header.title, 'resolved payload should persist');

  const afterResolve = await getWorkbench(conceptName);
  assert.strictEqual(afterResolve.revision, 2, 'revision after resolve should be 2');
  assert.strictEqual(afterResolve.ideaWorkbench?.header?.title, resolvedPayload.header.title, 'latest workbench title mismatch');
  assert.ok(afterResolve.events.some((event) => event.type === 'route_test_event'), 'event log should survive later saves');

  console.log('idea workbench route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
