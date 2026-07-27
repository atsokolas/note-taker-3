import api from '../api';
import {
  getKnowledgeMovements,
  startKnowledgeMovementInvestigation
} from './knowledgeMovements';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

describe('getKnowledgeMovements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('token', 'test-only');
  });

  afterEach(() => window.localStorage.clear());

  it('serializes bounded read context and preserves the movement envelope', async () => {
    const payload = {
      movements: [{ id: 'movement-1', kind: 'claim_changed' }],
      generatedAt: '2026-08-06T12:00:00.000Z'
    };
    api.get.mockResolvedValue({ data: payload });

    await expect(getKnowledgeMovements({
      since: '2026-08-05T12:00:00.000Z',
      limit: 7
    })).resolves.toEqual(payload);

    expect(api.get).toHaveBeenCalledWith(
      '/api/knowledge/movements?since=2026-08-05T12%3A00%3A00.000Z&limit=7',
      { headers: { Authorization: 'Bearer test-only' } }
    );
  });

  it('uses the product default and normalizes malformed response collections honestly', async () => {
    api.get.mockResolvedValue({ data: { movements: [], generatedAt: '2026-08-06T12:00:00.000Z' } });

    await expect(getKnowledgeMovements()).resolves.toEqual({
      movements: [],
      generatedAt: '2026-08-06T12:00:00.000Z'
    });
    expect(api.get.mock.calls[0][0]).toBe('/api/knowledge/movements?limit=3');
  });

  it('rejects invalid query bounds and malformed envelopes before presenting quiet state', async () => {
    await expect(getKnowledgeMovements({ limit: 0 })).rejects.toThrow(/1 to 50/i);
    await expect(getKnowledgeMovements({ limit: 2.5 })).rejects.toThrow(/1 to 50/i);
    await expect(getKnowledgeMovements({ limit: 51 })).rejects.toThrow(/1 to 50/i);
    await expect(getKnowledgeMovements({ since: 'yesterday' })).rejects.toThrow(/ISO-8601 UTC/i);
    expect(api.get).not.toHaveBeenCalled();

    api.get.mockResolvedValue({ data: { movements: null } });
    await expect(getKnowledgeMovements()).rejects.toThrow(/response is malformed/i);
  });
});

describe('startKnowledgeMovementInvestigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('token', 'test-only');
  });

  afterEach(() => window.localStorage.clear());

  it('posts exact revision and optional claim context to the owned Wiki page route', async () => {
    api.post.mockResolvedValue({
      data: {
        concept: {
          id: '64f100000000000000000020',
          href: '/think?conceptId=64f100000000000000000020'
        }
      }
    });

    await expect(startKnowledgeMovementInvestigation({
      wikiPageId: '64f100000000000000000030',
      revisionId: '64f100000000000000000050',
      claimId: 'claim-1'
    })).resolves.toEqual({
      concept: {
        id: '64f100000000000000000020',
        href: '/think?conceptId=64f100000000000000000020'
      }
    });

    expect(api.post).toHaveBeenCalledWith(
      '/api/wiki/pages/64f100000000000000000030/investigation',
      { revisionId: '64f100000000000000000050', claimId: 'claim-1' },
      { headers: { Authorization: 'Bearer test-only' } }
    );
  });

  it('omits an empty claim and rejects malformed identity before transport', async () => {
    api.post.mockResolvedValue({
      data: {
        concept: {
          id: '64f100000000000000000020',
          href: '/think?conceptId=64f100000000000000000020'
        }
      }
    });
    await startKnowledgeMovementInvestigation({
      wikiPageId: '64f100000000000000000030',
      revisionId: '64f100000000000000000050'
    });
    expect(api.post.mock.calls[0][1]).toEqual({
      revisionId: '64f100000000000000000050'
    });

    await expect(startKnowledgeMovementInvestigation({
      wikiPageId: 'page-name',
      revisionId: '64f100000000000000000050'
    })).rejects.toThrow(/valid object id/i);
    await expect(startKnowledgeMovementInvestigation({
      wikiPageId: '64f100000000000000000030',
      revisionId: 'revision-name'
    })).rejects.toThrow(/valid object id/i);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed claim input and malformed success payloads', async () => {
    await expect(startKnowledgeMovementInvestigation({
      wikiPageId: '64f100000000000000000030',
      revisionId: '64f100000000000000000050',
      claimId: 42
    })).rejects.toThrow(/Claim id must be a string/i);
    expect(api.post).not.toHaveBeenCalled();

    api.post.mockResolvedValue({ data: { concept: { id: 'display-name', href: '' } } });
    await expect(startKnowledgeMovementInvestigation({
      wikiPageId: '64f100000000000000000030',
      revisionId: '64f100000000000000000050'
    })).rejects.toThrow(/response is malformed/i);
  });
});
