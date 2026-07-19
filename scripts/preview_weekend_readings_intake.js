#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  parseAutomationMemory,
  validateOpenClawHandoff
} = require('../server/services/weekendReadingsIntakeService');

const OPENCLAW_INTAKE_DIR = '/Users/athantsokolas/.openclaw/workspace/state/noeis-intake/afternoon-research';
const AUTOMATION_MEMORIES = Object.freeze([
  {
    sourceKind: 'sunday_reading_sweep',
    filePath: '/Users/athantsokolas/.codex/automations/sunday-reading-sweep/memory.md'
  },
  {
    sourceKind: 'friday_research_curation',
    filePath: '/Users/athantsokolas/.codex/automations/friday-research-curation/memory.md'
  },
  {
    sourceKind: 'friday_research_papers',
    filePath: '/Users/athantsokolas/.codex/automations/friday-research-papers/memory.md'
  }
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const parseArgs = (argv = process.argv.slice(2)) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value.`);
    args[key.slice(2)] = value;
    index += 1;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args['window-start'] || '')) throw new Error('--window-start YYYY-MM-DD is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args['window-end'] || '')) throw new Error('--window-end YYYY-MM-DD is required.');
  if (args['window-end'] < args['window-start']) throw new Error('--window-end must be on or after --window-start.');
  return args;
};

const readFixedRegularFile = (filePath, allowedRoot) => {
  const root = fs.realpathSync(allowedRoot);
  const resolved = fs.realpathSync(filePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Refusing path outside fixed intake root: ${filePath}`);
  const before = fs.lstatSync(filePath);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`Intake source must be a regular non-symlink file: ${filePath}`);
  if (before.size > MAX_FILE_BYTES) throw new Error(`Intake source exceeds ${MAX_FILE_BYTES} bytes: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const after = fs.lstatSync(filePath);
  if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error(`Intake source changed while being read: ${filePath}`);
  }
  if (content.includes('\u0000')) throw new Error(`Intake source is not valid text: ${filePath}`);
  return content;
};

const collectPayload = ({ windowStart, windowEnd } = {}) => {
  const candidateItems = [];
  if (fs.existsSync(OPENCLAW_INTAKE_DIR)) {
    const names = fs.readdirSync(OPENCLAW_INTAKE_DIR)
      .filter(name => name === 'latest.json' || /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort();
    const seen = new Set();
    names.forEach((name) => {
      const text = readFixedRegularFile(path.join(OPENCLAW_INTAKE_DIR, name), OPENCLAW_INTAKE_DIR);
      const payload = JSON.parse(text);
      const generatedDate = String(payload?.generatedAt || '').slice(0, 10);
      if (generatedDate < windowStart || generatedDate > windowEnd) return;
      const identity = `${payload?.sourceJobId || ''}:${payload?.generatedAt || ''}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      candidateItems.push(...validateOpenClawHandoff(payload, { sourceName: name }).items);
    });
  }

  const warnings = [];
  AUTOMATION_MEMORIES.forEach(({ sourceKind, filePath }) => {
    const parsed = parseAutomationMemory({
      sourceKind,
      sourceName: path.basename(path.dirname(filePath)),
      text: readFixedRegularFile(filePath, path.dirname(filePath)),
      windowStart,
      windowEnd
    });
    candidateItems.push(...parsed.items);
    warnings.push(...parsed.warnings);
  });
  return { candidateItems, collectorWarnings: warnings };
};

const postPreview = async ({ apiBase, token, payload }) => {
  if (!token) throw new Error('NOEIS_AUTH_TOKEN is required with --api-base.');
  const response = await fetch(`${String(apiBase).replace(/\/$/, '')}/api/wiki/weekend-readings/intake/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateItems: payload.candidateItems })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Noeis intake preview failed with HTTP ${response.status}.`);
  return body;
};

const main = async () => {
  const args = parseArgs();
  const payload = collectPayload({ windowStart: args['window-start'], windowEnd: args['window-end'] });
  const preview = args['api-base']
    ? await postPreview({ apiBase: args['api-base'], token: process.env.NOEIS_AUTH_TOKEN, payload })
    : null;
  const result = preview
    ? { ...preview, warnings: [...(payload.collectorWarnings || []), ...(preview.warnings || [])] }
    : payload;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  AUTOMATION_MEMORIES,
  OPENCLAW_INTAKE_DIR,
  collectPayload,
  parseArgs,
  readFixedRegularFile
};
