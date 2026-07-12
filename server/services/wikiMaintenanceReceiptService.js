const clean = (value = '', limit = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

const sourceName = (event = {}) => {
  const source = clean(event.metadata?.source || event.provider || event.sourceType, 80).toLowerCase();
  if (source.includes('sec') || source.includes('edgar')) return { source: 'sec-edgar', label: 'SEC EDGAR' };
  if (source.includes('transcript') || source.includes('fmp')) return { source: 'earnings-transcript', label: 'Earnings transcript' };
  if (source.includes('github')) return { source: 'github', label: 'GitHub' };
  if (source.includes('readwise')) return { source: 'readwise', label: 'Readwise' };
  return { source: source || 'wiki-source', label: clean(event.provider || event.sourceType, 80) || 'Wiki source' };
};

const aggregateComparisonCounts = (comparisons = []) => {
  const counts = {
    added: 0,
    changed: 0,
    gainedSupport: 0,
    contradicted: 0,
    preserved: 0,
    removed: 0,
    acceptedPages: 0,
    rejectedPages: 0
  };
  (Array.isArray(comparisons) ? comparisons : []).forEach((comparison) => {
    Object.keys(counts).slice(0, 6).forEach((key) => {
      counts[key] += Number(comparison?.counts?.[key] || 0);
    });
    if (comparison?.outcome === 'rejected') counts.rejectedPages += 1;
    else counts.acceptedPages += 1;
  });
  return counts;
};

const comparisonSummary = (counts = {}) => {
  const parts = [];
  if (counts.changed) parts.push(`${counts.changed} changed`);
  if (counts.gainedSupport) parts.push(`${counts.gainedSupport} gained support`);
  if (counts.contradicted) parts.push(`${counts.contradicted} contradicted`);
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  if (counts.preserved) parts.push(`${counts.preserved} preserved`);
  return parts.length ? parts.join(' · ') : 'No claim-level changes';
};

const buildWikiMaintenanceReceipt = ({ run, event = {}, pages = [], comparisons = [], status = 'completed', now = new Date() } = {}) => {
  if (!run?._id || !event?._id) return null;
  const source = sourceName(event);
  const counts = aggregateComparisonCounts(comparisons);
  const firstPage = pages[0] || null;
  return {
    id: `wiki-maintenance:${run._id}`,
    kind: 'wiki_maintenance',
    source: source.source,
    sourceLabel: source.label,
    status,
    title: `${source.label} maintained ${pages.length === 1 ? clean(firstPage?.title, 100) || 'a wiki page' : `${pages.length} wiki pages`}`,
    summary: comparisonSummary(counts),
    metrics: {
      claimsAdded: counts.added,
      claimsChanged: counts.changed,
      claimsGainedSupport: counts.gainedSupport,
      claimsContradicted: counts.contradicted,
      claimsPreserved: counts.preserved,
      claimsRemoved: counts.removed,
      acceptedPages: counts.acceptedPages,
      rejectedPages: counts.rejectedPages
    },
    touched: pages.slice(0, 24).map(page => ({
      type: 'wiki_page',
      id: String(page?._id || page?.id || ''),
      title: clean(page?.title, 120)
    })).filter(item => item.id),
    nextAction: firstPage ? {
      label: `Review ${clean(firstPage.title, 80) || 'maintained page'}`,
      intent: 'review_wiki_maintenance',
      href: `/wiki/workspace?page=${encodeURIComponent(String(firstPage._id || firstPage.id || ''))}`
    } : null,
    provenance: {
      sourceEventId: String(event._id || ''),
      maintenanceRunId: String(run._id || ''),
      pageIds: pages.map(page => String(page?._id || page?.id || '')).filter(Boolean),
      revisionIds: comparisons.map(comparison => String(comparison?.revisionId || '')).filter(Boolean),
      provider: clean(event.provider || event.metadata?.source || event.sourceType, 120),
      externalId: clean(event.externalId, 240),
      sourceUpdatedAt: event.sourceUpdatedAt || null,
      sourceUrl: clean(event.url, 1000)
    },
    completedAt: now
  };
};

module.exports = {
  aggregateComparisonCounts,
  buildWikiMaintenanceReceipt,
  comparisonSummary,
  sourceName
};
