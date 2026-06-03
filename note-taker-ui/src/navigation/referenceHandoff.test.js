import { buildReferenceHandoffPath } from './referenceHandoff';

describe('buildReferenceHandoffPath', () => {
  it('routes Wiki into the chat pull-in pane while preserving workspace state', () => {
    expect(buildReferenceHandoffPath({
      pathname: '/wiki/workspace',
      search: '?page=wiki-1&view=graph'
    })).toBe('/wiki/workspace?page=wiki-1&view=graph&pane=chat&pull=1');
  });

  it('routes Think into the current posture while preserving selected object state', () => {
    expect(buildReferenceHandoffPath({
      pathname: '/think',
      search: '?tab=questions&questionId=question-1'
    })).toBe('/think?tab=questions&questionId=question-1&pull=1');
  });

  it('routes Library article reading into the article pull-in rail', () => {
    expect(buildReferenceHandoffPath({
      pathname: '/library',
      search: '?scope=all&articleId=article-1'
    })).toBe('/library?scope=all&articleId=article-1&pull=1');
  });

  it('uses the Home staging tray when there is no active graph object', () => {
    expect(buildReferenceHandoffPath({
      pathname: '/library',
      search: '?scope=all'
    })).toBe('/think?tab=home&pull=1');
  });
});
