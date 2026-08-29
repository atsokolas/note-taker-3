import {
  clearSentenceHandoff,
  flySentenceInto,
  handOffSentence,
  peekSentenceHandoff,
  resetFirstPaint,
  takeFirstPaint
} from './columnMotion';

const nodeAt = (rect) => {
  const animate = jest.fn(() => ({ finished: Promise.resolve() }));
  return {
    animate,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, ...rect })
  };
};

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  resetFirstPaint();
  clearSentenceHandoff();
  window.matchMedia = originalMatchMedia;
});

describe('the arrival stagger', () => {
  it('plays the first time a surface is seen and never again', () => {
    expect(takeFirstPaint('judgment:1')).toBe(true);
    expect(takeFirstPaint('judgment:1')).toBe(false);
    expect(takeFirstPaint('judgment:1')).toBe(false);
  });

  it('is tracked per surface, so a different claim still arrives', () => {
    expect(takeFirstPaint('judgment:1')).toBe(true);
    expect(takeFirstPaint('judgment:2')).toBe(true);
  });
});

describe('the shared sentence', () => {
  it('carries the sentence and where it was', () => {
    handOffSentence('  A claim   sentence. ', nodeAt({ top: 120, left: 40, width: 300 }));

    expect(peekSentenceHandoff()).toEqual(expect.objectContaining({
      sentence: 'A claim sentence.',
      rect: expect.objectContaining({ top: 120, left: 40, width: 300 })
    }));
  });

  it('flies the destination from where the sentence was, and consumes the handoff', () => {
    handOffSentence('A claim sentence.', nodeAt({ top: 120, left: 40, width: 300 }));
    const title = nodeAt({ top: 300, left: 100, width: 600 });

    expect(flySentenceInto(title, 'A claim sentence.')).toBe(true);
    expect(title.animate).toHaveBeenCalledTimes(1);
    const [frames] = title.animate.mock.calls[0];
    // Starts where the sentence was — 60px up and 60px left of the title, at
    // half its width — and lands on the title's own position.
    expect(frames[0].transform).toBe('translate3d(-60px, -180px, 0) scale(0.5)');
    expect(frames[1].transform).toBe('translate3d(0, 0, 0) scale(1)');
    // A handoff is claimed once. A re-render must not fly it again.
    expect(peekSentenceHandoff()).toBeNull();
  });

  it('refuses to fly a different sentence', () => {
    handOffSentence('A claim sentence.', nodeAt({ top: 120, left: 40, width: 300 }));
    const title = nodeAt({ top: 300, left: 100, width: 600 });

    expect(flySentenceInto(title, 'A different headline.')).toBe(false);
    expect(title.animate).not.toHaveBeenCalled();
    expect(peekSentenceHandoff()?.sentence).toBe('A claim sentence.');
  });

  it('leaves the handoff when a different sentence asks first, so the right destination can still fly', () => {
    handOffSentence('A claim sentence.', nodeAt({ top: 120, left: 40, width: 300 }));
    const title = nodeAt({ top: 300, left: 100, width: 600 });
    const row = nodeAt({ top: 400, left: 80, width: 500 });

    expect(flySentenceInto(title, 'NVIDIA')).toBe(false);
    expect(flySentenceInto(row, 'A claim sentence.')).toBe(true);
    expect(row.animate).toHaveBeenCalledTimes(1);
    expect(peekSentenceHandoff()).toBeNull();
  });

  it('does nothing when nobody handed a sentence off', () => {
    const title = nodeAt({ top: 300, left: 100, width: 600 });

    expect(flySentenceInto(title, 'A claim sentence.')).toBe(false);
    expect(title.animate).not.toHaveBeenCalled();
  });

  it('fades in with opacity only when motion is reduced', () => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)'
    }));
    handOffSentence('A claim sentence.', nodeAt({ top: 120, left: 40, width: 300 }));
    const title = nodeAt({ top: 300, left: 100, width: 600 });

    expect(flySentenceInto(title, 'A claim sentence.')).toBe(true);
    expect(title.animate).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      expect.objectContaining({ duration: 80, easing: 'linear' })
    );
  });
});
