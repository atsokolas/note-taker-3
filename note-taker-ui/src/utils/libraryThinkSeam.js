const clean = (value) => String(value || '').trim();

const normalizedPassage = (value) => clean(value).replace(/\s+/g, ' ').toLowerCase();

export const findExistingHighlightForSelection = ({ highlights = [], text, anchor } = {}) => {
  const passage = normalizedPassage(text);
  if (!passage) return null;
  const matches = (Array.isArray(highlights) ? highlights : []).filter((highlight) => (
    normalizedPassage(highlight?.anchor?.text || highlight?.text) === passage
    && clean(highlight?._id || highlight?.id)
  ));
  if (!matches.length) return null;

  const selectedOffset = Number(anchor?.startOffsetApprox);
  if (Number.isFinite(selectedOffset)) {
    const anchored = matches
      .map((highlight) => ({
        highlight,
        distance: Math.abs(Number(highlight?.anchor?.startOffsetApprox) - selectedOffset)
      }))
      .filter(({ distance }) => Number.isFinite(distance))
      .sort((a, b) => a.distance - b.distance);
    if (anchored[0]?.distance <= 2) return anchored[0].highlight;
    // A selected occurrence with a usable anchor must never fall back to a
    // different anchored occurrence that merely has identical text.
    if (anchored.length) return null;
  }

  // Text-only legacy highlights are safe to reuse only when the passage is
  // unique. Repeated identical sentences still require an anchor match.
  const unanchored = matches.filter(highlight => !Number.isFinite(Number(highlight?.anchor?.startOffsetApprox)));
  return unanchored.length === 1 ? unanchored[0] : null;
};

export const buildLibrarianSelectionPrompt = (highlight = {}) => {
  const passage = clean(highlight?.text);
  if (!passage) return '';
  return `Help me understand this passage in the context of the source and my Library:\n\n“${passage}”`;
};

export const buildLibraryThinkHref = ({ type, id, name } = {}) => {
  const safeId = clean(id);
  if (type === 'question') {
    return safeId
      ? `/think?tab=questions&questionId=${encodeURIComponent(safeId)}`
      : '/think?tab=questions';
  }
  if (safeId) return `/think?tab=concepts&conceptId=${encodeURIComponent(safeId)}`;
  const safeName = clean(name);
  return safeName
    ? `/think?tab=concepts&concept=${encodeURIComponent(safeName)}`
    : '/think?tab=concepts';
};
