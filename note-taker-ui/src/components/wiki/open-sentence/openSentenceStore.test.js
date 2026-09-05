import { listenOpenSentenceStore, readStore, writeStore } from './openSentenceStore';
import { draftStorageKey } from './openSentenceBinding';

describe('openSentenceStore', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('keeps a storyboard walk in the tab and an owned walk on the device', () => {
    writeStore('noeis.open-sentence.storyboard.parenting-room-to-be-wrong', 'tab');
    writeStore('noeis.open-sentence.wiki-1.claim-1', 'device');
    expect(window.sessionStorage.getItem('noeis.open-sentence.storyboard.parenting-room-to-be-wrong')).toBe('tab');
    expect(window.localStorage.getItem('noeis.open-sentence.wiki-1.claim-1')).toBe('device');
    expect(readStore('noeis.open-sentence.storyboard.parenting-room-to-be-wrong')).toBe('tab');
    expect(readStore('noeis.open-sentence.wiki-1.claim-1')).toBe('device');
  });

  it('picks up a leftover tab draft so a mid-walk is not lost', () => {
    window.sessionStorage.setItem(draftStorageKey('wiki-1', 'claim-1'), 'kept');
    expect(readStore(draftStorageKey('wiki-1', 'claim-1'))).toBe('kept');
    expect(window.localStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toBe('kept');
    expect(window.sessionStorage.getItem(draftStorageKey('wiki-1', 'claim-1'))).toBeFalsy();
  });

  it('tells another tab when an owned walk changes', () => {
    const onChange = jest.fn();
    const stop = listenOpenSentenceStore(onChange);
    window.dispatchEvent(new StorageEvent('storage', {
      key: draftStorageKey('wiki-1', 'claim-1'),
      newValue: 'device'
    }));
    expect(onChange).toHaveBeenCalled();
    stop();
  });
});
