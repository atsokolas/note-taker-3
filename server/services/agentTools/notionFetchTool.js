/**
 * notionFetchTool — agent-callable Notion → Noeis import.
 *
 * Design (per the PR #20 brief):
 *   - User-triggered only (the agent only fetches when the user explicitly
 *     asks). No background sync from this tool.
 *   - Reuses the existing IntegrationConnection that the user set up during
 *     manual Notion import OAuth — no separate agent connection.
 *   - Skip-if-unchanged: compares Notion's `last_edited_time` to the
 *     persisted `importMeta.lastNotionEditedAt` we cache on each entry.
 *     Equal timestamps → no fetch of the page body, no write.
 *   - Imported pages land as NotebookEntry with importMeta provenance:
 *     `{ provider: 'notion', externalId: pageId, sourcePath: notionPageUrl,
 *        lastNotionEditedAt }`. A `notion` tag is added so the user can
 *     filter / browse imported pages in Library.
 *   - Individual pages only — no recursion into child pages, no databases.
 *     (Default per #1 of the user's open questions.)
 *
 * Surface contract:
 *   await fetchNotionPagesForAgent({
 *     userId, deps, options: { connectionId?, limit? }
 *   });
 *   → { status, fetched, created, updated, skipped, failed,
 *       errors: [{ pageId, message }], summary }
 *
 * Deps must be injected (notionClient, notionTransform, models, secrets).
 * Letting the caller hold the deps keeps this file unit-testable in
 * isolation and avoids a deep require chain from agent runtime code.
 */

const DEFAULT_LIMIT = 25;
const PROVIDER = 'notion';
const NOTION_TAG = 'notion';
const { createConnectorWikiSourceEvent } = require('../wikiSourceEventService');
const { processWikiSourceEvent } = require('../wikiMaintenanceOrchestrator');

const trimString = (value) => String(value || '').trim();

const buildNotionPageUrl = (page = {}) => {
  // Notion page URLs follow `notion.so/<workspace>/<title>-<id>` but the API
  // sometimes returns a `url` field directly; prefer that, fall back to a
  // canonical guess.
  if (page?.url) return trimString(page.url);
  const id = trimString(page?.id).replace(/-/g, '');
  return id ? `https://www.notion.so/${id}` : '';
};

const buildEntryFromNotionPage = async ({
  page,
  notionClient,
  notionTransform,
  token
}) => {
  const { extractNotionTitle, blockToPlainText } = notionTransform;
  const title = extractNotionTitle(page) || 'Untitled Notion page';
  const blocks = await notionClient.fetchNotionBlockChildren({
    token,
    blockId: page.id,
    blockToPlainText
  });
  const lines = (Array.isArray(blocks) ? blocks : [])
    .map(text => trimString(text))
    .filter(Boolean);
  const content = lines.join('\n\n');
  const pageUrl = buildNotionPageUrl(page);
  return {
    title,
    content,
    blocks: lines.map((text, index) => ({
      id: `notion-${page.id}-${index}`,
      type: 'paragraph',
      text
    })),
    importMeta: {
      provider: PROVIDER,
      sourceType: 'page',
      sourceLabel: 'Notion',
      sourcePath: pageUrl,
      externalId: trimString(page.id),
      importedAt: new Date(),
      lastNotionEditedAt: trimString(page.last_edited_time) || null
    },
    tags: [NOTION_TAG]
  };
};

const upsertNotebookEntryFromNotion = async ({
  userId,
  payload,
  NotebookEntry,
  WikiSourceEvent = null,
  wikiModels = null
}) => {
  const existing = await NotebookEntry.findOne({
    userId,
    'importMeta.provider': PROVIDER,
    'importMeta.externalId': payload.importMeta.externalId
  });

  // Skip-if-unchanged: rely on Notion's last_edited_time. If the cached value
  // matches what we'd write, the page hasn't changed since our last sync.
  // This avoids a second network call to fetch the body when the page is
  // identical to what we already have — the body fetch happens BEFORE this
  // function is called, so for now we only short-circuit at the upsert
  // boundary. (A future optimization: do a HEAD-style check earlier.)
  if (
    existing
    && payload.importMeta.lastNotionEditedAt
    && existing.importMeta?.lastNotionEditedAt
    && trimString(existing.importMeta.lastNotionEditedAt) === trimString(payload.importMeta.lastNotionEditedAt)
  ) {
    return { entry: existing, status: 'skipped' };
  }

  if (existing) {
    existing.title = payload.title;
    existing.content = payload.content;
    existing.blocks = payload.blocks;
    existing.tags = Array.from(new Set([...(existing.tags || []), ...payload.tags]));
    existing.importMeta = {
      ...existing.importMeta,
      ...payload.importMeta,
      // Preserve original importedAt; only refresh lastNotionEditedAt.
      importedAt: existing.importMeta?.importedAt || payload.importMeta.importedAt
    };
    await existing.save();
    const event = await createConnectorWikiSourceEvent({
      WikiSourceEvent,
      userId,
      sourceObjectId: existing._id,
      provider: PROVIDER,
      payload: {
        sourceType: 'page',
        eventType: 'updated',
        title: existing.title,
        content: existing.content,
        url: existing.importMeta?.sourcePath || '',
        sourceUpdatedAt: existing.updatedAt || new Date(),
        externalId: existing.importMeta?.externalId || ''
      },
      metadata: { source: 'agent-notion-fetch', importMeta: existing.importMeta }
    });
    if (event && wikiModels?.WikiPage) {
      await processWikiSourceEvent({
        sourceEvent: event,
        userId,
        models: wikiModels
      });
    }
    return { entry: existing, status: 'updated' };
  }

  const entry = new NotebookEntry({
    title: payload.title,
    content: payload.content,
    blocks: payload.blocks,
    tags: payload.tags,
    userId,
    importMeta: payload.importMeta
  });
  await entry.save();
  const event = await createConnectorWikiSourceEvent({
    WikiSourceEvent,
    userId,
    sourceObjectId: entry._id,
    provider: PROVIDER,
    payload: {
      sourceType: 'page',
      eventType: 'imported',
      title: entry.title,
      content: entry.content,
      url: entry.importMeta?.sourcePath || '',
      sourceUpdatedAt: entry.updatedAt || new Date(),
      externalId: entry.importMeta?.externalId || ''
    },
    metadata: { source: 'agent-notion-fetch', importMeta: entry.importMeta }
  });
  if (event && wikiModels?.WikiPage) {
    await processWikiSourceEvent({
      sourceEvent: event,
      userId,
      models: wikiModels
    });
  }
  return { entry, status: 'created' };
};

