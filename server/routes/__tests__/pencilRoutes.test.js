const { pencilOf } = require('../../services/agentTokenService');

const USER = '0123456789abcdef01234567';

describe('pencil', () => {
  it('is the agent that wrote, for a token that may write, and ink for everyone else', () => {
    const token = { id: 'tok', label: 'Claude Code local', runtime: 'claude-code', scopes: ['read', 'agent-write'] };
    expect(pencilOf({ agentToken: token })).toMatchObject({ agent: 'Claude Code local', tokenId: 'tok' });
    expect(pencilOf({ agentToken: { ...token, label: '' } }).agent).toBe('Claude Code');
    // The reader, and their own desktop bringing things in, write in ink.
    expect(pencilOf({ user: { id: USER } })).toBeNull();
    expect(pencilOf({ agentToken: { ...token, scopes: ['capture'] } })).toBeNull();
  });
});
