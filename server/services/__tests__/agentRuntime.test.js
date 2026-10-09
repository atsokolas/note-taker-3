const { normalizeRuntime, runtimeLabel } = require('../agentRuntime');

describe('agent runtimes', () => {
  it('keeps a known runtime and folds anything else into agent', () => {
    expect(normalizeRuntime(' Codex ')).toBe('codex');
    expect(normalizeRuntime('openclaw')).toBe('openclaw');
    expect(normalizeRuntime('cursor')).toBe('agent');
    expect(normalizeRuntime('')).toBe('agent');
  });

  it('reads "claude" as Claude Code', () => {
    expect(normalizeRuntime('claude')).toBe('claude-code');
    expect(runtimeLabel('claude-code')).toBe('Claude Code');
  });

  it('names an unknown runtime as a Noeis agent', () => {
    expect(runtimeLabel('nope')).toBe('Noeis agent');
    expect(runtimeLabel()).toBe('Noeis agent');
  });
});
