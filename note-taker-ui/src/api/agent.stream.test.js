import { streamChatWithAgent } from './agent';
import { TextDecoder } from 'util';

global.TextDecoder = TextDecoder;

describe('streamChatWithAgent', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('cancels a stalled stream and returns a recoverable error', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const reader = {
      read: jest.fn(() => new Promise(() => {})),
      cancel
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => reader }
    });

    await expect(streamChatWithAgent({ message: 'What changed?' }, {
      idleTimeoutMs: 100
    })).rejects.toMatchObject({
      code: 'AGENT_STREAM_TIMEOUT',
      message: expect.stringMatching(/ask again to retry/i)
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
