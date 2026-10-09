import { agentOf, handsOf } from './editionAgent';

describe('which agent filed it', () => {
  it('names every runtime by its short name, initials and shape', () => {
    expect(agentOf({ runtime: 'claude-code', label: 'x' })).toMatchObject({ key: 'claude-code', name: 'Claude', initials: 'Cl', shape: 'circle' });
    expect(agentOf({ runtime: 'codex', label: 'x' })).toMatchObject({ key: 'codex', name: 'Codex', initials: 'Cx', shape: 'square' });
    expect(agentOf({ runtime: 'openclaw', label: 'x' })).toMatchObject({ key: 'openclaw', name: 'OpenClaw', initials: 'OC', shape: 'diamond' });
    expect(agentOf({ runtime: 'hermes', label: 'x' })).toMatchObject({ key: 'hermes', name: 'Hermes', initials: 'He', shape: 'pill' });
    expect(agentOf({ runtime: 'opencode', label: 'x' })).toMatchObject({ key: 'opencode', name: 'OpenCode', initials: 'Op', shape: 'hexagon' });
  });

  /* The live paper: a hand-made token, no runtime, a long label. */
  it('reads the runtime from the label when the token carried none', () => {
    const codex = agentOf({ runtime: '', label: 'Codex Wiki account grounding audit' });
    expect(codex).toMatchObject({ key: 'codex', name: 'Codex', shape: 'square', label: 'Codex Wiki account grounding audit' });
    expect(agentOf({ label: 'OpenClaw · Jarvis' }).key).toBe('openclaw');
    expect(agentOf({ label: 'my opencode box' }).key).toBe('opencode');
    expect(agentOf({ label: 'Claude at home' }).key).toBe('claude-code');
    expect(agentOf({ label: 'HERMES nightly' }).key).toBe('hermes');
  });

  it('treats the catch-all runtime like a missing one', () => {
    expect(agentOf({ runtime: 'agent', label: 'Codex research' }).key).toBe('codex');
  });

  it('gives an unknown agent its own initials and a dashed mark', () => {
    expect(agentOf({ runtime: 'agent', label: 'Jarvis' })).toMatchObject({ name: 'Jarvis', initials: 'Ja', shape: 'dashed' });
    expect(agentOf({ label: 'Night shift' })).toMatchObject({ initials: 'NS', shape: 'dashed' });
  });

  it('marks two filings by the same runtime as one agent', () => {
    expect(agentOf({ runtime: 'codex', label: 'Codex · research' }).key)
      .toBe(agentOf({ label: 'Codex Wiki account grounding audit' }).key);
  });

  it('says nothing about an unsigned filing', () => {
    expect(agentOf({ runtime: '', label: '' })).toBeNull();
    expect(agentOf()).toBeNull();
  });
});

describe('the hands on a section', () => {
  it('names every agent that filed or read, once, in order', () => {
    const hands = handsOf([
      { filedBy: 'OpenClaw · Jarvis', filedByRuntime: 'openclaw', readings: [{ filedBy: 'Codex', filedByRuntime: 'codex' }] },
      { filedBy: 'Codex Wiki account grounding audit', filedByRuntime: '' },
      { filedBy: '', filedByRuntime: '' }
    ]);
    expect(hands.map(hand => agentOf(hand).name)).toEqual(['OpenClaw', 'Codex']);
  });
});

