import { documentTitle } from './useDocumentTitle';

describe('documentTitle', () => {
  it('names the object, then the room, then Noeis', () => {
    expect(documentTitle('Costco’s membership model', 'Judgment')).toBe('Costco’s membership model · Judgment · Noeis');
  });

  it('says the room alone when there is no object yet', () => {
    expect(documentTitle(undefined, 'Library')).toBe('Library · Noeis');
    expect(documentTitle('  ', 'Wiki')).toBe('Wiki · Noeis');
  });
});