/**
 * Main entry point. Caller passes deps so this is testable without monkey-
 * patching require().
 */
const fetchNotionPagesForAgent = async ({
  userId,
  options = {},
  deps = {}
}) => {
  const {
    notionClient,
    notionTransform,
    IntegrationConnection,
    NotebookEntry,
    decryptSecret,
    WikiSourceEvent = null,
    WikiPage = null,
    WikiRevision = null,
    WikiMaintenanceRun = null,
    Article = null,
    TagMeta = null,
    Question = null,
    ConnectorActionLog = null
  } = deps;

  if (!notionClient || !notionTransform || !IntegrationConnection || !NotebookEntry || !decryptSecret) {
    throw new Error('fetchNotionPagesForAgent: missing required deps');
  }

  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), 100);

  // Resolve the user's Notion connection. Default to the most recently used
  // connection; let the caller pin a specific one via options.connectionId.
  const query = { userId, provider: PROVIDER };
  if (options.connectionId) query._id = options.connectionId;
  const connection = await IntegrationConnection.findOne(query)
    .sort({ updatedAt: -1, createdAt: -1 });

  if (!connection) {
    return {
      status: 'no_connection',
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      summary: 'No active Notion connection. Connect Notion in Data Integrations first.'
    };
  }

  let token = '';
  try {
    token = decryptSecret(connection.encryptedAccessToken);
  } catch (_err) {
    return {
      status: 'token_invalid',
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      summary: 'Stored Notion token could not be read. Re-connect in Data Integrations.'
    };
  }

  // Fetch page list. Per the brief, we only handle pages (not databases).
  let pages = [];
  try {
    pages = await notionClient.searchNotionItems({ token, filterValue: 'page', pageSize: 100 });
  } catch (err) {
    return {
      status: 'search_failed',
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [{ pageId: '', message: err?.message || 'Notion search failed.' }],
      summary: 'Could not list Notion pages. Check the connection.'
    };
  }

  const limited = pages.slice(0, limit);
  const counters = { fetched: limited.length, created: 0, updated: 0, skipped: 0, failed: 0 };
  const errors = [];

  for (const page of limited) {
    try {
      // Quick skip-if-unchanged check before paying the cost of fetching the
      // page body: look up the existing entry and compare last_edited_time.
      const cachedEdited = trimString(page?.last_edited_time);
      const existing = await NotebookEntry.findOne({
        userId,
        'importMeta.provider': PROVIDER,
        'importMeta.externalId': trimString(page.id)
      }).select('importMeta');
      if (
        existing
        && cachedEdited
        && existing.importMeta?.lastNotionEditedAt
        && trimString(existing.importMeta.lastNotionEditedAt) === cachedEdited
      ) {
        counters.skipped += 1;
        continue;
      }

      const payload = await buildEntryFromNotionPage({
        page,
        notionClient,
        notionTransform,
        token
      });
      const result = await upsertNotebookEntryFromNotion({
        userId,
        payload,
        NotebookEntry,
        WikiSourceEvent,
        wikiModels: WikiSourceEvent && WikiPage ? {
          WikiSourceEvent,
          WikiPage,
          WikiRevision,
          WikiMaintenanceRun,
          Article,
          NotebookEntry,
          TagMeta,
          Question
        } : null
      });
      counters[result.status] += 1;
    } catch (err) {
      counters.failed += 1;
      errors.push({ pageId: trimString(page?.id), message: err?.message || 'Unknown error' });
    }
  }

  const status = counters.failed === 0
    ? 'success'
    : counters.failed < counters.fetched ? 'partial_failure' : 'error';

  const summary = (() => {
    const parts = [];
    if (counters.created) parts.push(`Imported ${counters.created} page${counters.created === 1 ? '' : 's'}`);
    if (counters.updated) parts.push(`Updated ${counters.updated}`);
    if (counters.skipped) parts.push(`Skipped ${counters.skipped} (no change)`);
    if (counters.failed) parts.push(`${counters.failed} failed`);
    return parts.length ? parts.join(', ') + '.' : 'No changes.';
  })();

  if (ConnectorActionLog) {
    try {
      const log = new ConnectorActionLog({
        userId,
        connector: PROVIDER,
        action: 'agent_fetch_pages',
        direction: 'read',
        status: counters.failed ? 'failed' : 'completed',
        targetType: 'notion_pages',
        summary,
        metadata: { ...counters }
      });
      await log.save();
    } catch (_error) {
      // Connector action logs should never fail the user-triggered fetch.
    }
  }

  return { status, ...counters, errors, summary };
};

module.exports = {
  fetchNotionPagesForAgent,
  // Exposed for tests
  buildEntryFromNotionPage,
  upsertNotebookEntryFromNotion,
  PROVIDER,
  NOTION_TAG
};
