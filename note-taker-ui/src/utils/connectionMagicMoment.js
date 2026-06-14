/**
 * Compose user-facing copy after a source connects. Uses real counts when
 * available and falls back to honest generic copy when not.
 */
export const composeReadwiseConnectMoment = ({
  highlightCount = 0,
  activeConceptCount = 0,
  previewHighlights = null,
  previewItems = null
} = {}) => {
  const highlights = Number.isFinite(previewHighlights)
    ? previewHighlights
    : (Number.isFinite(highlightCount) ? highlightCount : 0);
  const concepts = Number.isFinite(activeConceptCount) ? activeConceptCount : 0;
  const previewScope = Number.isFinite(previewItems) ? previewItems : 0;

  if (highlights > 0 && concepts > 0) {
    return `Readwise connected. I found ${highlights} highlight${highlights === 1 ? '' : 's'} that can strengthen ${concepts} active concept${concepts === 1 ? '' : 's'}.`;
  }
  if (highlights > 0) {
    return `Readwise connected. I found ${highlights} highlight${highlights === 1 ? '' : 's'} ready to tie into your thinking.`;
  }
  if (previewScope > 0) {
    return `Readwise connected. Your reading layer is linked — sync when you are ready to pull highlights in.`;
  }
  return 'Readwise connected. Browser authorization is ready — sync highlights when you want to strengthen your concepts.';
};

export const countActiveConcepts = (concepts = []) => (
  (Array.isArray(concepts) ? concepts : []).filter((item) => {
    const count = Number(item?.count || 0);
    const pinned = (Array.isArray(item?.pinnedHighlightIds) ? item.pinnedHighlightIds.length : 0)
      + (Array.isArray(item?.pinnedArticleIds) ? item.pinnedArticleIds.length : 0)
      + (Array.isArray(item?.pinnedNoteIds) ? item.pinnedNoteIds.length : 0);
    return count > 0 || pinned > 0 || String(item?.description || '').trim();
  }).length
);

export const buildSharePreviewReceipt = () => (
  'Public page ready: citations included, private source notes withheld.'
);
