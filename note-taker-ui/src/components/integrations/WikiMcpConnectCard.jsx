import React from 'react';
import { Card } from '../ui';

const CODE_BLOCKS = [
  {
    label: 'Claude Code',
    detail: '~/.config/claude-code/mcp.json',
    code: `{
  "noeis-wiki": {
    "command": "noeis",
    "args": ["mcp"]
  }
}`
  },
  {
    label: 'Codex',
    detail: '~/.codex/config.toml',
    code: `[mcp_servers.noeis-wiki]
command = "noeis"
args = ["mcp"]`
  },
  {
    label: 'OpenCode',
    detail: 'MCP config',
    code: `{
  "mcp": {
      "noeis-wiki": {
      "command": "noeis",
      "args": ["mcp"]
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
      "command": "noeis",
      "args": ["mcp"]
    }
  }
}`
  }
];

const WikiMcpConnectCard = () => (
  <Card className="settings-card wiki-mcp-connect-card">
    <div className="settings-appearance-header">
      <div>
        <h2>One-command agent connect</h2>
        <p className="muted">Connect Claude Code, Codex, OpenCode, Hermes, OpenClaw, or scripted jobs through browser approval.</p>
      </div>
      <p className="muted-label">noeis mcp · connected-agent token</p>
    </div>
    <p className="muted small">
      Run one command, approve in Noeis, and the CLI writes one token source plus runtime MCP config that calls `noeis mcp`.
    </p>
    <div className="wiki-mcp-connect-card__panel">
      <p><strong>Recommended setup</strong></p>
      <p className="muted small">Use the runtime you want to connect. The browser approval page issues read/write Noeis access and the terminal finishes the local config.</p>
      <pre className="external-bridge-pre">{`npm i -g @noeis/noeis-cli
noeis connect hermes
# or: noeis connect openclaw
# or: noeis connect codex
noeis mcp --help
noeis pages list
noeis ingest https://example.com/research
noeis ask <pageId> "What changed?"`}</pre>
    </div>
    <details className="wiki-mcp-connect-card__manual">
      <summary>Manual setup</summary>
      <p className="muted small">
        Advanced path for custom runtimes: use `noeis mcp` so runtime configs read the token from the Noeis CLI config. Set `NOEIS_API_URL` only for local or self-hosted API targets.
      </p>
    <div className="wiki-mcp-connect-card__grid">
      {CODE_BLOCKS.map((block) => (
        <div key={block.label} className="wiki-mcp-connect-card__panel">
          <p><strong>{block.label}</strong></p>
          <p className="muted small">{block.detail}</p>
          <pre className="external-bridge-pre">{block.code}</pre>
        </div>
      ))}
    </div>
    </details>
  </Card>
);

export default WikiMcpConnectCard;
