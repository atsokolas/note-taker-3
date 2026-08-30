const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');
const { EJSON } = require('bson');

const cleanId = value => String(value?._id || value || '').trim();
const safePrefix = value => String(value || 'mongo-backup')
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'mongo-backup';
const ejson = value => EJSON.stringify(value, { relaxed: false });
const parseEjson = value => EJSON.parse(value, { relaxed: false });
const fingerprintIds = ids => crypto
  .createHash('sha256')
  .update([...ids].map(cleanId).filter(Boolean).sort().join('\n'))
  .digest('hex');

const sha256File = filename => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(filename);
  input.on('data', chunk => hash.update(chunk));
  input.on('end', () => resolve(hash.digest('hex')));
  input.on('error', reject);
});

const verifyMongoBackup = async ({ filename, expectedIds = [] } = {}) => {
  const expected = new Set(expectedIds.map(cleanId).filter(Boolean));
  const found = new Set();
  let manifest = null;
  const lines = readline.createInterface({
    input: fs.createReadStream(filename).pipe(zlib.createGunzip()),
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    const row = parseEjson(line);
    if (row?.type === 'manifest') {
      if (manifest) throw new Error('Backup contains more than one manifest.');
      manifest = row;
      continue;
    }
    if (row?.type !== 'document') throw new Error('Backup contains an unknown row type.');
    const documentId = cleanId(row.document);
    if (!documentId || found.has(documentId)) throw new Error('Backup contains a missing or duplicate document id.');
    found.add(documentId);
  }

  const missing = [...expected].filter(id => !found.has(id));
  const unexpected = [...found].filter(id => !expected.has(id));
  if (!manifest
    || Number(manifest.expectedCount) !== expected.size
    || manifest.idFingerprint !== fingerprintIds(expected)
    || found.size !== expected.size
    || missing.length
    || unexpected.length) {
    throw new Error(`Backup verification failed: expected=${expected.size}, found=${found.size}, missing=${missing.length}, unexpected=${unexpected.length}.`);
  }

  return {
    verified: true,
    filename,
    documentCount: found.size,
    compressedBytes: fs.statSync(filename).size,
    sha256: await sha256File(filename),
    idFingerprint: manifest.idFingerprint
  };
};

const findVerifiedMongoBackup = async ({ outputDir, prefix, expectedIds = [] } = {}) => {
  if (!outputDir || !fs.existsSync(outputDir)) return null;
  const stem = `${safePrefix(prefix)}-`;
  const candidates = fs.readdirSync(outputDir)
    .filter(name => name.startsWith(stem) && name.endsWith('.jsonl.gz'))
    .map(name => path.join(outputDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  for (const filename of candidates) {
    try {
      return await verifyMongoBackup({ filename, expectedIds });
    } catch (_error) {
      // A partial or differently scoped archive is never reused.
    }
  }
  return null;
};

const writeVerifiedMongoBackup = async ({
  Model,
  ids = [],
  outputDir,
  prefix = 'mongo-backup',
  manifest = {},
  batchSize = 10
} = {}) => {
  const expectedIds = [...new Set(ids.map(cleanId).filter(Boolean))];
  if (!Model?.find) throw new Error('A Mongo model is required for backup.');
  if (!expectedIds.length) throw new Error('At least one document id is required for backup.');
  if (!outputDir) throw new Error('A private backup directory is required.');

  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const nonce = crypto.randomBytes(4).toString('hex');
  const filename = path.join(outputDir, `${safePrefix(prefix)}-${stamp}-${nonce}.jsonl.gz`);
  const destination = fs.createWriteStream(filename, { flags: 'wx', mode: 0o600 });
  const gzip = zlib.createGzip({ level: 9 });
  const completed = new Promise((resolve, reject) => {
    destination.on('close', resolve);
    destination.on('error', reject);
    gzip.on('error', reject);
  });
  gzip.pipe(destination);

  const writeLine = async value => {
    if (!gzip.write(`${ejson(value)}\n`)) await new Promise(resolve => gzip.once('drain', resolve));
  };

  try {
    await writeLine({
      ...manifest,
      type: 'manifest',
      version: 1,
      createdAt: new Date(),
      expectedCount: expectedIds.length,
      idFingerprint: fingerprintIds(expectedIds)
    });
    const query = Model.find({ _id: { $in: expectedIds } }).lean();
    // Revision snapshots can approach Mongo's document limit. A one-document
    // batch keeps each network/readback checkpoint bounded instead of waiting
    // on a large batch that Atlas may need several minutes to assemble.
    const cursor = typeof query.cursor === 'function'
      ? query.cursor({ batchSize: Math.max(1, Math.min(Number(batchSize) || 10, 500)) })
      : query;
    for await (const document of cursor) await writeLine({ type: 'document', document });
    gzip.end();
    await completed;
    return verifyMongoBackup({ filename, expectedIds });
  } catch (error) {
    gzip.destroy();
    destination.destroy();
    fs.rmSync(filename, { force: true });
    throw error;
  }
};

const assertVerifiedBackup = (receipt, expectedCount) => {
  if (!receipt?.verified
    || Number(receipt.documentCount) !== Number(expectedCount)
    || !receipt.filename
    || !receipt.sha256
    || !receipt.idFingerprint) {
    throw new Error(`Verified backup required before Mongo mutation: expected ${expectedCount} documents.`);
  }
  return receipt;
};

module.exports = {
  assertVerifiedBackup,
  findVerifiedMongoBackup,
  fingerprintIds,
  verifyMongoBackup,
  writeVerifiedMongoBackup
};
