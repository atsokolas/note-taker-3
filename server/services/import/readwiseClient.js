const axios = require('axios');

const READWISE_AUTH_URL = 'https://readwise.io/api/v2/auth/';
const READWISE_EXPORT_URL = 'https://readwise.io/api/v2/export/';

const toTrimmedString = (value = '') => String(value || '').trim();

const readwiseHeaders = (token) => ({
  Authorization: `Token ${token}`,
  'Content-Type': 'application/json'
});

const assertReadwiseTokenValid = async (apiToken) => {
  const response = await axios.get(READWISE_AUTH_URL, {
    headers: readwiseHeaders(apiToken),
    timeout: 10000,
    validateStatus: (status) => status >= 200 && status < 500
  });
  if (response.status !== 204) {
    throw new Error('Readwise rejected the token.');
  }
};

const fetchReadwisePreviewRows = async ({ token, limit = 25 }) => {
  const response = await axios.get(READWISE_EXPORT_URL, {
    headers: readwiseHeaders(token),
    params: {
      page_size: Math.min(Math.max(Number(limit) || 25, 1), 100)
    },
    timeout: 20000
  });
  const payload = response.data || {};
  return {
    results: Array.isArray(payload.results) ? payload.results : [],
    hasMore: Boolean(payload.nextPageCursor),
    nextPageCursor: toTrimmedString(payload.nextPageCursor)
  };
};

const fetchReadwiseExportRows = async ({ token, updatedAfter = '' }) => {
  const results = [];
  let pageCursor = '';
  do {
    const params = {};
    if (updatedAfter) params.updatedAfter = updatedAfter;
    if (pageCursor) params.pageCursor = pageCursor;
    const response = await axios.get(READWISE_EXPORT_URL, {
      headers: readwiseHeaders(token),
      params,
      timeout: 20000
    });
    const payload = response.data || {};
    results.push(...(Array.isArray(payload.results) ? payload.results : []));
    pageCursor = toTrimmedString(payload.nextPageCursor);
  } while (pageCursor);
  return results;
};

module.exports = {
  assertReadwiseTokenValid,
  fetchReadwiseExportRows,
  fetchReadwisePreviewRows
};
