export const isWikiReadModeV2Enabled = () => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage?.getItem?.('noeis.flags.wiki.read_mode_v2');
    if (stored === '0' || stored === 'false') return false;
    if (stored === '1' || stored === 'true') return true;
  }
  return process.env.REACT_APP_WIKI_READ_MODE_V2 === 'true';
};

const wikiFeatureFlags = {
  isWikiReadModeV2Enabled
};

export default wikiFeatureFlags;
