import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { QuietButton } from './ui';

const processArticleContent = (article, highlights = []) => {
  if (!article?.content) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(article.content, 'text/html');

  doc.querySelectorAll('script, style, noscript').forEach(node => node.remove());

  const origin = article.url ? new URL(article.url).origin : '';
  doc.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src && src.startsWith('/') && origin) {
      img.src = `${origin}${src}`;
    }
  });

  highlights.forEach(h => {
    const highlightId = `highlight-${h._id}`;
    const escaped = h.text
      ?.trim()
      .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    if (!escaped) return;
    const regex = new RegExp(`(?<!<mark[^>]*>)${escaped}(?!<\\/mark>)`, 'gi');
    doc.body.innerHTML = doc.body.innerHTML.replace(
      regex,
      match => `<mark class="highlight" data-highlight-id="${highlightId}">${match}</mark>`
    );
  });

  return doc.body.innerHTML;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const ArticleReader = forwardRef(({
  article,
  highlights = [],
  readingMode,
  onToggleReadingMode,
  onMove
}, ref) => {
  const contentRef = useRef(null);
  const html = useMemo(
    () => processArticleContent(article, highlights),
    [article, highlights]
  );

  useImperativeHandle(ref, () => ({
    scrollToHighlight: (highlightId) => {
      if (!contentRef.current) return;
      const target = contentRef.current.querySelector(`[data-highlight-id="highlight-${highlightId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }));

  if (!article) {
    return (
      <div className="article-reader-empty">
        <p className="muted">Select an article to start reading.</p>
      </div>
    );
  }

  return (
    <div className="article-reader">
      <div className="article-reader-header">
        <div>
          <div className="article-reader-title">{article.title || 'Untitled article'}</div>
          <div className="article-reader-meta">
            {article.createdAt && <span>{formatDate(article.createdAt)}</span>}
            {article.url && (
              <a href={article.url} target="_blank" rel="noopener noreferrer">Open source</a>
            )}
          </div>
        </div>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          {onMove && (
            <QuietButton onClick={onMove}>
              Move
            </QuietButton>
          )}
          {onToggleReadingMode && (
            <QuietButton onClick={onToggleReadingMode}>
              {readingMode ? 'Exit reading mode' : 'Reading mode'}
            </QuietButton>
          )}
        </div>
      </div>
      <div className="article-reader-content" ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});

export default ArticleReader;
