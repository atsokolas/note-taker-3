import { buildTextSnapshot } from './highlightMarkup';
import { buildCanonicalArticlePath } from './sourceRoutes';

export const ARTICLE_PASSAGE_TEXT_LIMIT = 6000;
export const ARTICLE_PASSAGE_CONTEXT_LIMIT = 240;
const FRAGMENT_PREFIX = '#passage=';
export const ARTICLE_PASSAGE_FRAGMENT_LIMIT = 80000;

const cleanId = (value) => String(value?._id || value?.id || value || '').trim();

const validAnchor = (anchor) => {
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) return false;
  if (typeof anchor.text !== 'string' || !anchor.text || anchor.text.length > ARTICLE_PASSAGE_TEXT_LIMIT) return false;
  if (typeof anchor.prefix !== 'string' || anchor.prefix.length > ARTICLE_PASSAGE_CONTEXT_LIMIT) return false;
  if (typeof anchor.suffix !== 'string' || anchor.suffix.length > ARTICLE_PASSAGE_CONTEXT_LIMIT) return false;
  return Number.isInteger(anchor.startOffsetApprox) && anchor.startOffsetApprox >= 0;
};

const payloadForHref = ({ articleId, anchor } = {}) => ({
  v: 1,
  articleId: cleanId(articleId),
  text: String(anchor?.text || ''),
  prefix: String(anchor?.prefix || '').slice(-ARTICLE_PASSAGE_CONTEXT_LIMIT),
  suffix: String(anchor?.suffix || '').slice(0, ARTICLE_PASSAGE_CONTEXT_LIMIT),
  startOffsetApprox: Number(anchor?.startOffsetApprox)
});

