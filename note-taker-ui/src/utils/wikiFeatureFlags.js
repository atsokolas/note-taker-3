export const isWikiReadModeV2Enabled = () => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage?.getItem?.('noeis.flags.wiki.read_mode_v2');
    if (stored === '0' || stored === 'false') return false;
    if (stored === '1' || stored === 'true') return true;
  }
  return process.env.REACT_APP_WIKI_READ_MODE_V2 === 'true';
};

export const isWikiWorkspaceV1Enabled = () => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage?.getItem?.('noeis.flags.wiki.workspace_v1');
    if (stored === '1' || stored === 'true') return true;
  }
  if (process.env.REACT_APP_WIKI_WORKSPACE_V1 === 'false') return false;
  return true;
};

export const wikiPagePath = (pageId, suffix = '') => {
  const encodedPageId = encodeURIComponent(pageId || '');
  if (isWikiWorkspaceV1Enabled()) {
    return `/wiki/workspace?page=${encodedPageId}${String(suffix || '').replace(/^\?/, '&')}`;
  }
  return `/wiki/${encodedPageId}${String(suffix || '').replace(/^&/, '?')}`;
};

export const wikiPageEditPath = (pageId) => {
  const encodedPageId = encodeURIComponent(pageId || '');
  if (isWikiWorkspaceV1Enabled()) return `/wiki/workspace?page=${encodedPageId}&mode=edit`;
  return `/wiki/${encodedPageId}?mode=edit`;
};

const wikiFeatureFlags = {
  isWikiReadModeV2Enabled,
  isWikiWorkspaceV1Enabled,
  wikiPagePath,
  wikiPageEditPath
};

export default wikiFeatureFlags;
