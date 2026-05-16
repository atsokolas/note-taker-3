import React from 'react';
import { Card } from '../ui';

const CODE_BLOCKS = [
  {
    label: 'Claude Code',
    detail: '~/.config/claude-code/mcp.json',
    code: `{
  "noeis-wiki": {
    "command": "npx",
    "args": ["-y", "@noeis/wiki-mcp"],
    "env": { "NOEIS_TOKEN": "ntk_at_..." }
  }
}`
  },
  {
    label: 'Codex',
    detail: '~/.codex/config.toml',
    code: `[mcp_servers.noeis-wiki]
command = "npx"
args = ["-y", "@noeis/wiki-mcp"]
env = { NOEIS_TOKEN = "ntk_at_..." }`
  },
  {
    label: 'OpenCode',
    detail: 'MCP config',
    code: `{
  "mcp": {
    "noeis-wiki": {
      "command": "npx",
      "args": ["-y", "@noeis/wiki-mcp"],
      "env": { "NOEIS_TOKEN": "ntk_at_..." }
    }
  }
}`
  },
  {
    label: 'Hermes',
    detail: 'stdio MCP server',
    code: `{
  "servers": {
    "noeis-wiki": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@noeis/wiki-mcp"],
      "env": { "NOEIS_TOKEN": "ntk_at_..." }
    }
  }
}`
  }
];

const WikiMcpConnectCard = () => (
  <Card className="settings-card">
    <div className="settings-appearance-header">
      <div>
        <h2>Noeis wiki MCP</h2>
        <p className="muted">Connect Claude Code, Codex, OpenCode, or Hermes to your wiki with a Connected agents token.</p>
      </div>
      <p className="muted-label">@noeis/wiki-mcp</p>
    </div>
    <p className="muted small">
      Create a token in Settings &gt; Connected agents. Use `NOEIS_TOKEN` for hosted Noeis, and add `NOEIS_API_URL` only for local or self-hosted API targets.
    </p>
    <div className="settings-option-row" style={{ alignItems: 'stretch', flexWrap: 'wrap', marginTop: 12 }}>
      {CODE_BLOCKS.map((block) => (
        <div key={block.label} className="settings-option-button" style={{ flex: '1 1 300px', display: 'block' }}>
          <p><strong>{block.label}</strong></p>
          <p className="muted small">{block.detail}</p>
          <pre className="external-bridge-pre" style={{ whiteSpace: 'pre-wrap' }}>{block.code}</pre>
        </div>
      ))}
    </div>
  </Card>
);

export default WikiMcpConnectCard;
