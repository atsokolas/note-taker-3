const DEFAULT_HOST = 'http://localhost:6333';

const getConfig = () => ({
  host: process.env.QDRANT_HOST || DEFAULT_HOST,
  apiKey: process.env.QDRANT_API_KEY || ''
});

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
      points: [{ id, vector, payload }]
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
  search
};
