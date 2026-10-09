/* The runtimes an agent can connect from, and how each is named to a person.
   `agent` is the catch-all for anything we do not recognise. */
const RUNTIME_LABELS = {
  agent: 'Noeis agent',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  opencode: 'OpenCode'
};

const SUPPORTED_RUNTIMES = new Set(Object.keys(RUNTIME_LABELS));

const normalizeRuntime = (value = '') => {
  const runtime = String(value || '').trim().toLowerCase();
  if (runtime === 'claude') return 'claude-code';
  return SUPPORTED_RUNTIMES.has(runtime) ? runtime : 'agent';
};

const runtimeLabel = (runtime = 'agent') => RUNTIME_LABELS[runtime] || RUNTIME_LABELS.agent;

module.exports = {
  normalizeRuntime,
  runtimeLabel
};
