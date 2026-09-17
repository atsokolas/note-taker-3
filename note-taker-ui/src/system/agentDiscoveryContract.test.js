import fs from 'fs';
import path from 'path';

const publicPath = (...parts) => path.join(process.cwd(), 'public', ...parts);

describe('public NOEIS agent discovery', () => {
  it('advertises only the implemented stdio transport and metadata proof', () => {
    const contract = JSON.parse(fs.readFileSync(
      publicPath('.well-known', 'noeis-agent.json'),
      'utf8'
    ));

    expect(contract.schema).toBe('noeis.agent-discovery.v1');
    expect(contract.transports).toEqual([expect.objectContaining({
      type: 'stdio',
      command: 'noeis',
      args: ['mcp']
    })]);
    expect(JSON.stringify(contract)).not.toMatch(/https:\/\/www\.noeis\.io\/mcp/i);
    expect(contract.authorization.supportedScopes).toEqual(['read', 'agent-write']);
    expect(contract.authorization.defaultScope).toBe('read');
    expect(contract.verification.tool).toBe('connection_info');
    expect(contract.verification.contentRead).toBe(false);
    expect(contract.verification.contentWritten).toBe(false);
  });

  it('documents human approval, exact scope, and the runtime verification boundary', () => {
    const guide = fs.readFileSync(publicPath('skill.md'), 'utf8');

    expect(guide).toContain('noeis connect openclaw --scope read');
    expect(guide).toMatch(/Only the human approves/i);
    expect(guide).toMatch(/connection_info/);
    expect(guide).toMatch(/does not prove.*runtime.*loaded/i);
    expect(guide).not.toMatch(/open.*approval.*on behalf/i);
  });

  it('links the agent setup guide from the public guides index', () => {
    const index = fs.readFileSync(publicPath('guides', 'index.html'), 'utf8');
    expect(index).toMatch(/href="\/skill\.md"/);
    expect(index).toMatch(/Connect an agent to NOEIS/i);
  });
});
