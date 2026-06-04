import { isWikiReadModeV2Enabled, isWikiWorkspaceV1Enabled, wikiPageEditPath, wikiPagePath } from './wikiFeatureFlags';

describe('wiki feature flags', () => {
  const originalEnv = process.env.REACT_APP_WIKI_READ_MODE_V2;
  const originalWorkspaceEnv = process.env.REACT_APP_WIKI_WORKSPACE_V1;

  beforeEach(() => {
    window.localStorage.clear();
    delete process.env.REACT_APP_WIKI_READ_MODE_V2;
    delete process.env.REACT_APP_WIKI_WORKSPACE_V1;
  });

  afterEach(() => {
    window.localStorage.clear();
    if (originalEnv === undefined) delete process.env.REACT_APP_WIKI_READ_MODE_V2;
    else process.env.REACT_APP_WIKI_READ_MODE_V2 = originalEnv;
    if (originalWorkspaceEnv === undefined) delete process.env.REACT_APP_WIKI_WORKSPACE_V1;
    else process.env.REACT_APP_WIKI_WORKSPACE_V1 = originalWorkspaceEnv;
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

  it('turns workspace v1 on by default', () => {
    expect(isWikiWorkspaceV1Enabled()).toBe(true);
  });

  it('does not let stale local storage disable workspace v1', () => {
    window.localStorage.setItem('noeis.flags.wiki.workspace_v1', 'false');
    expect(isWikiWorkspaceV1Enabled()).toBe(true);
  });

  it('lets the environment disable workspace v1 for rollback builds', () => {
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'false';
    expect(isWikiWorkspaceV1Enabled()).toBe(false);
  });

  it('builds canonical workspace read and edit paths while workspace v1 is enabled', () => {
    expect(wikiPagePath('wiki 1')).toBe('/wiki/workspace?page=wiki%201');
    expect(wikiPagePath('wiki 1', 'promoted=concept&from=think')).toBe(
      '/wiki/workspace?page=wiki%201&promoted=concept&from=think'
    );
    expect(wikiPageEditPath('wiki 1')).toBe('/wiki/workspace?page=wiki%201&mode=edit');
  });

  it('builds legacy read and edit paths when workspace v1 is disabled', () => {
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'false';
    expect(wikiPagePath('wiki 1')).toBe('/wiki/wiki%201');
    expect(wikiPageEditPath('wiki 1')).toBe('/wiki/wiki%201?mode=edit');
  });
});
