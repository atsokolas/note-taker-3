#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const baseUrl = String(process.env.API_BASE_URL || process.env.WEB_APP_URL || 'http://127.0.0.1:5500').replace(/\/+$/, '');
const authToken = String(process.env.AUTH_TOKEN || '').trim();
const readwiseConnectionId = String(process.env.READWISE_CONNECTION_ID || '').trim();
const notionConnectionId = String(process.env.NOTION_CONNECTION_ID || '').trim();
const cleanupImportedNote = String(process.env.CLEANUP_IMPORTED_NOTE || '1').trim() !== '0';
const cleanupImportSessions = String(process.env.CLEANUP_IMPORT_SESSIONS || '1').trim() !== '0';
const shouldStartServer = process.argv.includes('--start-server') || String(process.env.START_SERVER || '').trim() === '1';

if (!authToken) {
  console.error('AUTH_TOKEN is required.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${authToken}`
};

const jsonHeaders = {
  ...headers,
  'Content-Type': 'application/json'
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (error) {
      body = { raw: text };
    }
  }
  return { response, body, text };
};

const waitForServer = async () => {
  const timeoutAt = Date.now() + 20000;
  while (Date.now() < timeoutAt) {
    try {
      const { response } = await requestJson(`${baseUrl}/api/import/connections`, {
        method: 'GET',
        headers
      });
      if ([200, 401, 403].includes(response.status)) return;
    } catch (error) {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for server at ${baseUrl}`);
};

const startServer = async () => {
  const serverProcess = spawn(process.execPath, [path.join(rootDir, 'server/server.js')], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit'
  });
  await waitForServer();
  return serverProcess;
};

const createImportSession = async (provider, sourceType, sourceLabel) => {
  const { response, body, text } = await requestJson(`${baseUrl}/api/import/sessions`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      provider,
      mode: provider === 'notion' ? 'oauth' : 'file_upload',
      sourceLabel,
      config: {
        sourceType,
        importStrategy: provider === 'notion' ? 'oauth' : 'file_upload'
      },
      progress: {
        stage: 'draft',
        percent: 0,
        indexingState: 'not_started'
      },
      activation: {
        primaryAction: 'create_concept'
      }
    })
  });
  assert.strictEqual(response.status, 201, `create import session failed status=${response.status} body=${text}`);
  assert.ok(body?.session?.id, 'expected created import session id');
  return body.session;
};

const deleteImportSession = async (sessionId) => {
  if (!sessionId) return;
  const { response, text } = await requestJson(`${baseUrl}/api/import/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers
  });
  assert.ok(
    [200, 404].includes(response.status),
    `delete import session failed status=${response.status} body=${text}`
  );
};

const buildEnexFixture = () => {
  const title = `Codex ENEX Smoke ${Date.now()}`;
  const fileName = `codex-import-smoke-${Date.now()}.enex`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<en-export>
  <note>
    <title>${title}</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><div>Imported from smoke script</div><div>- first bullet</div></en-note>]]></content>
    <created>20260317T120000Z</created>
    <updated>20260317T120500Z</updated>
    <tag>smoke</tag>
    <tag>import</tag>
    <source-url>https://example.com/smoke</source-url>
  </note>
