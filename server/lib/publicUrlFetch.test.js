const { fetchPublicText } = require('./publicUrlFetch');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

/* A page can answer its headers and then send nothing more. The per-hop timer
   has already stopped by then, so only the deadline can end the read, and it
   must cancel the body so the socket is let go. */
it('cuts off a body that never finishes and releases it', async () => {
  let cancelled = false;
  const fetchImpl = async (_url, { signal }) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    body: new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => { cancelled = true; controller.error(new Error('aborted')); });
      }
    })
  });
  const started = Date.now();
  await expect(fetchPublicText({ url: 'https://example.com/slow', fetchImpl, lookup: publicLookup, deadlineMs: 50 }))
    .rejects.toThrow('aborted');
  expect(cancelled).toBe(true);
  expect(Date.now() - started).toBeLessThan(2000);
});
