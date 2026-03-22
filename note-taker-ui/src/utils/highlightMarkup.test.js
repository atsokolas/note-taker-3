import { renderArticleContentWithHighlights } from './highlightMarkup';

describe('renderArticleContentWithHighlights', () => {
  it('restores a highlight that spans mixed formatting nodes', () => {
    const html = renderArticleContentWithHighlights(
      {
        content: '<article><p>Hello <strong>bold</strong> normal text.</p></article>',
        url: 'https://example.com/article'
      },
      [{
        _id: 'h-1',
        text: 'bold normal',
        color: '#bde0fe',
        anchor: {
          text: 'bold normal',
          prefix: 'Hello ',
          suffix: ' text.',
          startOffsetApprox: 6
        }
      }]
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const marks = [...doc.querySelectorAll('mark[data-highlight-id="highlight-h-1"]')];

    expect(marks).toHaveLength(2);
    expect(marks.map(mark => mark.textContent).join(' ').replace(/\s+/g, ' ').trim()).toBe('bold normal');
    marks.forEach(mark => {
      expect(mark.style.backgroundColor).toBe('rgb(189, 224, 254)');
    });
  });

  it('falls back to article text matching when no anchor exists', () => {
    const html = renderArticleContentWithHighlights(
      {
        content: '<p>Alpha beta gamma.</p>',
        url: 'https://example.com/article'
      },
      [{
        _id: 'h-2',
        text: 'beta gamma'
      }]
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const marks = [...doc.querySelectorAll('mark[data-highlight-id="highlight-h-2"]')];

    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('beta gamma');
  });
});