export const buildArticlePassageHref = ({ articleId, anchor } = {}) => {
  const payload = payloadForHref({ articleId, anchor });
  if (!payload.articleId || !validAnchor(payload)) return '';
  const hash = `${FRAGMENT_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
  if (hash.length > ARTICLE_PASSAGE_FRAGMENT_LIMIT) return '';
  return `${buildCanonicalArticlePath(payload.articleId)}${hash}`;
};

export const readArticlePassageFragment = (hash = '', articleId = '') => {
  const raw = String(hash || '');
  if (!raw.startsWith(FRAGMENT_PREFIX)) return { status: 'absent', anchor: null };
  if (raw.length > ARTICLE_PASSAGE_FRAGMENT_LIMIT) return { status: 'oversize', anchor: null };
  try {
    const parsed = JSON.parse(decodeURIComponent(raw.slice(FRAGMENT_PREFIX.length)));
    const parsedArticleId = typeof parsed?.articleId === 'string' ? parsed.articleId.trim() : '';
    if (parsed?.v !== 1 || !parsedArticleId || !validAnchor(parsed)) {
      return { status: 'malformed', anchor: null };
    }
    if (parsedArticleId !== cleanId(articleId)) {
      return { status: 'article-mismatch', anchor: null };
    }
    return {
      status: 'ready',
      anchor: {
        text: parsed.text,
        prefix: parsed.prefix,
        suffix: parsed.suffix,
        startOffsetApprox: parsed.startOffsetApprox
      }
    };
  } catch (_unreadable) {
    return { status: 'malformed', anchor: null };
  }
};

const matchStarts = (text, passage) => {
  const starts = [];
  let index = text.indexOf(passage);
  while (index >= 0) {
    starts.push(index);
    index = text.indexOf(passage, index + 1);
  }
  return starts;
};

const syntheticSpace = () => ({ character: ' ', node: null, start: 0, end: 0 });

const sourceUnits = (root, readableNodes) => {
  const units = [];
  const visit = (parent) => {
    Array.from(parent.childNodes || []).forEach((child) => {
      if (child.nodeType === 3) {
        if (!readableNodes.has(child)) return;
        String(child.nodeValue || '').split('').forEach((character, offset) => {
          units.push({ character, node: child, start: offset, end: offset + 1 });
        });
        return;
      }
      if (child.nodeType !== 1) {
        units.push(syntheticSpace());
        return;
      }
      const storedHighlight = child.matches?.('mark.highlight[data-highlight-id]');
      if (!storedHighlight) units.push(syntheticSpace());
      visit(child);
      if (!storedHighlight) units.push(syntheticSpace());
    });
  };
  visit(root);
  return units;
};

const unitText = (units) => units.map((unit) => unit.character).join('');

const removeUnitMatches = (units, expression) => {
  const text = unitText(units);
  const remove = new Set();
  const flags = expression.flags.includes('g') ? expression.flags : `${expression.flags}g`;
  const regex = new RegExp(expression.source, flags);
  let match;
  while ((match = regex.exec(text))) {
    for (let index = match.index; index < match.index + match[0].length; index += 1) remove.add(index);
    if (!match[0]) regex.lastIndex += 1;
  }
  return units.filter((_unit, index) => !remove.has(index));
};

const unwrapDoubleBrackets = (units) => {
  const text = unitText(units);
  const remove = new Set();
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(text))) {
    remove.add(match.index);
    remove.add(match.index + 1);
    remove.add(match.index + match[0].length - 2);
    remove.add(match.index + match[0].length - 1);
  }
  return units.filter((_unit, index) => !remove.has(index));
};

const collapseWhitespace = (units) => {
  const collapsed = [];
  let index = 0;
  while (index < units.length) {
    if (!/\s/.test(units[index].character)) {
      collapsed.push(units[index]);
      index += 1;
      continue;
    }
    let mapped = null;
    while (units[index] && /\s/.test(units[index].character)) {
      if (!mapped && units[index].node) mapped = units[index];
      index += 1;
    }
    collapsed.push({ ...(mapped || syntheticSpace()), character: ' ' });
  }
  while (collapsed[0]?.character === ' ') collapsed.shift();
  while (collapsed[collapsed.length - 1]?.character === ' ') collapsed.pop();
  return collapsed;
};

const replacePipes = (units) => units.flatMap((unit) => (
  unit.character === '|'
    ? [syntheticSpace(), { ...unit, character: '·' }, syntheticSpace()]
    : [unit]
));

const canonicalizeUnits = (initial) => {
  let units = initial;
  units = removeUnitMatches(units, /\(\s*attr\(href\)\s*\)/gi);
  units = unwrapDoubleBrackets(units);
  units = removeUnitMatches(units, /\|\s*Reading Time:\s*\d+\s*minutes?\.?/gi);
  units = removeUnitMatches(units, /\bReading Time:\s*\d+\s*minutes?\.?/gi);
  units = collapseWhitespace(units);
  units = removeUnitMatches(units, /\bURL:\s*https?:\/\/\S+/gi);
  units = removeUnitMatches(units, /\bName:\s*/gi);
  units = replacePipes(units);
  units = collapseWhitespace(units);
  units = removeUnitMatches(units, /(?:^|(?:[.]|\s+·)\s*)Thought and Opinion\s*$/i);
  units = removeUnitMatches(units, /\s+·\s*$/g);
  return collapseWhitespace(units);
};

const canonicalSnapshot = (root) => {
  // Reuse the reader's snapshot to preserve its exclusions, then carry the
  // same import cleanup as the chooser through units that still point home.
  const snapshot = buildTextSnapshot(root);
  const units = canonicalizeUnits(sourceUnits(root, new Set(snapshot.nodes.map(({ node }) => node))));
  return { fullText: unitText(units), units };
};

export const resolveExactArticlePassage = (fullText = '', anchor = null) => {
  if (!validAnchor(anchor)) return { status: 'malformed' };
  const source = String(fullText || '');
  const candidates = matchStarts(source, anchor.text).filter((start) => {
    const end = start + anchor.text.length;
    const prefix = anchor.prefix
      ? source.slice(Math.max(0, start - anchor.prefix.length), start)
      : '';
    const suffix = anchor.suffix ? source.slice(end, end + anchor.suffix.length) : '';
    return (!anchor.prefix || prefix === anchor.prefix)
      && (!anchor.suffix || suffix === anchor.suffix);
  });
  if (candidates.length === 1) {
    return { status: 'found', start: candidates[0], end: candidates[0] + anchor.text.length };
  }
  if (candidates.length > 1) {
    const exactOffset = candidates.filter((start) => start === anchor.startOffsetApprox);
    if (exactOffset.length === 1) {
      return { status: 'found', start: exactOffset[0], end: exactOffset[0] + anchor.text.length };
    }
    return { status: 'ambiguous' };
  }
  return { status: 'missing' };
};

export const markExactArticlePassage = (root, anchor) => {
  if (!root) return { status: 'missing' };
  const snapshot = canonicalSnapshot(root);
  const resolved = resolveExactArticlePassage(snapshot.fullText, anchor);
  if (resolved.status !== 'found') return resolved;
  const segments = [];
  snapshot.units.slice(resolved.start, resolved.end).forEach((unit) => {
    if (!unit.node) return;
    const previous = segments[segments.length - 1];
    if (previous?.node === unit.node && previous.end === unit.start) {
      previous.end = unit.end;
    } else {
      segments.push({ node: unit.node, start: unit.start, end: unit.end });
    }
  });
  segments.reverse().forEach(({ node, start, end }) => {
    let target = node;
    if (start > 0) target = target.splitText(start);
    if (end - start < target.nodeValue.length) target.splitText(end - start);
    if (!target.parentNode) return;
    const span = target.ownerDocument.createElement('span');
    span.className = 'article-passage-return is-cited-passage';
    span.dataset.transientPassage = 'true';
    target.parentNode.replaceChild(span, target);
    span.appendChild(target);
  });
  return resolved;
};