</en-export>`;
  return { title, fileName, xml };
};

const buildEnexFormData = (xml, fileName, importSessionId) => {
  const form = new FormData();
  form.append('file', new Blob([xml], { type: 'application/xml' }), fileName);
  form.append('importSessionId', importSessionId);
  return form;
};

const runEvernoteSmoke = async () => {
  const fixture = buildEnexFixture();
  const session = await createImportSession('evernote', 'enex', fixture.fileName);
  const previewForm = buildEnexFormData(fixture.xml, fixture.fileName, session.id);
  const previewResult = await requestJson(`${baseUrl}/api/import/evernote-enex/preview`, {
    method: 'POST',
    headers,
    body: previewForm
  });
  assert.strictEqual(
    previewResult.response.status,
    200,
    `Evernote preview failed status=${previewResult.response.status} body=${previewResult.text}`
  );
  assert.strictEqual(previewResult.body?.preview?.notes, 1, 'expected Evernote preview to report one note');

  const importForm = buildEnexFormData(fixture.xml, fixture.fileName, session.id);
  const importResult = await requestJson(`${baseUrl}/api/import/evernote-enex`, {
    method: 'POST',
    headers,
    body: importForm
  });
  assert.strictEqual(
    importResult.response.status,
    200,
    `Evernote import failed status=${importResult.response.status} body=${importResult.text}`
  );
  assert.strictEqual(importResult.body?.importedNotes, 1, 'expected Evernote import to create one note');
  assert.ok(importResult.body?.entryId, 'expected imported Evernote note id');

  const sessionResult = await requestJson(`${baseUrl}/api/import/sessions/${encodeURIComponent(session.id)}`, {
    method: 'GET',
    headers
  });
  assert.strictEqual(
    sessionResult.response.status,
    200,
    `fetch import session failed status=${sessionResult.response.status} body=${sessionResult.text}`
  );
  assert.strictEqual(sessionResult.body?.session?.status, 'completed', 'expected Evernote session to complete');

  if (cleanupImportedNote) {
    const deleteResult = await requestJson(`${baseUrl}/api/notebook/${encodeURIComponent(importResult.body.entryId)}`, {
      method: 'DELETE',
      headers
    });
    assert.strictEqual(
      deleteResult.response.status,
      200,
      `cleanup imported notebook failed status=${deleteResult.response.status} body=${deleteResult.text}`
    );
  }

  return {
    sessionId: session.id,
    preview: previewResult.body.preview,
    importResult: {
      importedNotes: importResult.body.importedNotes,
      skippedRows: importResult.body.skippedRows,
      indexingQueued: importResult.body.indexingQueued,
      entryId: importResult.body.entryId
    },
    finalSession: sessionResult.body.session
  };
};

const runProviderCheck = async ({ provider, connectionId }) => {
  if (!connectionId) {
    return { skipped: true, reason: `No ${provider} connection id supplied.` };
  }

  const checkResult = await requestJson(`${baseUrl}/api/import/${provider}/check`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ connectionId })
  });
  assert.strictEqual(
    checkResult.response.status,
    200,
    `${provider} connection check failed status=${checkResult.response.status} body=${checkResult.text}`
  );

  const previewSession = await createImportSession(provider, provider === 'notion' ? 'oauth' : 'api', `${provider} smoke preview`);
  const previewResult = await requestJson(`${baseUrl}/api/import/${provider}/preview`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      connectionId,
      importSessionId: previewSession.id
    })
  });
  assert.strictEqual(
    previewResult.response.status,
    200,
    `${provider} preview failed status=${previewResult.response.status} body=${previewResult.text}`
  );

  return {
    skipped: false,
    sessionId: previewSession.id,
    check: checkResult.body,
    preview: previewResult.body?.preview || null
  };
};

const runNotionConfigCheck = async () => {
  const result = await requestJson(`${baseUrl}/api/import/notion/oauth/start`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({})
  });
  return {
    status: result.response.status,
    body: result.body
  };
};

const run = async () => {
  const summary = {};
  let serverProcess = null;
  const createdSessionIds = [];

  try {
    if (shouldStartServer) {
      serverProcess = await startServer();
    }

    summary.evernote = await runEvernoteSmoke();
    if (summary.evernote?.sessionId) createdSessionIds.push(summary.evernote.sessionId);
    summary.readwise = await runProviderCheck({ provider: 'readwise', connectionId: readwiseConnectionId });
    if (summary.readwise?.sessionId) createdSessionIds.push(summary.readwise.sessionId);
    summary.notion = notionConnectionId
      ? await runProviderCheck({ provider: 'notion', connectionId: notionConnectionId })
      : { skipped: true, config: await runNotionConfigCheck() };
    if (summary.notion?.sessionId) createdSessionIds.push(summary.notion.sessionId);

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (cleanupImportSessions) {
      for (const sessionId of createdSessionIds) {
        try {
          await deleteImportSession(sessionId);
        } catch (error) {
          console.error(`Failed to delete import session ${sessionId}:`, error.message);
        }
      }
    }
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
