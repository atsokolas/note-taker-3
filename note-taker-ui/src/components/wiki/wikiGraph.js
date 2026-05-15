const DAY_MS = 24 * 60 * 60 * 1000;

export const PAGE_TYPES = ['all', 'concept', 'entity', 'source', 'question', 'comparison', 'overview', 'project', 'log', 'topic'];
export const MODIFIED_WINDOWS = ['24h', '7d', '30d', 'all'];
export const DRIFT_STATUSES = ['all', 'drifting', 'stable'];

export const labelFor = (value = '') => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

export const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const getPageId = (page) => String(page?._id || page?.id || '').trim();

const normalizeTitle = (value = '') => String(value || '').trim().toLowerCase();

const walkDoc = (node, visitor) => {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(child => walkDoc(child, visitor));
    return;
  }
  if (typeof node !== 'object') return;
  visitor(node);
  if (Array.isArray(node.content)) walkDoc(node.content, visitor);
};

const collectWikiLinkEdges = (page) => {
  const pageId = getPageId(page);
  const edges = [];
  walkDoc(page?.body, node => {
    if (!Array.isArray(node.marks)) return;
    node.marks
      .filter(mark => mark?.type === 'wikiLink' && mark?.attrs?.pageId)
      .forEach(mark => {
        const target = String(mark.attrs.pageId || '').trim();
        if (target && target !== pageId) {
          edges.push({
            id: `wikiLink:${pageId}:${target}`,
            source: pageId,
            target,
            relationType: 'wikiLink'
          });
        }
      });
  });
  return edges;
};

const collectRelatedEdges = (page, titleToId) => {
  const pageId = getPageId(page);
  const relatedPages = page?.aiState?.health?.relatedPages;
  if (!Array.isArray(relatedPages)) return [];
  return relatedPages
    .map(entry => {
      const rawId = entry?.pageId || entry?._id || entry?.id || '';
      const target = String(rawId || titleToId.get(normalizeTitle(entry?.title || entry?.text || '')) || '').trim();
      if (!target || target === pageId) return null;
      return {
        id: `related:${pageId}:${target}`,
        source: pageId,
        target,
        relationType: 'related'
      };
    })
    .filter(Boolean);
};

const normalizeMapNodeId = (value = '') => String(value || '').replace(/^wiki_page:/, '').trim();

const collectConnectionEdges = (mapGraph = {}, pageIds) => {
  const rows = Array.isArray(mapGraph.edges) ? mapGraph.edges : Array.isArray(mapGraph.links) ? mapGraph.links : [];
  return rows
    .map(row => {
      const source = normalizeMapNodeId(row.source);
      const target = normalizeMapNodeId(row.target);
      if (!pageIds.has(source) || !pageIds.has(target) || source === target) return null;
      return {
        id: `connection:${row.id || `${source}:${target}:${row.relationType || 'related'}`}`,
        source,
        target,
        relationType: row.relationType || 'related'
      };
    })
    .filter(Boolean);
};

const sourceKey = (source = {}) => String(
  source._id || source.id || source.objectId || source.url || source.title || ''
).trim().toLowerCase();

const collectSharedSourceEdges = (pages = []) => {
  const bySource = new Map();
  (Array.isArray(pages) ? pages : []).forEach((page) => {
    const pageId = getPageId(page);
    if (!pageId) return;
    (Array.isArray(page.sourceRefs) ? page.sourceRefs : []).forEach((source) => {
      const key = sourceKey(source);
      if (!key) return;
      if (!bySource.has(key)) bySource.set(key, { title: source.title || source.url || 'Shared source', pageIds: new Set() });
      bySource.get(key).pageIds.add(pageId);
    });
  });

  const pairCounts = new Map();
  bySource.forEach(({ title, pageIds }) => {
    const ids = Array.from(pageIds).sort();
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const source = ids[leftIndex];
        const target = ids[rightIndex];
        const key = `${source}:${target}`;
        const current = pairCounts.get(key) || { source, target, count: 0, sourceTitles: [] };
        current.count += 1;
        if (title && current.sourceTitles.length < 3) current.sourceTitles.push(title);
        pairCounts.set(key, current);
      }
    }
  });

  return Array.from(pairCounts.values()).map(edge => ({
    id: `shared_source:${edge.source}:${edge.target}`,
    source: edge.source,
    target: edge.target,
    relationType: 'shared_source',
    weight: edge.count,
    sourceTitles: edge.sourceTitles
  }));
};

