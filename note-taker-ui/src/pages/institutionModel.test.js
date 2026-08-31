import { bandLine, hasThread, watchNote } from './institutionModel';

describe('institution client model', () => {
  it('names a private calibration band without a score', () => {
    expect(hasThread({ silent: true, knots: [] })).toBe(false);
    expect(hasThread({ knots: [{ id: '1' }] })).toBe(true);
    expect(bandLine({
      sufficient: true,
      confidence: 'certain',
      range: { low: 0.4, high: 0.7 }
    })).toMatch(/between 40 and 70/);
    expect(bandLine({ sufficient: false, silence: 'Too few named outcomes.' })).toBe('Too few named outcomes.');
    expect(watchNote({ silent: true, note: 'The world did not move.' })).toBe('The world did not move.');
  });
});
