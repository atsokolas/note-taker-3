import { DROP_KINDS, dropIntent, readDrop } from './dragGrammar';

describe('one drag grammar', () => {
  it('files a piece dropped onto a folder', () => {
    expect(readDrop({ kind: DROP_KINDS.FOLDER, targetId: 'investing' }))
      .toEqual({ action: 'file', folderId: 'investing' });
  });

  it('parks a piece dropped onto a pile', () => {
    expect(readDrop({ kind: DROP_KINDS.PILE, targetId: 'later', placement: 'later' }))
      .toEqual({ action: 'park', placement: 'later' });
    expect(readDrop({ kind: DROP_KINDS.PILE, targetId: 'aside', placement: 'setAside' }))
      .toEqual({ action: 'park', placement: 'setAside' });
  });

  it('does nothing for a drop that landed on nothing', () => {
    expect(readDrop({ kind: DROP_KINDS.FOLDER, targetId: '' })).toBeNull();
    expect(readDrop({})).toBeNull();
    expect(readDrop()).toBeNull();
  });

  it('refuses a pile that is not one of the two', () => {
    // Home is where a piece goes when it leaves a pile, not a pile to drop on.
    expect(readDrop({ kind: DROP_KINDS.PILE, targetId: 'home', placement: 'stream' })).toBeNull();
    expect(readDrop({ kind: DROP_KINDS.PILE, targetId: 'x', placement: 'nowhere' })).toBeNull();
  });

  it('refuses a target it has no grammar for, rather than guessing', () => {
    expect(readDrop({ kind: 'trash', targetId: 't1' })).toBeNull();
  });

  it('says what the target is about to do, in the target’s own terms', () => {
    expect(dropIntent({ kind: DROP_KINDS.FOLDER, targetId: 'investing' })).toBe('file it here');
    expect(dropIntent({ kind: DROP_KINDS.PILE, targetId: 'later', placement: 'later' })).toBe('park it here');
  });

  it('says nothing about a drop that would do nothing', () => {
    expect(dropIntent({})).toBe('');
  });
});
