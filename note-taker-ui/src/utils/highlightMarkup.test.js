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

  it('demotes imported article h1 tags so the reader header can own the page title', () => {
    const html = renderArticleContentWithHighlights(
      {
        content: '<h1>Original title</h1><p>Body copy.</p>',
        url: 'https://example.com/article'
      },
      []
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('h1')).toBeNull();
    expect(doc.querySelector('h2')?.textContent).toBe('Original title');
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

  it('inks a new highlight in the warm pen when no colour was stored', () => {
    const html = renderArticleContentWithHighlights(
      {
        content: '<p>Alpha beta gamma.</p>',
        url: 'https://example.com/article'
      },
      [{
        _id: 'h-warm',
        text: 'beta'
      }]
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mark = doc.querySelector('mark[data-highlight-id="highlight-h-warm"]');
    expect(mark.style.getPropertyValue('--highlight-color')).toBe('#f6e27a');
    expect(mark.style.backgroundColor).toBe('rgb(246, 226, 122)');
  });

  it('removes imported template syntax while preserving the article body', () => {
    const html = renderArticleContentWithHighlights({
      content: [
        '<p>URL: https://example.com/story</p>',
        '<p>Thought and Opinion</p>',
        '<p>Read Caption</p>',
        '<p>[[Margin of Safety]] ( attr(href) ) protects against mistakes.</p>'
      ].join(''),
      url: 'https://example.com/story'
    });

    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent;
    expect(text).toContain('Margin of Safety protects against mistakes.');
    expect(text).not.toMatch(/attr\(href\)|Read Caption|Thought and Opinion|URL:/i);
  });
});
