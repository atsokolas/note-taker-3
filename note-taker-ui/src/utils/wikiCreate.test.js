import { buildWikiCreatePayload } from './wikiCreate';

describe('buildWikiCreatePayload', () => {
  it('preserves the ordinary Library article to Wiki contract without dossier metadata', () => {
    const payload = buildWikiCreatePayload({
      type: 'article',
      objectId: 'article-123',
      title: 'A saved technical paper',
      text: 'A saved technical paper\n\nSource-backed article text.',
      label: 'A saved technical paper',
      pageType: 'source',
      source: {
        type: 'article',
        objectId: 'article-123',
        title: 'A saved technical paper',
        snippet: 'Source-backed article text.',
        url: 'https://example.com/paper'
      }
    });

    expect(payload).toMatchObject({
      title: 'A saved technical paper',
      pageType: 'source',
      sourceScope: 'selected_sources',
      createdFrom: {
        type: 'article',
        objectId: 'article-123',
        label: 'A saved technical paper'
      },
      initialSourceRef: {
        type: 'article',
        objectId: 'article-123',
        title: 'A saved technical paper',
        url: 'https://example.com/paper'
      }
    });
    expect(payload).not.toHaveProperty('preset');
    expect(payload).not.toHaveProperty('judgment');
    expect(payload).not.toHaveProperty('investmentDossier');
  });
});
