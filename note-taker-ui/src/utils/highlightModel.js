import { DEFAULT_HIGHLIGHT_COLOR } from '../constants/highlightColors';

export const normalizeHighlight = (highlight, article) => ({
  ...highlight,
  tags: highlight?.tags || [],
  color: highlight?.color || DEFAULT_HIGHLIGHT_COLOR,
  articleId: highlight?.articleId || article?._id,
  articleTitle: highlight?.articleTitle || article?.title
});

export const normalizeHighlights = (highlights = [], article) => (
  highlights.map(highlight => normalizeHighlight(highlight, article))
);
