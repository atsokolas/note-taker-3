import { act, renderHook, waitFor } from '@testing-library/react';
import useConcept from './useConcept';

jest.mock('../api/concepts', () => ({
  getConcept: jest.fn()
}));

const { getConcept } = require('../api/concepts');

describe('useConcept', () => {
  beforeEach(() => {
    getConcept.mockReset();
  });

  it('returns null when name is missing', () => {
    const { result } = renderHook(() => useConcept('', { enabled: true }));
    expect(result.current.concept).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(getConcept).not.toHaveBeenCalled();
  });

  it('seeds concept with initial value so the manuscript can paint immediately', async () => {
    const initial = { _id: 'c1', name: 'Strategy', description: 'cached row' };
    getConcept.mockResolvedValueOnce({ _id: 'c1', name: 'Strategy', description: 'full payload', extras: 1 });
    const { result } = renderHook(() => useConcept('Strategy', { enabled: true, initial }));
    // Synchronously: concept already populated from initial seed.
    expect(result.current.concept).toEqual(initial);
    // After fetch resolves, full payload replaces the seed.
    await waitFor(() => expect(result.current.concept?.extras).toBe(1));
    expect(result.current.concept.description).toBe('full payload');
  });

  it('swaps to the new initial seed when name changes (no stale concept flash)', async () => {
    getConcept.mockImplementation((name) => Promise.resolve({ _id: name, name, description: `${name} full` }));
    const initialA = { _id: 'A', name: 'A', description: 'cached A' };
    const initialB = { _id: 'B', name: 'B', description: 'cached B' };

    const { result, rerender } = renderHook(
      ({ name, initial }) => useConcept(name, { enabled: true, initial }),
      { initialProps: { name: 'A', initial: initialA } }
    );
    await waitFor(() => expect(result.current.concept?.description).toBe('A full'));

    // Switching name should immediately show the new initial, not the previous A payload.
    rerender({ name: 'B', initial: initialB });
    expect(result.current.concept).toEqual(initialB);
    await waitFor(() => expect(result.current.concept?.description).toBe('B full'));
  });

  it('clears state when disabled or name removed', async () => {
    getConcept.mockResolvedValue({ _id: 'c1', name: 'Strategy' });
    const { result, rerender } = renderHook(
      ({ name, enabled }) => useConcept(name, { enabled }),
      { initialProps: { name: 'Strategy', enabled: true } }
    );
    await waitFor(() => expect(result.current.concept?._id).toBe('c1'));

    rerender({ name: '', enabled: true });
    await waitFor(() => expect(result.current.concept).toBeNull());
  });

  it('refresh re-fetches the concept', async () => {
    getConcept
      .mockResolvedValueOnce({ _id: 'c1', name: 'Strategy', version: 1 })
      .mockResolvedValueOnce({ _id: 'c1', name: 'Strategy', version: 2 });
    const { result } = renderHook(() => useConcept('Strategy', { enabled: true }));
    await waitFor(() => expect(result.current.concept?.version).toBe(1));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.concept?.version).toBe(2);
  });
});
