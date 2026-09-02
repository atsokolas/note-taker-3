import { isCrossing, PLACES } from './crossings';

describe('the four crossings', () => {
  it('flies a source from the reading into a pile', () => {
    expect(isCrossing({ from: PLACES.READER, to: PLACES.PILE })).toBe(true);
  });

  it('flies a folio out of a scroll and back home', () => {
    expect(isCrossing({ from: PLACES.SCROLL, to: PLACES.IMBOX })).toBe(true);
  });

  it('flies a promise from the paper into the reading', () => {
    expect(isCrossing({ from: PLACES.PAPER, to: PLACES.READER })).toBe(true);
  });

  it('flies anything at all onto the shelf, because the canon is reached from everywhere', () => {
    expect(isCrossing({ from: PLACES.READER, to: PLACES.SHELF })).toBe(true);
    expect(isCrossing({ from: PLACES.PILE, to: PLACES.SHELF })).toBe(true);
    expect(isCrossing({ from: PLACES.PAPER, to: PLACES.SHELF })).toBe(true);
  });

  it('reads a crossing the same in both directions', () => {
    expect(isCrossing({ from: PLACES.PILE, to: PLACES.READER })).toBe(true);
  });
});

describe('what does not fly', () => {
  it('leaves movement inside a place instant', () => {
    expect(isCrossing({ from: PLACES.IMBOX, to: PLACES.IMBOX })).toBe(false);
    expect(isCrossing({ from: PLACES.SHELF, to: PLACES.SHELF })).toBe(false);
  });

  it('does not fly a piece between two places the design never joined', () => {
    // A scroll and a pile are both on the desk; moving between them is
    // rearranging, not a journey.
    expect(isCrossing({ from: PLACES.SCROLL, to: PLACES.PILE })).toBe(false);
    expect(isCrossing({ from: PLACES.IMBOX, to: PLACES.PILE })).toBe(false);
  });

  it('refuses to animate a caller that has not said where it is going', () => {
    expect(isCrossing({ from: PLACES.READER })).toBe(false);
    expect(isCrossing({ to: PLACES.SHELF })).toBe(false);
    expect(isCrossing({})).toBe(false);
    expect(isCrossing()).toBe(false);
  });

  it('treats an unknown place as no crossing rather than guessing', () => {
    expect(isCrossing({ from: 'somewhere', to: PLACES.PILE })).toBe(false);
  });

  it('does not care how a place was capitalised', () => {
    expect(isCrossing({ from: 'READER', to: 'Pile' })).toBe(true);
  });
});
