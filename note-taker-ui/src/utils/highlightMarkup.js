import { DEFAULT_HIGHLIGHT_COLOR } from '../constants/highlightColors';

const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

export const normalizeHighlightColor = (value) => (
  /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim())
    ? String(value).trim().toLowerCase()
    : DEFAULT_HIGHLIGHT_COLOR
);

export const buildTextSnapshot = (root) => {
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

export const resolveHighlightOffsets = (root, highlight) => {
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
  mark.style.setProperty('--highlight-color', normalizeHighlightColor(color));
  mark.style.backgroundColor = normalizeHighlightColor(color);
  target.parentNode.replaceChild(mark, target);
  mark.appendChild(target);
};

export const applyStoredHighlight = (root, highlight) => {
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

export const renderArticleContentWithHighlights = (article, highlights = []) => {
  if (!article?.content) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(article.content, 'text/html');

  doc.querySelectorAll('script, style, noscript').forEach(node => node.remove());

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
