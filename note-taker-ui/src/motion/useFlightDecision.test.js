import { renderHook } from '@testing-library/react';
import { useFlightDecision } from './useFlightDecision';
import { handOffSentence, clearSentenceHandoff } from './columnMotion';

const somewhere = { getBoundingClientRect: () => ({ top: 10, left: 20, width: 300, height: 40 }) };

describe('useFlightDecision', () => {
  afterEach(clearSentenceHandoff);

  it('says no when nothing was handed off', () => {
    const { result } = renderHook(() => useFlightDecision(true, 'A sentence nobody sent.'));
    expect(result.current).toBe(false);
  });

  it('matches the handed-off sentence across differing whitespace', () => {
    handOffSentence('Capacity  arrives\nbefore demand.', somewhere);
    const { result } = renderHook(() => useFlightDecision(true, 'Capacity arrives before demand.'));
    expect(result.current).toBe(true);
  });

  it('holds the decision when the row re-renders and the slot has been emptied', () => {
    handOffSentence('Capacity arrives before demand.', somewhere);
    const { result, rerender } = renderHook(() => useFlightDecision(true, 'Capacity arrives before demand.'));
    expect(result.current).toBe(true);
    // What consuming the handoff looks like from this row's point of view.
    clearSentenceHandoff();
    rerender();
    rerender();
    expect(result.current).toBe(true);
  });

  it('does not fly a row that is no longer arriving', () => {
    handOffSentence('Capacity arrives before demand.', somewhere);
    const { result, rerender } = renderHook(
      ({ arriving }) => useFlightDecision(arriving, 'Capacity arrives before demand.'),
      { initialProps: { arriving: true } }
    );
    expect(result.current).toBe(true);
    rerender({ arriving: false });
    expect(result.current).toBe(false);
  });

  it('decides afresh for the next arrival rather than reusing the last answer', () => {
    handOffSentence('Capacity arrives before demand.', somewhere);
    const { result, rerender } = renderHook(
      ({ arriving }) => useFlightDecision(arriving, 'Capacity arrives before demand.'),
      { initialProps: { arriving: true } }
    );
    expect(result.current).toBe(true);
    rerender({ arriving: false });
    clearSentenceHandoff();
    rerender({ arriving: true });
    expect(result.current).toBe(false);
  });
});
