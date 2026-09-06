import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_API_URL = 'https://note-taker-3-unrg.onrender.com';

export const resolveConfigDir = ({ env = process.env } = {}) => (
  env.NOEIS_CONFIG_DIR ||
  path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'noeis')
);

export const resolveConfigPath = (options = {}) => path.join(resolveConfigDir(options), 'config.json');

// A stdio MCP server that throws on boot is a server the host reports as simply
// broken. An unreadable config should cost the caller a clear per-call message,
// not the whole connection, so every read failure degrades to "no token".
export const readConfig = ({ env = process.env } = {}) => {
  try {
    return JSON.parse(fs.readFileSync(resolveConfigPath({ env }), 'utf8'));
  } catch {
    return {};
  }
};

// The environment wins over the file: `noeis mcp` logs in, exports NOEIS_TOKEN,
// then boots this bridge. Hosts that spawn the bin directly get the file.
export const resolveAuth = ({ env = process.env } = {}) => {
  const config = readConfig({ env });
  return {
    token: String(env.NOEIS_TOKEN || config.token || '').trim(),
    apiUrl: String(env.NOEIS_API_URL || config.apiUrl || DEFAULT_API_URL).replace(/\/+$/g, '')
  };
};
