import { isWikiReadModeV2Enabled } from './wikiFeatureFlags';

describe('wiki feature flags', () => {
  const originalEnv = process.env.REACT_APP_WIKI_READ_MODE_V2;

  beforeEach(() => {
    window.localStorage.clear();
    delete process.env.REACT_APP_WIKI_READ_MODE_V2;
  });

  afterEach(() => {
    window.localStorage.clear();
    if (originalEnv === undefined) delete process.env.REACT_APP_WIKI_READ_MODE_V2;
    else process.env.REACT_APP_WIKI_READ_MODE_V2 = originalEnv;
  });

  it('keeps read mode off by default', () => {
    expect(isWikiReadModeV2Enabled()).toBe(false);
  });

  it('enables read mode from local storage for dogfooding', () => {
    window.localStorage.setItem('noeis.flags.wiki.read_mode_v2', 'true');
    expect(isWikiReadModeV2Enabled()).toBe(true);
  });

  it('lets local storage disable an enabled environment flag', () => {
    process.env.REACT_APP_WIKI_READ_MODE_V2 = 'true';
    window.localStorage.setItem('noeis.flags.wiki.read_mode_v2', 'false');
    expect(isWikiReadModeV2Enabled()).toBe(false);
  });
});
