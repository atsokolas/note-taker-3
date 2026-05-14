const DAY_MS = 24 * 60 * 60 * 1000;

export const PAGE_TYPES = ['all', 'concept', 'entity', 'source', 'question', 'comparison', 'overview', 'project', 'log', 'topic'];
export const MODIFIED_WINDOWS = ['24h', '7d', '30d', 'all'];

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

const dedupeEdges = (edges) => {
  const seen = new Set();
  return edges.filter(edge => {
    const key = `${edge.source}:${edge.target}:${edge.relationType}`;
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
    ...collectConnectionEdges(mapGraph, pageIds)
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

export const filterWikiGraphPages = (pages = [], { pageType = 'all', modifiedWithin = 'all', now = new Date() } = {}) => {
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
    if (!maxAgeMs) return true;
    const updatedAt = new Date(page.updatedAt || page.lastModifiedAt || 0).getTime();
    if (!Number.isFinite(updatedAt)) return false;
    return nowTime - updatedAt <= maxAgeMs;
  });
};
