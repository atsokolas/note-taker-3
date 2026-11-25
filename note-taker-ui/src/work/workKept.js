import { tokensOf } from '../utils/libraryPassageRetrieval';
import { pathOf } from '../components/home/homeModel';

/* What you keep for good that bears on a project, matched here in the
   browser by the words the two share, so no Work text leaves the page.
   Eligible: anything on Kept except threads' own titles, which name books,
   not ideas. Bar: two distinct words of four letters or more in common.
   Silence: below the bar, nothing is shown. */
export const KEPT_BESIDE = 3;
const SHARED_WORDS = 2;

const wordsOf = text => new Set(tokensOf(text).filter(word => word.length >= 4).map(word => word.replace(/s$/, '')));

export const keptBeside = (kept, projectText) => {
  const project = wordsOf(projectText);
  return kept
    .filter(held => held.kind !== 'thread')
    .map(held => ({ held, shared: [...wordsOf(`${held.title} ${held.text || ''} ${held.note || ''}`)].filter(word => project.has(word)).length }))
    .filter(({ shared }) => shared >= SHARED_WORDS)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, KEPT_BESIDE)
    .map(({ held }) => ({ ...held, path: pathOf(held) }));
};