const dedupeEdges = (edges) => {
  const seen = new Set();
  return edges.filter(edge => {
    const left = String(edge.source || '');
    const right = String(edge.target || '');
    const key = edge.relationType === 'shared_source' && left > right
      ? `${right}:${left}:${edge.relationType}`
      : `${left}:${right}:${edge.relationType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildWikiGraphData = (pages = [], mapGraph = {}) => {
  const pageList = Array.isArray(pages) ? pages : [];
  const pageIds = new Set(pageList.map(getPageId).filter(Boolean));
  const titleToId = new Map(
    pageList.map(page => [normalizeTitle(page.title), getPageId(page)]).filter(([title, id]) => title && id)
  );
  const links = dedupeEdges([
    ...pageList.flatMap(collectWikiLinkEdges),
    ...pageList.flatMap(page => collectRelatedEdges(page, titleToId)),
    ...collectConnectionEdges(mapGraph, pageIds),
    ...collectSharedSourceEdges(pageList)
  ]).filter(edge => pageIds.has(edge.source) && pageIds.has(edge.target));

  const inbound = new Map();
  links.forEach(edge => inbound.set(edge.target, (inbound.get(edge.target) || 0) + 1));

  return {
    nodes: pageList
      .map(page => {
        const id = getPageId(page);
        if (!id) return null;
        return {
          id,
          itemId: id,
          title: page.title || 'Untitled Wiki Page',
          pageType: page.pageType || 'topic',
          snippet: page.plainText || '',
          updatedAt: page.updatedAt || page.lastModifiedAt || null,
          sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0,
          inboundCount: inbound.get(id) || 0,
          openPath: `/wiki/${id}`
        };
      })
      .filter(Boolean),
    links
  };
};

export const summarizeWikiGraph = (graph = {}) => {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const links = Array.isArray(graph.links) ? graph.links : [];
  const degree = new Map(nodes.map(node => [node.id, 0]));
  const relationCounts = {};
  links.forEach((link) => {
    const source = typeof link.source === 'object' ? link.source?.id : link.source;
    const target = typeof link.target === 'object' ? link.target?.id : link.target;
    const relationType = link.relationType || 'related';
    relationCounts[relationType] = (relationCounts[relationType] || 0) + 1;
    if (degree.has(source)) degree.set(source, degree.get(source) + 1);
    if (degree.has(target)) degree.set(target, degree.get(target) + 1);
  });
  const hubs = nodes
    .map(node => ({ ...node, degree: degree.get(node.id) || 0 }))
    .filter(node => node.degree > 0)
    .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
    .slice(0, 3);
  const orphans = nodes
    .map(node => ({ ...node, degree: degree.get(node.id) || 0 }))
    .filter(node => node.degree === 0)
    .sort((a, b) => a.title.localeCompare(b.title));
  const sharedSourceClusters = links
    .filter(link => link.relationType === 'shared_source')
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 3);
  return {
    hubs,
    orphans,
    orphanCount: orphans.length,
    relationCounts,
    sharedSourceClusters
  };
};

const countDriftSignals = (page = {}) => {
  const health = page?.aiState?.health || {};
  return ['newItems', 'unsupportedClaims', 'staleSections', 'contradictions']
    .reduce((total, key) => total + (Array.isArray(health[key]) ? health[key].length : 0), 0);
};

export const filterWikiGraphPages = (pages = [], { pageType = 'all', modifiedWithin = 'all', driftStatus = 'all', now = new Date() } = {}) => {
  const maxAgeMs = modifiedWithin === '24h'
    ? DAY_MS
    : modifiedWithin === '7d'
      ? 7 * DAY_MS
      : modifiedWithin === '30d'
        ? 30 * DAY_MS
        : null;
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return (Array.isArray(pages) ? pages : []).filter(page => {
    if (pageType !== 'all' && String(page.pageType || 'topic') !== pageType) return false;
    if (driftStatus === 'drifting' && countDriftSignals(page) === 0) return false;
    if (driftStatus === 'stable' && countDriftSignals(page) > 0) return false;
    if (!maxAgeMs) return true;
    const updatedAt = new Date(page.updatedAt || page.lastModifiedAt || 0).getTime();
    if (!Number.isFinite(updatedAt)) return false;
    return nowTime - updatedAt <= maxAgeMs;
  });
};
