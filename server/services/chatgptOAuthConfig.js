const secureUrl = (value, { origin = false } = {}) => {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash) {
    throw new Error('OAuth URLs must use HTTPS (HTTP is allowed only on loopback).');
  }
  if (origin && (url.pathname !== '/' || url.search)) throw new Error('OAuth issuer/app URL must be an origin.');
  return origin ? url.origin : url.toString();
};

const readChatgptOAuthConfig = (env = process.env) => {
  if (!env.NOEIS_CHATGPT_OAUTH_ISSUER) return null;
  const issuer = secureUrl(env.NOEIS_CHATGPT_OAUTH_ISSUER, { origin: true });
  const resource = secureUrl(env.NOEIS_CHATGPT_MCP_RESOURCE || `${issuer}/mcp`);
  const appUrl = secureUrl(env.NOEIS_APP_URL || env.FRONTEND_URL || 'https://www.noeis.io', { origin: true });
  const internalApiUrl = secureUrl(env.NOEIS_MCP_INTERNAL_API_URL || `http://127.0.0.1:${env.PORT || 3000}`, { origin: true });
  const rows = JSON.parse(env.NOEIS_CHATGPT_OAUTH_CLIENTS || '[]');
  if (!Array.isArray(rows) || !rows.length) throw new Error('Configure at least one predefined ChatGPT OAuth client.');
  const clients = new Map();
  for (const row of rows) {
    if (typeof row.client_id !== 'string' || !row.client_id || row.client_id.length > 500 || clients.has(row.client_id)) {
      throw new Error('OAuth client IDs must be unique nonempty strings.');
    }
    if (!Array.isArray(row.redirect_uris) || !row.redirect_uris.length) throw new Error('OAuth clients need exact redirect URIs.');
    const redirectUris = row.redirect_uris.map(value => {
      if (typeof value !== 'string' || secureUrl(value) !== value) throw new Error('OAuth redirect URIs must be exact canonical URLs.');
      return value;
    });
    clients.set(row.client_id, { clientId: row.client_id, name: String(row.client_name || 'ChatGPT').slice(0, 100), redirectUris });
  }
  return { issuer, resource, appUrl, internalApiUrl, clients, accessTtlSec: 3600, refreshTtlSec: 30 * 86400 };
};
module.exports = { readChatgptOAuthConfig };
