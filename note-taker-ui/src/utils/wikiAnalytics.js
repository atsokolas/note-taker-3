export const WIKI_ANALYTICS_EVENTS = Object.freeze({
  READ_MODE_PAGE_VIEW: 'wiki_read_mode_page_view',
  EDIT_MODE_ENTERED: 'wiki_edit_mode_entered',
  INGEST_SUBMITTED: 'wiki_ingest_submitted',
  INGEST_COMPLETED: 'wiki_ingest_completed',
  INGEST_NO_MATCH: 'wiki_ingest_no_match',
  QA_PROMOTED: 'wiki_qa_promoted',
  SCHEMA_SAVED: 'wiki_schema_saved',
  SCHEMA_SUGGESTED: 'wiki_schema_suggested'
});

const cleanValue = (value) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map(cleanValue).filter(item => item !== undefined);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => [String(key).slice(0, 80), cleanValue(item)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return String(value || '').trim().slice(0, 160);
};

export const trackWikiEvent = (eventName, properties = {}) => {
  try {
    const event = String(eventName || '').trim();
    if (!event) return;
    import('@vercel/analytics')
      .then(({ track }) => track(event, cleanValue(properties) || {}))
      .catch(() => {});
  } catch (_error) {
    // Analytics must never block wiki reading, editing, or ingest flows.
  }
};

export const trackWikiReadModePageView = ({ pageId, pageType = '', sourceCount = 0, claimCount = 0 } = {}) => {
  trackWikiEvent(WIKI_ANALYTICS_EVENTS.READ_MODE_PAGE_VIEW, {
    pageId,
    pageType,
    sourceCount,
    claimCount
  });
};

export const trackWikiEditModeEntered = ({ pageId, source = '' } = {}) => {
  trackWikiEvent(WIKI_ANALYTICS_EVENTS.EDIT_MODE_ENTERED, { pageId, source });
};

export const trackWikiIngestSubmitted = ({ sourceType = '' } = {}) => {
  trackWikiEvent(WIKI_ANALYTICS_EVENTS.INGEST_SUBMITTED, { sourceType });
};

export const trackWikiIngestResult = ({ ingestRun = {} } = {}) => {
  const affectedPageCount = Array.isArray(ingestRun.affectedPageIds) ? ingestRun.affectedPageIds.length : 0;
  trackWikiEvent(
    affectedPageCount > 0 ? WIKI_ANALYTICS_EVENTS.INGEST_COMPLETED : WIKI_ANALYTICS_EVENTS.INGEST_NO_MATCH,
    {
      runId: ingestRun.runId,
      status: ingestRun.status,
      affectedPageCount,
      suggestedCreatePage: Boolean(ingestRun.suggestedCreatePage),
      sourceType: ingestRun.sourceRef?.type
    }
  );
};

export const trackWikiQaPromoted = ({ sourcePageId, promotedPageId, discussionId = '' } = {}) => {
  trackWikiEvent(WIKI_ANALYTICS_EVENTS.QA_PROMOTED, { sourcePageId, promotedPageId, discussionId });
};

export const trackWikiSchemaSaved = ({ contentLength = 0, snapshotCount = 0 } = {}) => {
  trackWikiEvent(WIKI_ANALYTICS_EVENTS.SCHEMA_SAVED, { contentLength, snapshotCount });
};

export const trackWikiSchemaSuggested = ({ suggestionCount = 0, runId = '' } = {}) => {
  trackWikiEvent(WIKI_ANALYTICS_EVENTS.SCHEMA_SUGGESTED, { suggestionCount, runId });
};

const wikiAnalytics = {
  WIKI_ANALYTICS_EVENTS,
  trackWikiEvent,
  trackWikiReadModePageView,
  trackWikiEditModeEntered,
  trackWikiIngestSubmitted,
  trackWikiIngestResult,
  trackWikiQaPromoted,
  trackWikiSchemaSaved,
  trackWikiSchemaSuggested
};

export default wikiAnalytics;
