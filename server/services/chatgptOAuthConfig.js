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
  // Open clients: any MCP app may register itself (RFC 7591); a person still approves every connection.
  const openClients = env.NOEIS_OAUTH_OPEN_CLIENTS === 'true';
  const rows = JSON.parse(env.NOEIS_CHATGPT_OAUTH_CLIENTS || '[]');
  if (!Array.isArray(rows) || (!rows.length && !openClients)) throw new Error('Configure at least one predefined OAuth client or open registration.');
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
  // Budgets are per deployment/client, not per IP: many readers share ChatGPT egress.
  // Configuration may lower or reasonably raise budgets, but cannot disable bounds.
  const integer = (name, fallback, max) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${name} must be an integer from 1 to ${max}.`);
    return value;
  };
  const limits = {
    authorize: {
      global: integer('NOEIS_OAUTH_AUTHORIZE_GLOBAL_PER_MINUTE', 1200, 100000),
      client: integer('NOEIS_OAUTH_AUTHORIZE_CLIENT_PER_MINUTE', 600, 100000)
    },
    token: {
      global: integer('NOEIS_OAUTH_TOKEN_GLOBAL_PER_MINUTE', 12000, 100000),
      client: integer('NOEIS_OAUTH_TOKEN_CLIENT_PER_MINUTE', 6000, 100000)
    },
    revoke: {
      global: integer('NOEIS_OAUTH_REVOKE_GLOBAL_PER_MINUTE', 2400, 100000),
      client: integer('NOEIS_OAUTH_REVOKE_CLIENT_PER_MINUTE', 1200, 100000)
    },
    consent: {
      global: integer('NOEIS_OAUTH_CONSENT_GLOBAL_PER_MINUTE', 2400, 100000)
    },
    register: {
      global: integer('NOEIS_OAUTH_REGISTER_GLOBAL_PER_MINUTE', 60, 10000)
    },
    registeredClients: integer('NOEIS_OAUTH_REGISTERED_CLIENTS_MAX', 10000, 100000),
    pending: {
      global: integer('NOEIS_OAUTH_PENDING_GLOBAL', 2000, 10000),
      client: integer('NOEIS_OAUTH_PENDING_CLIENT', 1000, 10000)
    },
    refreshRotations: integer('NOEIS_OAUTH_MAX_REFRESH_ROTATIONS', 2048, 4096)
  };
  return { issuer, resource, appUrl, internalApiUrl, clients, openClients, limits, accessTtlSec: 3600, refreshTtlSec: 30 * 86400 };
};
module.exports = { readChatgptOAuthConfig };
