import Claim, { SUPPORT_STATES } from './Claim';

describe('Claim mark extension', () => {
  it('exposes the documented support states', () => {
    expect(SUPPORT_STATES.has('supported')).toBe(true);
    expect(SUPPORT_STATES.has('partial')).toBe(true);
    expect(SUPPORT_STATES.has('unsupported')).toBe(true);
    expect(SUPPORT_STATES.has('contradicted')).toBe(true);
    expect(SUPPORT_STATES.size).toBe(4);
  });

  it('registers as a TipTap mark named "claim"', () => {
    expect(Claim.name).toBe('claim');
    expect(Claim.type).toBe('mark');
  });

  it('parses HTML attributes from a span element', () => {
    const config = Claim.config.addAttributes();
    const fakeElement = {
      getAttribute: (name) => {
        if (name === 'data-claim-id') return 'claim-abc';
        if (name === 'data-support') return 'partial';
        if (name === 'data-citation-indexes') return '1,3,5';
        return null;
      }
    };
    expect(config.claimId.parseHTML(fakeElement)).toBe('claim-abc');
    expect(config.support.parseHTML(fakeElement)).toBe('partial');
    expect(config.citationIndexes.parseHTML(fakeElement)).toEqual([1, 3, 5]);
  });

  it('coerces unknown support values to "supported" on parse', () => {
    const config = Claim.config.addAttributes();
    const fakeElement = {
      getAttribute: (name) => (name === 'data-support' ? 'invalid' : null)
    };
    expect(config.support.parseHTML(fakeElement)).toBe('supported');
  });

  it('renders citation indexes back to a comma string when present', () => {
    const config = Claim.config.addAttributes();
    expect(config.citationIndexes.renderHTML({ citationIndexes: [1, 2] }))
      .toEqual({ 'data-citation-indexes': '1,2' });
  });

  it('omits the citation-indexes attribute when there are none', () => {
    const config = Claim.config.addAttributes();
    expect(config.citationIndexes.renderHTML({ citationIndexes: [] })).toEqual({});
  });

  it('caps citation indexes at 8 to bound popover overflow', () => {
    const config = Claim.config.addAttributes();
    const fakeElement = {
      getAttribute: () => Array.from({ length: 12 }, (_, i) => i + 1).join(',')
    };
    expect(config.citationIndexes.parseHTML(fakeElement)).toHaveLength(8);
  });
});
