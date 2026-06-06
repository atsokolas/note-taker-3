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
  <Card className="settings-card wiki-mcp-connect-card">
    <div className="settings-appearance-header">
      <div>
        <h2>One-command agent connect</h2>
        <p className="muted">Connect Claude Code, Codex, OpenCode, Hermes, OpenClaw, or scripted jobs through browser approval.</p>
      </div>
      <p className="muted-label">@noeis/wiki-mcp · @noeis/cli</p>
    </div>
    <p className="muted small">
      Run one command, approve in Noeis, and the CLI writes the local MCP config plus a revocable connected-agent token.
    </p>
    <div className="wiki-mcp-connect-card__panel">
      <p><strong>Recommended setup</strong></p>
      <p className="muted small">Use the runtime you want to connect. The browser approval page issues read/write Noeis access and the terminal finishes the local config.</p>
      <pre className="external-bridge-pre">{`npm i -g @noeis/cli
noeis connect hermes
# or: noeis connect openclaw
# or: noeis connect codex
noeis pages list
noeis ingest https://example.com/research
noeis ask <pageId> "What changed?"`}</pre>
    </div>
    <details className="wiki-mcp-connect-card__manual">
      <summary>Manual setup</summary>
      <p className="muted small">
        Advanced path for custom runtimes: create a token in Settings &gt; Connected agents, set `NOEIS_TOKEN`, and add `NOEIS_API_URL` only for local or self-hosted API targets.
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
