import { useRef } from 'react';
import { peekSentenceHandoff } from './columnMotion';
import { normalizeSpaces } from '../utils/editorialText';

/**
 * Decide once whether an arriving row is the destination of a sentence in
 * flight, and hold that answer for as long as the arrival lasts.
 *
 * The handoff is a single slot that the first claimant empties, so peeking at
 * it is only truthful the first time. Any re-render during the arrival — a
 * sibling's state, a context that ticked — would otherwise find the slot empty
 * and quietly downgrade a flight to a plain entrance. That is the kind of bug
 * that never throws: the sentence still lands, it just stops travelling, and
 * nobody can say when it stopped.
 *
 * So the answer is taken on the first paint of the arrival and latched. A new
 * arrival gets a new decision; a re-render gets the old one.
 */
export const useFlightDecision = (arriving, text) => {
  const decided = useRef(null);
  if (!arriving) decided.current = null;
  else if (decided.current === null) {
    decided.current = peekSentenceHandoff()?.sentence === normalizeSpaces(text);
  }
  return arriving && decided.current === true;
};
