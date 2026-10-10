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

/* The name a stranger may see for an agent: its runtime's short name, or one
   its label plainly carries ("Codex Wiki account grounding audit" is Codex).
   Never the label itself, which someone typed for their own eyes. Mirrors
   agentOf in note-taker-ui/src/components/editions/editionAgent.js. */
const PUBLIC_NAMES = {
  'claude-code': 'Claude',
  codex: 'Codex',
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  opencode: 'OpenCode'
};
const NAMED_IN_LABEL = [
  [/opencode/i, 'opencode'],
  [/openclaw/i, 'openclaw'],
  [/codex/i, 'codex'],
  [/claude/i, 'claude-code'],
  [/hermes/i, 'hermes']
];

const publicAgentName = ({ label = '', runtime = '' } = {}) => {
  const known = PUBLIC_NAMES[String(runtime || '').trim().toLowerCase()];
  if (known) return known;
  const named = NAMED_IN_LABEL.find(([pattern]) => pattern.test(String(label || '')));
  return named ? PUBLIC_NAMES[named[1]] : '';
};

module.exports = {
  normalizeRuntime,
  publicAgentName,
  runtimeLabel
};
