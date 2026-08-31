import { buildCanonicalHighlightPath } from '../../../utils/sourceRoutes';

const clean = (value) => String(value || '').trim();

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

export const resolveNotebookSource = (entry) => {
  const highlightBlocks = (entry?.blocks || []).filter((block) => (
    block?.type === 'highlight-ref' || block?.type === 'highlight_embed'
  ));
  const sourceBlock = highlightBlocks.find((block) => block?.articleId && block?.highlightId);
  const articleId = clean(sourceBlock?.articleId || entry?.linkedArticleId);
  const highlightId = clean(sourceBlock?.highlightId || entry?.linkedHighlightIds?.[0]);

  if (articleId) {
    return {
      kind: 'library',
      label: clean(sourceBlock?.articleTitle) || 'the saved source',
      href: buildCanonicalHighlightPath({ articleId, highlightId }),
      eyebrow: 'Ariadne thread · Library',
      action: 'Return to source'
    };
  }

  if (clean(entry?.importMeta?.sourceType).toLowerCase() !== 'concept') return null;

  const label = clean(entry?.importMeta?.sourceLabel) || 'Source concept';
  const draftTemplateLabel = clean(entry?.importMeta?.draftTemplateLabel);
  return {
    kind: 'concept',
    label,
    href: clean(entry?.importMeta?.sourceUrl)
      || `/think?tab=concepts&concept=${encodeURIComponent(label)}`,
    draftTemplateLabel,
    importedAt: formatDate(entry?.importMeta?.importedAt),
    eyebrow: draftTemplateLabel
      ? `Derived from concept · ${draftTemplateLabel}`
      : 'Derived from concept',
    action: 'Open concept'
  };
};

export const listNotebookHighlightReferences = (entry, limit = 6) => (
  (entry?.blocks || []).filter((block) => (
    block?.type === 'highlight-ref' || block?.type === 'highlight_embed'
  )).slice(0, limit)
);
