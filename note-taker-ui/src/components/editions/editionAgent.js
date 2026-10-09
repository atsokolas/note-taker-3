/**
 * Who an agent is, as a reader should see it.
 *
 * The paper names an agent by the runtime it connected from, not by the token
 * label someone typed in Connections ("Codex Wiki account grounding audit"
 * reads as Codex). The label survives as the tooltip. Marks are shape and
 * initials, never colour: colour already means section.
 */
const AGENTS = {
  'claude-code': { name: 'Claude', initials: 'Cl', shape: 'circle' },
  codex: { name: 'Codex', initials: 'Cx', shape: 'square' },
  openclaw: { name: 'OpenClaw', initials: 'OC', shape: 'diamond' },
  hermes: { name: 'Hermes', initials: 'He', shape: 'pill' },
  opencode: { name: 'OpenCode', initials: 'Op', shape: 'hexagon' }
};

/* Checked in order: "opencode" before "codex", "openclaw" before "claude". */
const LABEL_MATCHES = [
  [/opencode/i, 'opencode'],
  [/openclaw/i, 'openclaw'],
  [/codex/i, 'codex'],
  [/claude/i, 'claude-code'],
  [/hermes/i, 'hermes']
];

const initialsOf = (label) => {
  const words = label.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  const word = words[0] || '';
  return word ? `${word[0].toUpperCase()}${word.slice(1, 2).toLowerCase()}` : 'Ag';
};

/* A token made by hand carries no runtime, and "agent" is the catch-all for
   one we did not recognise: both fall back to what the label says. */
export const agentOf = ({ runtime = '', label = '' } = {}) => {
  const text = String(label || '').trim();
  const known = String(runtime || '').trim().toLowerCase();
  if (!text && (!known || known === 'agent')) return null;
  const key = AGENTS[known]
    ? known
    : (LABEL_MATCHES.find(([pattern]) => pattern.test(text)) || [])[1];
  if (key) return { key, ...AGENTS[key], label: text || AGENTS[key].name };
  return {
    key: `agent:${text.toLowerCase()}`,
    name: text || 'Agent',
    initials: initialsOf(text),
    shape: 'dashed',
    label: text
  };
};

/* Every distinct hand that filed into a run of items, first readings and
   second ones alike, in the order they appear. */
export const handsOf = (items = []) => {
  const seen = new Map();
  items.forEach((item) => {
    [
      { label: item.filedBy, runtime: item.filedByRuntime },
      ...(item.readings || []).map((reading) => ({ label: reading.filedBy, runtime: reading.filedByRuntime }))
    ].forEach((hand) => {
      const agent = agentOf(hand);
      if (agent && !seen.has(agent.key)) seen.set(agent.key, hand);
    });
  });
  return [...seen.values()];
};

/* Back from a recognised agent to the props AgentMark takes. */
export const handOf = (agent) => ({ runtime: AGENTS[agent.key] ? agent.key : '', label: agent.label });
