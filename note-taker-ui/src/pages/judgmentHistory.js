import { wordBoundaryTrim } from '../utils/editorialText';
import { formatLedgerDate } from './judgmentModel';

const TEASER = 72;

export const abbreviateLine = (text, limit = TEASER) => (
  wordBoundaryTrim(text, { maxLength: limit })
);

const stamp = (value) => formatLedgerDate(value);

/*
 * What has happened to a belief, as a few dated lines.
 *
 * The case already names its reasons, objections and tests. This list is the
 * record after that: when you began to hold it, what it taught you, and
 * whether a review ever came due. Clocks live in the ledger and join the
 * same spine on the page; they are not repeated here.
 */
export const historyEvents = ({ view = {} } = {}) => {
  const events = [];

  (Array.isArray(view.lessons) ? view.lessons : []).forEach((lesson) => {
    const text = String(lesson?.text || '').trim();
    if (!text) return;
    events.push({
      id: lesson.id || `lesson:${text}`,
      at: lesson.at || '',
      when: stamp(lesson.at),
      teaser: abbreviateLine(text),
      detail: text
    });
  });

  if (view.review) {
    const observed = view.review.state === 'observed';
    const text = observed
      ? (view.review.summary || view.review.lesson || 'You said what happened.')
      : 'The review date passed. Nothing is filled in until you say what happened.';
    const detail = [view.review.summary, view.review.lesson].filter(Boolean).join(' ');
    events.push({
      id: `review:${view.review.decisionId || view.review.state}`,
      at: view.review.at || '',
      when: stamp(view.review.at),
      teaser: abbreviateLine(text),
      detail: detail || text
    });
  }

  return events;
};
