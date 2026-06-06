import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_API_URL = 'https://note-taker-3-unrg.onrender.com';
export const DEFAULT_APP_URL = 'https://www.noeis.io';

export const resolveConfigDir = ({ env = process.env } = {}) => (
  env.NOEIS_CONFIG_DIR ||
  path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'noeis')
);

export const resolveConfigPath = (options = {}) => path.join(resolveConfigDir(options), 'config.json');

export const readConfig = ({ env = process.env } = {}) => {
  const configPath = resolveConfigPath({ env });
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
};

export const writeConfig = (config = {}, { env = process.env } = {}) => {
  const configDir = resolveConfigDir({ env });
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(configDir, 0o700);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }
  const configPath = resolveConfigPath({ env });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return configPath;
};

export const resolveAuth = ({ env = process.env } = {}) => {
  const config = readConfig({ env });
  return {
    token: String(env.NOEIS_TOKEN || config.token || '').trim(),
    apiUrl: String(env.NOEIS_API_URL || config.apiUrl || DEFAULT_API_URL).replace(/\/+$/g, ''),
    appUrl: String(env.NOEIS_APP_URL || config.appUrl || DEFAULT_APP_URL).replace(/\/+$/g, '')
  };
};
