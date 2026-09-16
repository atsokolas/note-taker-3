import {
  canonicalArticleSnapshot,
  resolveExactArticlePassage
} from '../../utils/articlePassageAnchor';

export const READING_PASSAGES = 'p, blockquote, h2, h3, li';
export const readingCandidates = (root) =>
  [...(root?.querySelectorAll(READING_PASSAGES) || [])].filter(
    (node) =>
      !node.closest('[data-reader-control]') &&
      !node.querySelector(READING_PASSAGES) &&
      node.textContent.trim().length >= 16
  );

export const passageAnchorAt = (snapshot, start, end) => ({
  text: snapshot.fullText.slice(start, Math.min(end, start + 1600)),
  prefix: snapshot.fullText.slice(Math.max(0, start - 80), start),
  suffix: snapshot.fullText.slice(
    Math.min(end, start + 1600),
    Math.min(end, start + 1600) + 80
  ),
  startOffsetApprox: start
});

export const anchorForReadingNode = (
  root,
  node,
  snapshot = canonicalArticleSnapshot(root)
) => {
  const indices = [];
  snapshot.units.forEach((unit, index) => {
    if (unit.node && node.contains(unit.node)) indices.push(index);
  });
  if (!indices.length) return null;
  return passageAnchorAt(snapshot, indices[0], indices[indices.length - 1] + 1);
};

export const resolveReadingPlace = (root, place) => {
  if (!root || !place?.anchor) return null;
  const snapshot = canonicalArticleSnapshot(root);
  const resolved = resolveExactArticlePassage(snapshot.fullText, place.anchor);
  if (resolved.status === 'found') {
    const unit = snapshot.units
      .slice(resolved.start, resolved.end)
      .find((item) => item.node);
    const node = unit?.node?.parentElement?.closest(READING_PASSAGES);
    if (node && root.contains(node)) return { node, exact: true };
  }
  if (!Number.isFinite(place.ratio) || place.ratio < 0 || place.ratio > 1)
    return null;
  const target = Math.floor(snapshot.units.length * place.ratio);
  const unit = snapshot.units.slice(target).find((item) => item.node);
  const node = unit?.node?.parentElement?.closest(READING_PASSAGES);
  return node && root.contains(node) ? { node, exact: false } : null;
};

export const previewPassage = (
  root,
  { readingState, query = '', highlightId = '' } = {}
) => {
  const snapshot = canonicalArticleSnapshot(root);
  if (highlightId) {
    const mark = [...root.querySelectorAll('[data-highlight-id]')].find(
      (node) => node.dataset.highlightId === `highlight-${highlightId}`
    );
    if (mark)
      return anchorForReadingNode(
        root,
        mark.closest(READING_PASSAGES) || mark,
        snapshot
      );
  }
  if (query) {
    const at = snapshot.fullText.toLowerCase().indexOf(query.toLowerCase());
    if (at >= 0) {
      const node = snapshot.units
        .slice(at)
        .find((unit) => unit.node)
        ?.node.parentElement.closest(READING_PASSAGES);
      return node
        ? anchorForReadingNode(root, node, snapshot)
        : passageAnchorAt(
            snapshot,
            Math.max(0, at - 60),
            Math.min(snapshot.fullText.length, at + query.length + 160)
          );
    }
    return null;
  }
  if (readingState?.anchor) {
    const resolved = resolveReadingPlace(root, readingState);
    if (resolved?.exact)
      return anchorForReadingNode(root, resolved.node, snapshot);
  }
  const node = readingCandidates(root)[0];
  return node ? anchorForReadingNode(root, node, snapshot) : null;
};
