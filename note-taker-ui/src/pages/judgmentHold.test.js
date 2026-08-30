import { answersHeldSentence } from './judgmentHold';

describe('answersHeldSentence', () => {
  it('keeps an overnight event only when it answers the held sentence', () => {
    const claim = 'Demand for compute outruns deliverable capacity.';
    expect(answersHeldSentence('Capacity exists.', claim).ok).toBe(false);
    expect(answersHeldSentence('Deliverable capacity continues to lag demand.', claim).ok).toBe(true);
  });

  it('prefers honest silence for an empty or stopword-only hold', () => {
    expect(answersHeldSentence('Anything at all', '').ok).toBe(false);
    expect(answersHeldSentence('Anything at all', 'the and of').ok).toBe(false);
  });
});
