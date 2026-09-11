import { act, renderHook, waitFor } from '@testing-library/react';
import useAuthoredExplorations from './useAuthoredExplorations';
import { bindDraft } from './openSentenceJourney';
import { createExploration } from './openSentenceModel';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const saved = (writing, revision = 1) => ({
  id: 'exploration-1',
  pageId: 'page-1',
  claimId: 'claim-1',
  revision,
  draft: { writing },
  keeps: []
});

const load = (overrides = {}) => jest.fn().mockResolvedValue({ explorations: [], userId: 'owner-a', ...overrides });

const open = async (api, pageId = 'page-1') => {
  const hook = renderHook(() => useAuthoredExplorations({ scopeId: pageId, enabled: true, api }));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

const change = async (result, writing) => {
  act(() => result.current.change('claim-1', { writing }));
  await act(async () => {
    jest.advanceTimersByTime(451);
    await Promise.resolve();
  });
};

describe('authored exploration persistence lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('holds an older offline copy beside current words until an explicit decision', async () => {
    const api = { load: load({ explorations: [saved('Newer online words', 3)] }), save: jest.fn().mockResolvedValue(saved('Offline words', 4)) };
    const { result } = await open(api);
    act(() => result.current.restoreWriting('claim-1', { revision: 2, fields: { writing: 'Offline words' } }));
    expect(result.current.records['claim-1'].draft.writing).toBe('Offline words');
    expect(result.current.records['claim-1'].conflict.draft.writing).toBe('Newer online words');
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(api.save).not.toHaveBeenCalled();
    act(() => result.current.resolveConflict('claim-1', false));
    expect(result.current.records['claim-1'].draft.writing).toBe('Newer online words');
    expect(api.save).not.toHaveBeenCalled();
    act(() => result.current.restoreWriting('claim-1', { revision: 3, fields: { writing: 'Offline words' } }));
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(api.save.mock.calls[0][2]).toMatchObject({ expectedRevision: 3, draft: { writing: 'Offline words' } });
  });

  it('replays the exact mutation after a lost acknowledgement', async () => {
    const failed = deferred();
    const api = { load: load(), save: jest.fn().mockReturnValueOnce(failed.promise).mockResolvedValueOnce(saved('First words')), keep: jest.fn(), discard: jest.fn() };
    const { result } = await open(api);
    await change(result, 'First words');
    const first = api.save.mock.calls[0][2];
    await act(async () => {
      failed.reject(new Error('connection lost'));
      await failed.promise.catch(() => {});
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.records['claim-1'].error).toBeTruthy());
    await act(async () => {
      result.current.retry('claim-1');
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1][2]).toEqual(first);
    await waitFor(() => expect(result.current.records['claim-1'].revision).toBe(1));
  });

  it('does not let an acknowledged old mutation authorize Discard of newer work', async () => {
    const failed = deferred();
    const advanced = saved('Words from another session', 2);
    const conflict = Object.assign(new Error('changed after save'), {
      response: {
        status: 409,
        data: {
          error: 'The exploration changed after this save was accepted.',
          current: advanced,
          acknowledgedRevision: 1
        }
      }
    });
    const api = {
      load: load(),
      save: jest.fn().mockReturnValueOnce(failed.promise).mockRejectedValueOnce(conflict),
      keep: jest.fn(),
      discard: jest.fn()
    };
    const { result } = await open(api);
    await change(result, 'My accepted words');
    await act(async () => {
      failed.reject(new Error('connection lost'));
      await failed.promise.catch(() => {});
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.records['claim-1'].pending).toBeTruthy());

    let discardError;
    await act(async () => {
      try { await result.current.discard('claim-1'); }
      catch (error) { discardError = error; }
    });

    expect(discardError?.message).toBe('The exploration changed after this save was accepted.');
    expect(api.discard).not.toHaveBeenCalled();
    expect(result.current.records['claim-1']).toMatchObject({
      revision: 0,
      draft: { writing: 'My accepted words' },
      conflict: advanced
    });
  });

  it('serializes an edit made during an in-flight save and keeps the latest writing', async () => {
    const firstSave = deferred();
    const api = {
      load: load(),
      save: jest.fn()
        .mockReturnValueOnce(firstSave.promise)
        .mockImplementationOnce((_page, _claim, payload) => Promise.resolve(saved(payload.draft.writing, 2))),
      keep: jest.fn(), discard: jest.fn()
    };
    const { result } = await open(api);
    await change(result, 'First words');
    act(() => result.current.change('claim-1', { writing: 'Latest words' }));
    await act(async () => {
      firstSave.resolve(saved('First words', 1));
      await firstSave.promise;
      await Promise.resolve();
    });
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[0][2]).toMatchObject({ expectedRevision: 0, draft: { writing: 'First words' } });
    expect(api.save.mock.calls[1][2]).toMatchObject({ expectedRevision: 1, draft: { writing: 'Latest words' } });
    await waitFor(() => expect(result.current.records['claim-1']).toMatchObject({ revision: 2, draft: { writing: 'Latest words' }, dirty: false }));
  });

  it('requires review of a newer version before retrying Discard', async () => {
    const newer = saved('Newer words from another session', 2);
    const failure = { response: { status: 409, data: { current: newer, error: 'The exploration revision is stale.' } } };
    const api = { load: load({ explorations: [saved('My original words')] }), save: jest.fn(),
      discard: jest.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({}) };
    const { result } = await open(api);
    await act(async () => { await expect(result.current.discard('claim-1')).rejects.toEqual(failure); });
    expect(result.current.records['claim-1']).toMatchObject({ revision: 1, draft: { writing: 'My original words' }, conflict: newer });
    await act(async () => { await expect(result.current.discard('claim-1')).rejects.toThrow(/Review/); });
    expect(api.discard).toHaveBeenCalledTimes(1);
    act(() => result.current.resolveConflict('claim-1', false));
    expect(result.current.records['claim-1']).toMatchObject({ revision: 2, draft: newer.draft, conflict: null });
    expect(api.save).not.toHaveBeenCalled();
    expect(api.discard).toHaveBeenCalledTimes(1);
    await act(async () => result.current.discard('claim-1'));
    expect(api.discard).toHaveBeenLastCalledWith('page-1', 'claim-1', 2);
    expect(result.current.records['claim-1']).toBeUndefined();
  });

  it('loads acknowledged server words in a fresh session after device storage is cleared', async () => {
    localStorage.setItem('noeis.open-sentence.account.owner-a.page-1', JSON.stringify({
      'claim-1': { revision: 1, dirty: true, draft: { writing: 'Device-only words' } }
    }));
    localStorage.clear();
    const api = { load: load({ explorations: [saved('Server words', 3)] }), save: jest.fn(), keep: jest.fn(), discard: jest.fn() };
    const { result } = await open(api);
    expect(result.current.records['claim-1']).toMatchObject({ revision: 3, draft: { writing: 'Server words' }, dirty: false });
    expect(api.save).not.toHaveBeenCalled();
  });

  it('does not save when reading controls restore an empty comparison', async () => {
    const live = createExploration({ originalText: 'A sentence worth revisiting.' });
    const draft = { title: '', writing: 'Words already saved.', originalText: live.originalText,
      provisionalText: live.originalText, question: '', returnNote: '', mark: '', placed: false };
    const api = { load: load({ explorations: [{ ...saved('', 3), draft }] }), save: jest.fn() };
    const { result } = await open(api);
    for (const opened of [false, true, false, true]) {
      act(() => result.current.change('claim-1', bindDraft(live, draft, opened, { preserveAuthorship: true })));
      await act(async () => jest.advanceTimersByTime(451));
    }
    expect(api.save).not.toHaveBeenCalled();
    expect(result.current.records['claim-1']).toMatchObject({ revision: 3, dirty: false, draft });
    expect(localStorage.getItem('noeis.open-sentence.account.owner-a.page-1')).toBeNull();
  });

  it('still saves the removal of real comparison, premise and source fields', async () => {
    const draft = { writing: 'Keep my words.',
      meet: { against: 'A sentence.', between: 'A real comparison.' },
      pressure: { against: 'A sentence.', premise: 'Suppose the opposite.' },
      selectedSource: { articleId: 'article-1', passage: 'A chosen passage.' } };
    const api = { load: load({ explorations: [{ ...saved('', 3), draft }] }),
      save: jest.fn(async (_page, _claim, payload) => ({ ...saved('', 4), draft: payload.draft })) };
    const { result } = await open(api);
    act(() => result.current.change('claim-1', { ...draft, meet: null, pressure: null, selectedSource: null }));
    await act(async () => jest.advanceTimersByTime(451));
    await waitFor(() => expect(result.current.records['claim-1'].dirty).toBe(false));
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[0][2]).toMatchObject({ expectedRevision: 3, draft: { writing: 'Keep my words.' } });
    for (const field of ['meet', 'pressure', 'selectedSource']) expect(api.save.mock.calls[0][2].draft).not.toHaveProperty(field);
  });

  it('caches only unsaved recovery data and clears it after acknowledgement', async () => {
    const response = deferred();
    const api = { load: load({ explorations: [saved('Already saved words', 3)] }), save: jest.fn().mockReturnValue(response.promise) };
    const { result } = await open(api);
    const key = 'noeis.open-sentence.account.owner-a.page-1';
    expect(localStorage.getItem(key)).toBeNull();
    await change(result, 'Words being saved');
    const sent = api.save.mock.calls[0][2];
    act(() => result.current.change('claim-1', { writing: 'Newer unsaved words' }));
    expect(JSON.parse(localStorage.getItem(key))).toEqual({ 'claim-1': {
      draft: { writing: 'Newer unsaved words' }, revision: 3, dirty: true, pending: sent
    } });
    api.save.mockResolvedValueOnce(saved('Newer unsaved words', 5));
    await act(async () => { response.resolve(saved('Words being saved', 4)); await response.promise; });
    await waitFor(() => expect(result.current.records['claim-1'].dirty).toBe(false));
    expect(localStorage.getItem(key)).toBeNull();
    expect(result.current.records['claim-1'].draft.writing).toBe('Newer unsaved words');
  });

  it('replays a compact cached request after reload without substituting newer unsaved words', async () => {
    const pending = { expectedRevision: 3, mutationId: 'lost-request', draft: { writing: 'Words in the lost request' } };
    localStorage.setItem('noeis.open-sentence.account.owner-a.page-1', JSON.stringify({ 'claim-1': {
      draft: { writing: 'Later words on this device' }, revision: 3, dirty: true, pending, keepIds: { notebook: 'keep-retry' }
    } }));
    const api = { load: load({ explorations: [saved('Words in the lost request', 4)] }),
      save: jest.fn().mockResolvedValueOnce(saved('Words in the lost request', 4)).mockResolvedValueOnce(saved('Later words on this device', 5)) };
    const { result } = await open(api);
    await waitFor(() => expect(result.current.records['claim-1'].dirty).toBe(false));
    expect(api.save.mock.calls[0][2]).toEqual(pending);
    expect(api.save.mock.calls[1][2]).toMatchObject({ expectedRevision: 4, draft: { writing: 'Later words on this device' } });
    expect(result.current.records['claim-1'].keepIds.notebook).toBe('keep-retry');
    expect(localStorage.getItem('noeis.open-sentence.account.owner-a.page-1')).toBeNull();
  });

  it.each(['null', '[]', '42', '{broken'])('loads server work despite invalid recovery cache %s', async cache => {
    localStorage.setItem('noeis.open-sentence.account.owner-a.page-1', cache);
    const { result } = await open({ load: load({ explorations: [saved('Safe on the server', 2)] }), save: jest.fn() });
    expect(result.current.error).toBe('');
    expect(result.current.records['claim-1'].draft.writing).toBe('Safe on the server');
    expect(localStorage.getItem('noeis.open-sentence.account.owner-a.page-1')).toBeNull();
  });

  it('recovers a small unsaved edit under storage pressure without caching its large server baseline', async () => {
    const setItem = Storage.prototype.setItem;
    const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (value.length > 2048) throw new DOMException('Storage is full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    });
    try {
      const baseline = saved('Previously saved writing. '.repeat(500), 3);
      const offline = { load: load({ explorations: [baseline] }), save: jest.fn().mockRejectedValue(new Error('Connection lost')) };
      const first = await open(offline);
      await change(first.result, 'A small revision I cannot lose.');
      await waitFor(() => expect(first.result.current.records['claim-1'].error).toBeTruthy());
      expect(first.result.current.deviceSaved).toBe(true);
      const request = offline.save.mock.calls[0][2];
      first.unmount();
      const online = { load: load({ explorations: [baseline] }), save: jest.fn().mockResolvedValue(saved('A small revision I cannot lose.', 4)) };
      const resumed = await open(online);
      await waitFor(() => expect(resumed.result.current.records['claim-1'].dirty).toBe(false));
      expect(online.save).toHaveBeenCalledWith('page-1', 'claim-1', request);
      expect(resumed.result.current.records['claim-1'].draft.writing).toBe('A small revision I cannot lose.');
      resumed.unmount();
    } finally { storage.mockRestore(); }
  });

  it.each([
    ['notebook', false], ['question', true]
  ])('reviews a stale %s Keep before explicitly keeping the chosen version', async (destination, useLocal) => {
    const newer = saved('Newer writing', 2);
    const failure = { response: { status: 409, data: { error: 'Changed elsewhere.', current: newer } } };
    const api = { load: load({ explorations: [saved('My writing')] }),
      save: jest.fn(async (_page, _claim, payload) => saved(payload.draft.writing, 3)),
      keep: jest.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({ href: '/kept' }) };
    const { result } = await open(api);
    await act(async () => { await expect(result.current.keep('claim-1', destination)).rejects.toEqual(failure); });
    expect(result.current.records['claim-1']).toMatchObject({ revision: 1, draft: { writing: 'My writing' }, conflict: newer });
    await act(async () => { await expect(result.current.keep('claim-1', destination)).rejects.toThrow(); });
    expect(api.keep).toHaveBeenCalledTimes(1);
    await act(async () => result.current.resolveConflict('claim-1', useLocal));
    await waitFor(() => expect(result.current.records['claim-1'].dirty).toBe(false));
    expect(result.current.records['claim-1'].draft.writing).toBe(useLocal ? 'My writing' : 'Newer writing');
    expect(api.keep).toHaveBeenCalledTimes(1);
    await act(async () => result.current.keep('claim-1', destination));
    expect(api.keep.mock.calls[1][2]).toEqual({ ...api.keep.mock.calls[0][2], expectedRevision: useLocal ? 3 : 2 });
  });

  it('does not hydrate another account cache for the same page', async () => {
    localStorage.setItem('noeis.open-sentence.account.owner-a.page-1', JSON.stringify({
      'claim-1': { revision: 1, dirty: true, draft: { writing: 'Owner A private words' } }
    }));
    const api = { load: load({ userId: 'owner-b', explorations: [saved('Owner B server words', 4)] }), save: jest.fn(), keep: jest.fn(), discard: jest.fn() };
    const { result } = await open(api);
    expect(result.current.owner).toBe('owner-b');
    expect(result.current.records['claim-1'].draft.writing).toBe('Owner B server words');
    expect(api.save).not.toHaveBeenCalled();
  });

  it('keeps local words visible through a conflict until the user chooses, then rebases that choice', async () => {
    const conflict = Object.assign(new Error('conflict'), { response: { status: 409, data: { error: 'Changed elsewhere.', current: saved('Remote words', 2) } } });
    const api = {
      load: load({ explorations: [saved('Starting words', 1)] }),
      save: jest.fn()
        .mockRejectedValueOnce(conflict)
        .mockImplementationOnce((_page, _claim, payload) => Promise.resolve(saved(payload.draft.writing, 3))),
      keep: jest.fn(), discard: jest.fn()
    };
    const { result } = await open(api);
    await change(result, 'My unsaved choice');
    await waitFor(() => expect(result.current.records['claim-1'].conflict?.revision).toBe(2));
    expect(result.current.records['claim-1'].draft.writing).toBe('My unsaved choice');
    await act(async () => {
      result.current.resolveConflict('claim-1', true);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1][2]).toMatchObject({ expectedRevision: 2, draft: { writing: 'My unsaved choice' } });
    await waitFor(() => expect(result.current.records['claim-1']).toMatchObject({ revision: 3, draft: { writing: 'My unsaved choice' }, dirty: false }));
  });

  it('reuses the destination keep mutation after a transport failure', async () => {
    const kept = { href: '/think?tab=notebook&entryId=note-1', title: 'First words', destination: 'notebook', targetId: 'note-1', exploration: saved('First words', 2) };
    const api = {
      load: load({ explorations: [saved('First words', 1)] }), save: jest.fn(),
      keep: jest.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce(kept), discard: jest.fn()
    };
    const { result } = await open(api);
    let firstError;
    await act(async () => { try { await result.current.keep('claim-1', 'notebook'); } catch (error) { firstError = error; } });
    expect(firstError).toBeTruthy();
    const first = api.keep.mock.calls[0][2];
    let receipt;
    await act(async () => { receipt = await result.current.keep('claim-1', 'notebook'); });
    expect(api.keep.mock.calls[1][2]).toEqual(first);
    expect(receipt).toEqual(kept);
    expect(result.current.records['claim-1'].revision).toBe(2);
  });

  it('recovers a server-reserved Keep without saving over newer dirty local words', async () => {
    const reservation = {
      destination: 'notebook',
      targetId: 'note-1',
      mutationId: 'reserved-keep-1',
      status: 'pending'
    };
    const serverPending = { ...saved('Writing captured when Keep was pressed', 2), keeps: [reservation] };
    const completed = {
      ...saved('Server writing after recovery', 2),
      keeps: [{ ...reservation, status: 'complete' }]
    };
    localStorage.setItem('noeis.open-sentence.account.owner-a.page-1', JSON.stringify({
      'claim-1': {
        revision: 1,
        dirty: true,
        draft: { writing: 'Newer local words that cannot save against the moved origin' }
      }
    }));
    const staleOrigin = Object.assign(new Error('stale origin'), {
      response: { status: 409, data: { error: 'The held sentence changed.' } }
    });
    const receipt = {
      href: '/think?tab=notebook&entryId=note-1',
      title: 'Writing captured when Keep was pressed',
      destination: 'notebook',
      targetId: 'note-1',
      exploration: completed
    };
    const api = {
      load: load({ explorations: [serverPending] }),
      save: jest.fn().mockRejectedValue(staleOrigin),
      keep: jest.fn().mockResolvedValue(receipt),
      discard: jest.fn()
    };
    const { result } = await open(api);
    await waitFor(() => expect(result.current.records['claim-1']).toMatchObject({
      revision: 1,
      dirty: true,
      error: 'The held sentence changed.',
      draft: { writing: 'Newer local words that cannot save against the moved origin' },
      saved: { keeps: [reservation] }
    }));
    expect(api.save).toHaveBeenCalledTimes(1);

    let recovered;
    await act(async () => { recovered = await result.current.keep('claim-1', 'notebook'); });

    expect(recovered).toEqual(receipt);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.keep).toHaveBeenCalledWith('page-1', 'claim-1', {
      expectedRevision: 1,
      mutationId: 'reserved-keep-1',
      destination: 'notebook'
    });
    expect(result.current.records['claim-1']).toMatchObject({
      revision: 1,
      dirty: true,
      error: 'The held sentence changed.',
      draft: { writing: 'Newer local words that cannot save against the moved origin' },
      conflict: completed,
      saved: { keeps: [{ ...reservation, status: 'complete' }] }
    });
  });

  it('does not grant a Keep response revision to words typed while recovery is in flight', async () => {
    const reservation = {
      destination: 'notebook',
      targetId: 'note-1',
      mutationId: 'reserved-keep-1',
      status: 'pending'
    };
    const serverPending = { ...saved('Known server baseline', 2), keeps: [reservation] };
    const newerServer = {
      ...saved('Unseen words from another session', 4),
      keeps: [{ ...reservation, status: 'complete' }]
    };
    const keepResponse = deferred();
    const api = {
      load: load({ explorations: [serverPending] }),
      save: jest.fn(),
      keep: jest.fn().mockReturnValue(keepResponse.promise),
      discard: jest.fn()
    };
    const { result } = await open(api);

    let recovery;
    await act(async () => {
      recovery = result.current.keep('claim-1', 'notebook');
      await Promise.resolve();
    });
    act(() => result.current.change('claim-1', { writing: 'Words typed while Keep recovers' }));
    await act(async () => {
      keepResponse.resolve({
        href: '/think?tab=notebook&entryId=note-1',
        title: 'Known server baseline',
        destination: 'notebook',
        targetId: 'note-1',
        exploration: newerServer
      });
      await recovery;
    });

    expect(api.save).not.toHaveBeenCalled();
    expect(result.current.records['claim-1']).toMatchObject({
      revision: 2,
      dirty: true,
      draft: { writing: 'Words typed while Keep recovers' },
      conflict: newerServer,
      saved: newerServer
    });
  });

  it('discards a brand-new dirty draft locally before its first save', async () => {
    const api = { load: load(), save: jest.fn(), keep: jest.fn(), discard: jest.fn() };
    const { result } = await open(api);

    act(() => result.current.change('claim-1', { writing: 'Device-only words' }));
    await act(async () => result.current.discard('claim-1'));

    expect(result.current.records['claim-1']).toBeUndefined();
    expect(api.save).not.toHaveBeenCalled();
    expect(api.discard).not.toHaveBeenCalled();
  });

  it('clears revision-zero words after a definitive save rejection without deleting a concurrent server version', async () => {
    const rejected = Object.assign(new Error('invalid'), {
      response: { status: 422, data: { error: 'This draft cannot be saved.' } }
    });
    let concurrentServerVersion = saved('Words from another session', 1);
    const api = {
      load: load(),
      save: jest.fn().mockRejectedValue(rejected),
      keep: jest.fn(),
      discard: jest.fn(async () => { concurrentServerVersion = null; })
    };
    const { result } = await open(api);

    await change(result, 'Rejected local words');
    await waitFor(() => expect(result.current.records['claim-1']).toMatchObject({
      revision: 0,
      error: 'This draft cannot be saved.',
      pending: null
    }));
    await act(async () => result.current.discard('claim-1'));

    expect(result.current.records['claim-1']).toBeUndefined();
    expect(api.discard).not.toHaveBeenCalled();
    expect(concurrentServerVersion).toEqual(saved('Words from another session', 1));
  });
});
