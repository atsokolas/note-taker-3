import { getContextPanelOpen } from '../readingMode';

describe('getContextPanelOpen', () => {
  it('returns storedOpen when nothing is selected', () => {
    expect(getContextPanelOpen({ hasSelection: false, storedOpen: true, userOverride: false })).toBe(true);
    expect(getContextPanelOpen({ hasSelection: false, storedOpen: false, userOverride: true })).toBe(false);
  });

  it('auto-collapses when a selection exists and no override', () => {
    expect(getContextPanelOpen({ hasSelection: true, storedOpen: true, userOverride: false })).toBe(false);
    expect(getContextPanelOpen({ hasSelection: true, storedOpen: false, userOverride: false })).toBe(false);
  });

  it('respects user override while a selection exists', () => {
    expect(getContextPanelOpen({ hasSelection: true, storedOpen: true, userOverride: true })).toBe(true);
    expect(getContextPanelOpen({ hasSelection: true, storedOpen: false, userOverride: true })).toBe(false);
  });
});
