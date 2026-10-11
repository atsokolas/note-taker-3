import { wikiPageEditPath, wikiPagePath, wikiReadPath } from './wikiFeatureFlags';

describe('wiki paths', () => {
  it('opens pages in the workspace, with any extra query joined on', () => {
    expect(wikiPagePath('page 1')).toBe('/wiki/workspace?page=page%201');
    expect(wikiPagePath('p1', '?claimId=c1')).toBe('/wiki/workspace?page=p1&claimId=c1');
    expect(wikiPagePath('p1', 'review=1')).toBe('/wiki/workspace?page=p1&review=1');
  });

  it('reads pages at their own address', () => {
    expect(wikiReadPath('p1')).toBe('/wiki/read/p1');
    expect(wikiReadPath('p1', '&review=1')).toBe('/wiki/read/p1?review=1');
  });

  it('edits in the workspace', () => {
    expect(wikiPageEditPath('p1')).toBe('/wiki/workspace?page=p1&mode=edit');
  });
});
