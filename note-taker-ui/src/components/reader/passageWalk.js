/* The passages of a source, as the reader walks them with J and K. The mark
   lives on the paragraph itself, so no index can fall out of step when the
   article re-renders; with nothing marked yet, the walk starts at the first
   paragraph still on screen, where the reader already is. */
export const PASSAGES = '.article-reader-content p, .article-reader-content blockquote, .article-reader-content h2';
const HERE = 'is-reader-here';

export const walkPassages = (root, step, { reducedMotion = false } = {}) => {
  const passages = Array.from(root?.querySelectorAll(PASSAGES) || []);
  if (!passages.length) return null;
  const at = passages.findIndex((node) => node.classList.contains(HERE));
  const next = at < 0
    ? passages.find((node) => node.getBoundingClientRect().bottom > 0) || passages[0]
    : passages[Math.max(0, Math.min(passages.length - 1, at + step))];
  passages[at]?.classList.remove(HERE);
  next.classList.add(HERE);
  next.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  return next;
};
