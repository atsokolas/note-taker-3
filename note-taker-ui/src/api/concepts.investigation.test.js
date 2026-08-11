import api from '../api';
import { getConceptInvestigation } from './concepts';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer test-only' } })
}));

describe('getConceptInvestigation', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.get.mockResolvedValue({ data: { investigation: { version: 'v1' }, generatedAt: 'now' } });
  });

  it('uses the exact Concept id and omits empty optional context', async () => {
    await getConceptInvestigation({
      conceptId: '64f100000000000000000020',
      wikiPageId: '64f100000000000000000030'
    });

    expect(api.get).toHaveBeenCalledWith(
      '/api/concepts/64f100000000000000000020/investigation?wikiPageId=64f100000000000000000030',
      { headers: { Authorization: 'Bearer test-only' } }
    );
  });

  it('preserves claim-scoped revision context without accepting display-name identity', async () => {
    await getConceptInvestigation({
      conceptId: '64f100000000000000000020',
      wikiPageId: '64f100000000000000000030',
      revisionId: '64f100000000000000000050',
      claimId: 'claim & one'
    });

    const [url] = api.get.mock.calls[0];
    const parsed = new URL(url, 'https://noeis.local');
    expect(parsed.pathname).toBe('/api/concepts/64f100000000000000000020/investigation');
    expect(parsed.searchParams.get('wikiPageId')).toBe('64f100000000000000000030');
    expect(parsed.searchParams.get('revisionId')).toBe('64f100000000000000000050');
    expect(parsed.searchParams.get('claimId')).toBe('claim & one');
    expect(parsed.searchParams.has('concept')).toBe(false);
  });

  it('rejects missing or malformed exact identities before transport and trims optional context', async () => {
    await expect(getConceptInvestigation({
      conceptId: '',
      wikiPageId: '64f100000000000000000030'
    })).rejects.toThrow(/Concept id must be a valid object id/i);
    await expect(getConceptInvestigation({
      conceptId: '64f100000000000000000020',
      wikiPageId: ' '
    })).rejects.toThrow(/Wiki page id must be a valid object id/i);
    await expect(getConceptInvestigation({
      conceptId: 'concept-name',
      wikiPageId: '64f100000000000000000030'
    })).rejects.toThrow(/Concept id must be a valid object id/i);
    await expect(getConceptInvestigation({
      conceptId: '64f100000000000000000020',
      wikiPageId: '64f100000000000000000030',
      revisionId: 'revision-name'
    })).rejects.toThrow(/Revision id must be a valid object id/i);
    expect(api.get).not.toHaveBeenCalled();

    await getConceptInvestigation({
      conceptId: ' 64f100000000000000000020 ',
      wikiPageId: ' 64f100000000000000000030 ',
      revisionId: ' 64f100000000000000000050 ',
      claimId: ' claim-1 '
    });
    const [url] = api.get.mock.calls[0];
    const parsed = new URL(url, 'https://noeis.local');
    expect(parsed.pathname).toBe('/api/concepts/64f100000000000000000020/investigation');
    expect(parsed.searchParams.get('wikiPageId')).toBe('64f100000000000000000030');
    expect(parsed.searchParams.get('revisionId')).toBe('64f100000000000000000050');
    expect(parsed.searchParams.get('claimId')).toBe('claim-1');
  });

  it('rejects malformed claim input and malformed response envelopes', async () => {
    await expect(getConceptInvestigation({
      conceptId: '64f100000000000000000020',
      wikiPageId: '64f100000000000000000030',
      claimId: 42
    })).rejects.toThrow(/Claim id must be a string/i);
    expect(api.get).not.toHaveBeenCalled();

    api.get.mockResolvedValueOnce({ data: { investigation: null } });
    await expect(getConceptInvestigation({
      conceptId: '64f100000000000000000020',
      wikiPageId: '64f100000000000000000030'
    })).rejects.toThrow(/response is malformed/i);
  });
});
