import { cleanSourceTextForDisplay } from './sourceDisplayText';

const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const clean = (value) => cleanSourceTextForDisplay(value || '');

// Exact recorded use only. Similar wording is not a use.
export const sameRecordedPassage = (candidate, recorded) => {
  const passage = clean(candidate?.passage).toLowerCase();
  const sameHighlight = Boolean(candidate?.highlightId)
    && idOf(recorded?.articleId) === idOf(candidate.articleId)
    && idOf(recorded?.highlightId) === idOf(candidate.highlightId);
  return sameHighlight || Boolean(passage && clean(recorded?.passage).toLowerCase() === passage);
};

export const alreadyUsedHere = (candidate, recordedUses = []) => (
  recordedUses.some((item) => sameRecordedPassage(candidate, item))
);

export const recordedUsesFromSources = (sources = []) => (
  (Array.isArray(sources) ? sources : []).filter((source) => (
    source?.articleId || source?.highlightId || clean(source?.passage)
  ))
);

export const recordedUsesFromQuestionBlocks = (blocks = []) => (
  (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block?.highlightId || block?.articleId || block?.sourcePath)
    .map((block) => ({
      articleId: block?.articleId,
      highlightId: block?.highlightId,
      passage: block?.text
    }))
)

export const questionBlockFromPassage = (passage, createId) => ({
  id: createId(),
  type: passage?.highlightId ? 'highlight-ref' : 'paragraph',
  text: passage?.passage || '',
  highlightId: passage?.highlightId || null,
  articleId: passage?.articleId || null,
  articleTitle: passage?.title || 'Untitled source',
  sourcePath: passage?.href || ''
});

export const linkedHighlightIdsFromBlocks = (blocks = []) => (
  [...new Set((Array.isArray(blocks) ? blocks : [])
    .map((block) => String(block?.highlightId || '').trim())
    .filter(Boolean))]
);

const highlightIdsOf = (value) => (
  [...new Set((Array.isArray(value) ? value : [value])
    .map((id) => String(id || '').trim())
    .filter(Boolean))]
);

// Question links can exist with empty blocks (All Highlights → New Question).
// Keep those, add ids from placed blocks, and drop an id only when undo asks
// and no remaining block still holds it.
export const mergeQuestionHighlightLinks = (question = {}, blocks = [], { removeHighlightIds = [] } = {}) => {
  const existing = highlightIdsOf([
    ...(Array.isArray(question?.linkedHighlightIds) ? question.linkedHighlightIds : []),
    question?.linkedHighlightId
  ]);
  const fromBlocks = linkedHighlightIdsFromBlocks(blocks);
  const stillOnBlocks = new Set(fromBlocks);
  const remove = new Set(highlightIdsOf(removeHighlightIds).filter((id) => !stillOnBlocks.has(id)));
  return [...new Set([...existing, ...fromBlocks])].filter((id) => !remove.has(id));
};
