import assert from 'assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NoeisClient } from '../src/client.js';
import { resolveAuth, resolveConfigPath } from '../src/config.js';

const withConfigDir = (contents, body) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-config-'));
  if (contents !== null) fs.writeFileSync(path.join(dir, 'config.json'), contents);
  try {
    return body({ NOEIS_CONFIG_DIR: dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const run = () => {
  // A host that spawns the bin directly passes only NOEIS_CONFIG_DIR. That is
  // the whole reason this module exists: without it every tool call answered
  // "NOEIS_TOKEN is required" while `noeis login` had a token on disk.
  withConfigDir(JSON.stringify({ token: 'ntk_at_file', apiUrl: 'https://api.example/' }), (env) => {
    const auth = resolveAuth({ env });
    assert.strictEqual(auth.token, 'ntk_at_file');
    assert.strictEqual(auth.apiUrl, 'https://api.example');

    const client = new NoeisClient({ env, fetchImpl: async () => {} });
    assert.strictEqual(client.token, 'ntk_at_file');
    assert.strictEqual(client.apiUrl, 'https://api.example');
  });

  // `noeis mcp` logs in and exports the token before booting this bridge, so the
  // environment has to beat the file rather than the other way round.
  withConfigDir(JSON.stringify({ token: 'ntk_at_file' }), (env) => {
    const auth = resolveAuth({ env: { ...env, NOEIS_TOKEN: 'ntk_at_env' } });
    assert.strictEqual(auth.token, 'ntk_at_env');
  });

  // An unreadable config costs the caller a clear message per call, never the
  // connection: a stdio server that throws on boot just reads as broken.
  withConfigDir('{ not json', (env) => {
    assert.deepStrictEqual(resolveAuth({ env }).token, '');
    const client = new NoeisClient({ env, fetchImpl: async () => {} });
    assert.throws(() => client.requireToken(), /No Noeis token/);
  });

  withConfigDir(null, (env) => {
    assert.strictEqual(resolveAuth({ env }).token, '');
    assert(resolveAuth({ env }).apiUrl.startsWith('https://'));
  });

  assert.strictEqual(
    resolveConfigPath({ env: { HOME: '/home/x', XDG_CONFIG_HOME: '/cfg' } }),
    '/cfg/noeis/config.json'
  );
};

run();
