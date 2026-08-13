const crypto = require('crypto');

const DEFAULT_HOST = 'http://localhost:6333';

const getConfig = () => ({
  host: process.env.QDRANT_HOST || DEFAULT_HOST,
  apiKey: process.env.QDRANT_API_KEY || ''
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Qdrant accepts only an unsigned integer or a UUID as a point ID. Every caller
 * here passes a Mongo ObjectId hex string, which Qdrant rejects with a 400 —
 * silently, from the caller's perspective, because the embedding job queue
 * swallows the failure and retries until it abandons the job.
 *
 * Hash anything that is not already a valid ID into a deterministic UUID. It
 * must be deterministic so re-embedding an object overwrites its point instead
 * of duplicating it. Nothing reads the point ID back — lookups go through
 * `payload.objectId` — so the mapping does not need to be reversible.
 */
const toPointId = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  const raw = String(value ?? '').trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  if (UUID_RE.test(raw)) return raw.toLowerCase();
  const hash = crypto.createHash('sha1').update(raw).digest('hex');
  const variant = ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-');
};

const buildHeaders = () => {
  const { apiKey } = getConfig();
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'api-key': apiKey } : {})
  };
};

const ensureCollection = async ({ collection, vectorSize }) => {
  const { host } = getConfig();
  const res = await fetch(`${host}/collections/${collection}`, {
    method: 'GET',
    headers: buildHeaders()
  });
  if (res.status === 404) {
    const createRes = await fetch(`${host}/collections/${collection}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: 'Cosine' }
      })
    });
    if (!createRes.ok) {
      const text = await createRes.text().catch(() => '');
      throw new Error(`Qdrant create failed (${createRes.status}): ${text || createRes.statusText}`);
    }
    return;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant collection check failed (${res.status}): ${text || res.statusText}`);
  }
};

const upsertVector = async ({ collection, id, vector, payload }) => {
  const { host } = getConfig();
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Qdrant upsert requires a vector.');
  }
  await ensureCollection({ collection, vectorSize: vector.length });
  const res = await fetch(`${host}/collections/${collection}/points?wait=true`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify({
      points: [{ id: toPointId(id), vector, payload }]
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant upsert failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
};

const search = async ({ collection, vector, limit = 5, filter }) => {
  const { host } = getConfig();
  const res = await fetch(`${host}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      vector,
      limit,
      filter,
      with_payload: true
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant search failed (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data?.result) ? data.result : [];
};

module.exports = {
  upsertVector,
  search,
  toPointId
};
