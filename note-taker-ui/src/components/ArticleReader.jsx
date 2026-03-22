import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { QuietButton } from './ui';
import { createHighlight } from '../api/highlights';
import useTextSelection from './reader/useTextSelection';
import SelectionMenu from './reader/SelectionMenu';
import { DEFAULT_HIGHLIGHT_COLOR } from '../constants/highlightColors';

const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

const normalizeHighlightColor = (value) => (
  /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim())
    ? String(value).trim().toLowerCase()
    : DEFAULT_HIGHLIGHT_COLOR
);

const buildTextSnapshot = (root) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let fullText = '';
  let current;

  while ((current = walker.nextNode())) {
    const parentTag = current.parentElement?.tagName?.toUpperCase() || '';
    if (SKIP_TEXT_TAGS.has(parentTag)) continue;
    const value = current.nodeValue || '';
    if (!value) continue;
    const start = fullText.length;
    fullText += value;
    nodes.push({ node: current, start, end: fullText.length });
  }

  return { fullText, nodes };
};

const collectMatchStarts = (haystack, needle) => {
  const matches = [];
  if (!needle) return matches;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    matches.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return matches;
};

const scoreBoundary = (actual, expected, mode) => {
  if (!expected) return 0;
  if (actual === expected) return 60;
  if (mode === 'prefix' && expected.startsWith(actual)) return 20;
  if (mode === 'suffix' && expected.endsWith(actual)) return 20;
  return 0;
};

const resolveHighlightOffsets = (root, highlight) => {
  const { fullText } = buildTextSnapshot(root);
  const anchor = highlight?.anchor || null;
  const targetText = String(anchor?.text || highlight?.text || '').trim();
  if (!targetText) return null;

  const starts = collectMatchStarts(fullText, targetText);
  if (starts.length === 0) return null;

  const prefix = String(anchor?.prefix || '');
  const suffix = String(anchor?.suffix || '');
  const approx = Number.isFinite(anchor?.startOffsetApprox) ? anchor.startOffsetApprox : null;

  const ranked = starts.map((start) => {
    const end = start + targetText.length;
    const actualPrefix = prefix ? fullText.slice(Math.max(0, start - prefix.length), start) : '';
    const actualSuffix = suffix ? fullText.slice(end, end + suffix.length) : '';
    let score = 0;
    score += scoreBoundary(actualPrefix, prefix, 'suffix');
    score += scoreBoundary(actualSuffix, suffix, 'prefix');
    if (approx !== null) {
      score -= Math.abs(start - approx) / 8;
    }
    return { start, end, score };
  });

  ranked.sort((a, b) => b.score - a.score || a.start - b.start);
  return ranked[0];
};

const wrapTextNodeSegment = (node, start, end, highlightId, color) => {
  if (!node || end <= start) return;
  let target = node;
  if (start > 0) target = target.splitText(start);
  if (end - start < target.nodeValue.length) target.splitText(end - start);
  if (!target.parentNode) return;
  if (target.parentNode.nodeName === 'MARK') return;

  const mark = target.ownerDocument.createElement('mark');
  mark.className = 'highlight';
  mark.dataset.highlightId = `highlight-${highlightId}`;
  mark.style.backgroundColor = normalizeHighlightColor(color);
  target.parentNode.replaceChild(mark, target);
  mark.appendChild(target);
};

const applyStoredHighlight = (root, highlight) => {
  const resolved = resolveHighlightOffsets(root, highlight);
  if (!resolved) return;
  const { start, end } = resolved;
  const { nodes } = buildTextSnapshot(root);
  nodes
    .filter(({ end: nodeEnd, start: nodeStart }) => nodeEnd > start && nodeStart < end)
    .forEach(({ node, start: nodeStart }) => {
      const segmentStart = Math.max(0, start - nodeStart);
      const segmentEnd = Math.min(node.nodeValue.length, end - nodeStart);
      wrapTextNodeSegment(node, segmentStart, segmentEnd, highlight?._id, highlight?.color);
    });
};

const processArticleContent = (article, highlights = []) => {
  if (!article?.content) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(article.content, 'text/html');

  doc.querySelectorAll('script, style, noscript').forEach(node => node.remove());

  // Normalize imported article HTML so external dark-mode inline colors
  // don't override the app's reading palette.
  doc.querySelectorAll('[style]').forEach((node) => {
    const raw = node.getAttribute('style');
    if (!raw) return;
    const cleaned = raw
      .replace(/(?:^|;)\s*color\s*:[^;]*/gi, '')
      .replace(/(?:^|;)\s*background(?:-color)?\s*:[^;]*/gi, '')
      .replace(/(?:^|;)\s*font-family\s*:[^;]*/gi, '')
      .replace(/^\s*;+\s*|\s*;+\s*$/g, '')
      .trim();
    if (cleaned) {
      node.setAttribute('style', cleaned);
    } else {
      node.removeAttribute('style');
    }
  });

  const origin = article.url ? new URL(article.url).origin : '';
  doc.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src && src.startsWith('/') && origin) {
      img.src = `${origin}${src}`;
    }
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
  });

  doc.querySelectorAll('video, iframe').forEach(media => {
    if (media.tagName.toLowerCase() === 'iframe') {
      media.setAttribute('loading', 'lazy');
    }
    media.style.maxWidth = '100%';
    media.style.width = '100%';
    media.style.height = media.style.height || 'auto';
    media.style.display = 'block';
  });

  highlights.forEach((highlight) => applyStoredHighlight(doc.body, highlight));

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
  onMove,
  onHighlightOptimistic,
  onHighlightReplace,
  onHighlightRemove
}, ref) => {
  const contentRef = useRef(null);
  const menuRef = useRef(null);
  const [saveError, setSaveError] = useState('');
  const html = useMemo(
    () => processArticleContent(article, highlights),
    [article, highlights]
  );
  const { selectionState, clearSelection } = useTextSelection({
    containerRef: contentRef,
    menuRef
  });

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

  const handleCreateHighlight = async () => {
    if (!article || !selectionState.text) return;
    const highlightText = selectionState.text;
    const highlightAnchor = selectionState.anchor;
    setSaveError('');
    const tempId = `temp-${Date.now()}`;
    const optimisticHighlight = {
      _id: tempId,
      text: highlightText,
      tags: [],
      color: DEFAULT_HIGHLIGHT_COLOR,
      articleId: article._id,
      articleTitle: article.title,
      createdAt: new Date().toISOString(),
      anchor: highlightAnchor
    };
    onHighlightOptimistic?.(optimisticHighlight);
    clearSelection();
    try {
      const created = await createHighlight({
        articleId: article._id,
        text: highlightText,
        tags: [],
        anchor: highlightAnchor
      });
      if (created?._id) {
        onHighlightReplace?.(tempId, created);
      } else {
        onHighlightRemove?.(tempId);
      }
    } catch (err) {
      onHighlightRemove?.(tempId);
      setSaveError(err.response?.data?.error || 'Failed to save highlight.');
    }
  };

  return (
    <div className="article-reader">
      {selectionState.isOpen && (
        <SelectionMenu
          ref={menuRef}
          rect={selectionState.rect}
          onHighlight={handleCreateHighlight}
          onAddNote={() => setSaveError('Add to Notebook is coming soon.')}
          onAddQuestion={() => setSaveError('Add to Question is coming soon.')}
          onAddTag={() => setSaveError('Add Tag is coming soon.')}
        />
      )}
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
        </div>
      </div>
      <div className="article-reader-content reader" ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} />
      {saveError && <p className="status-message error-message">{saveError}</p>}
    </div>
  );
});

export default ArticleReader;
