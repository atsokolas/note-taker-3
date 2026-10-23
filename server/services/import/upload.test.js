const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const upload = require('./upload');
const { buildImportRouter } = require('../../routes/importRoutes');

// Exercise the production parser with real bytes, without a socket or database.
const multipart = (parts, closing = true) => {
  const boundary = 'noeis-upload-test';
  const body = Buffer.concat([
    ...parts.map(({ name, filename, value }) => Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${filename ? `; filename="${filename}"` : ''}\r\n\r\n`),
      Buffer.isBuffer(value) ? value : Buffer.from(value),
      Buffer.from('\r\n')
    ])),
    Buffer.from(closing ? `--${boundary}--\r\n` : '')
  ]);
  const req = Readable.from([body]);
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(body.length)
  };
  return req;
};

const parse = (middleware, req) => new Promise(resolve => {
  middleware(req, {}, error => resolve(error));
});

test('single ENEX upload keeps its memory buffer and ordinary metadata', async () => {
  const req = multipart([
    { name: 'importSessionId', value: 'session-1' },
    { name: 'file', filename: 'notes.enex', value: '<en-export />' }
  ]);
  assert.equal(await parse(upload.single('file'), req), undefined);
  assert.equal(req.body.importSessionId, 'session-1');
  assert.equal(req.file.originalname, 'notes.enex');
  assert.equal(req.file.buffer.toString(), '<en-export />');
});

test('multiple export files keep their order and original names', async () => {
  const req = multipart(['one.md', 'two.md'].map(filename => ({ name: 'files', filename, value: filename })));
  assert.equal(await parse(upload.array('files', 2000), req), undefined);
  assert.deepEqual(req.files.map(file => file.originalname), ['one.md', 'two.md']);
});

test('indexed multipart fields are rejected before a sparse array can grow', async () => {
  // Bounded reproducer: the old parser accepts this without stressing the host.
  const req = multipart([{ name: 'items[10001]', value: 'value' }]);
  const error = await parse(upload.single('file'), req);
  assert.equal(error?.code, 'LIMIT_FIELD_ARRAY_INDEX');
  assert.equal(req.body.items, undefined);
});

test('files over the existing 15 MB limit are rejected', async () => {
  const req = multipart([{ name: 'file', filename: 'large.enex', value: Buffer.alloc(15 * 1024 * 1024 + 1) }]);
  assert.equal((await parse(upload.single('file'), req))?.code, 'LIMIT_FILE_SIZE');
  assert.equal(req.file, undefined);
});

test('unexpected file fields are rejected', async () => {
  const req = multipart([{ name: 'other', filename: 'notes.enex', value: '<en-export />' }]);
  assert.equal((await parse(upload.single('file'), req))?.code, 'LIMIT_UNEXPECTED_FILE');
});

test('truncated multipart bodies return an error and later uploads still work', async () => {
  const req = multipart([{ name: 'file', filename: 'notes.enex', value: '<en-export />' }], false);
  assert.ok(await parse(upload.single('file'), req));
  const next = multipart([{ name: 'file', filename: 'notes.enex', value: '<en-export />' }]);
  assert.equal(await parse(upload.single('file'), next), undefined);
});

test('every file import route authenticates before parsing uploads', () => {
  const authenticateToken = (_req, res) => res.status(401).json({ error: 'Unauthorized' });
  const router = buildImportRouter({ authenticateToken, upload });
  for (const route of ['/api/import/files', '/api/import/evernote-enex', '/api/import/evernote-enex/preview']) {
    const layer = router.stack.find(entry => entry.route?.path === route && entry.route.methods.post);
    assert.equal(layer.route.stack[0].handle, authenticateToken, route);
    const req = multipart([{ name: 'items[10001]', value: 'value' }]);
    let status;
    layer.route.stack[0].handle(req, {
      status(code) { status = code; return this; },
      json() {}
    }, () => assert.fail('unauthenticated request reached the parser'));
    assert.equal(status, 401);
    assert.equal(req.readableFlowing, null);
    assert.equal(req.body, undefined);
  }
});
