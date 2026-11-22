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

/* Every way to write a private address is still private. */
it('refuses private addresses however they are written', () => {
  const { isPrivateAddress } = require('./publicUrlFetch');
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', '::ffff:7f00:1', '::ffff:127.0.0.1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', 'fec0::1', 'FD00::1', 'ff02::1', 'not-an-ip']) {
    expect([address, isPrivateAddress(address)]).toEqual([address, true]);
  }
  for (const address of ['93.184.216.34', '2606:4700::1111']) expect(isPrivateAddress(address)).toBe(false);
});

/* A name can answer public to the check and 127.0.0.1 to the connection.
   The socket's own lookup is checked too, so it never dials. */
it('never connects to a private address a name turns into after the check', async () => {
  const dns = require('dns');
  const lookup = jest.spyOn(dns, 'lookup').mockImplementation((_host, _options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]));
  try {
    const error = await fetchPublicText({ url: 'http://rebind.example/', lookup: publicLookup }).catch(caught => caught);
    expect(error?.cause?.code).toBe('ENOTPUBLIC');
  } finally {
    lookup.mockRestore();
  }
});
