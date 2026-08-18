const axios = require('axios');

const READWISE_AUTH_URL = 'https://readwise.io/api/v2/auth/';
const READWISE_EXPORT_URL = 'https://readwise.io/api/v2/export/';

const toTrimmedString = (value = '') => String(value || '').trim();

// Readwise issues two kinds of credential and they do not share an auth scheme.
// A personal API token is sent as "Token x"; an OAuth access token is a bearer.
// Browser approval hands back the second kind, which is why the import path —
// written only for the first — could never use it.
const readwiseHeaders = (token, tokenType = 'api') => ({
  Authorization: tokenType === 'oauth' ? `Bearer ${token}` : `Token ${token}`,
  'Content-Type': 'application/json'
});

const isAuthRejection = (error) => [401, 403].includes(Number(error?.response?.status));

/**
 * Try the scheme the credential says it is, then the other one.
 *
 * Readwise's export endpoint is documented for personal tokens; whether it also
 * takes an OAuth bearer is not something this codebase can assert. Rather than
 * guess and strand the user on a rejection, ask both ways and let the API decide.
 */
const requestWithEitherScheme = async (send, token, tokenType) => {
  try {
    return await send(readwiseHeaders(token, tokenType));
  } catch (error) {
    if (!isAuthRejection(error)) throw error;
    const fallback = tokenType === 'oauth' ? 'api' : 'oauth';
    return send(readwiseHeaders(token, fallback));
  }
};

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

const fetchReadwisePreviewRows = async ({ token, tokenType = 'api', limit = 25 }) => {
  const response = await requestWithEitherScheme((headers) => axios.get(READWISE_EXPORT_URL, {
    headers,
    params: {
      page_size: Math.min(Math.max(Number(limit) || 25, 1), 100)
    },
    timeout: 20000
  }), token, tokenType);
  const payload = response.data || {};
  return {
    results: Array.isArray(payload.results) ? payload.results : [],
    hasMore: Boolean(payload.nextPageCursor),
    nextPageCursor: toTrimmedString(payload.nextPageCursor)
  };
};

const fetchReadwiseExportRows = async ({ token, tokenType = 'api', updatedAfter = '' }) => {
  const results = [];
  let pageCursor = '';
  do {
    const params = {};
    if (updatedAfter) params.updatedAfter = updatedAfter;
    if (pageCursor) params.pageCursor = pageCursor;
    const response = await requestWithEitherScheme((headers) => axios.get(READWISE_EXPORT_URL, {
      headers,
      params,
      timeout: 20000
    }), token, tokenType);
    const payload = response.data || {};
    results.push(...(Array.isArray(payload.results) ? payload.results : []));
    pageCursor = toTrimmedString(payload.nextPageCursor);
  } while (pageCursor);
  return results;
};

module.exports = {
  assertReadwiseTokenValid,
  readwiseHeaders,
  fetchReadwiseExportRows,
  fetchReadwisePreviewRows
};
