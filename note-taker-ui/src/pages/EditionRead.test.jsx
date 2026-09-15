import EditionRead from './EditionRead';
import Editions from './Editions';
it('keeps direct issues and the stand on the same private reader', () => {
  expect(EditionRead).toBe(Editions);
});
