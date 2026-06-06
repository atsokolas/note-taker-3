# @noeis/noeis-cli

Command-line client for scripting a Noeis wiki without an MCP-speaking agent.

## Install

```bash
npm i -g @noeis/noeis-cli
```

This installs the `noeis` command.

## Connect an agent

The normal setup path opens Noeis in your browser, asks you to approve the local agent, writes the CLI token, writes the runtime MCP config, and runs an access check:

```bash
noeis connect hermes
# or
noeis connect openclaw
# or
noeis connect codex
```

Supported runtime names: `claude-code`, `codex`, `hermes`, `openclaw`, and `opencode`.

The generated runtime MCP config calls `noeis mcp`. The raw token stays in one place: the Noeis CLI config, normally `~/.config/noeis/config.json`. Generated MCP configs should not copy `NOEIS_TOKEN`.

For OpenClaw, `noeis connect openclaw` writes both the XDG MCP file and `~/.openclaw/openclaw.json`, because OpenClaw installs differ in which config path they read.

For local/self-hosted API targets, pass both URLs:

```bash
noeis connect hermes --api-url http://localhost:5500 --app-url http://localhost:3000
```

If the browser cannot open automatically:

```bash
noeis connect hermes --no-browser
```

## Agent launch links

Noeis can create browser links that feed a task to a connected runtime:

```text
https://www.noeis.io/a/run/at_...
```

Open the link, review the task, then dispatch it to OpenClaw, Hermes, Codex, or another connected runtime. If the runtime is not connected yet, Noeis shows the exact connect command to run and preserves the task link.

## Manual auth

You can still create a Connected agents token in Noeis Settings and paste it manually:

```bash
noeis login --token ntk_at_... --api-url http://localhost:5500
```

You can also skip stored config and use environment variables:

```bash
NOEIS_TOKEN=ntk_at_... NOEIS_API_URL=https://note-taker-3-unrg.onrender.com noeis pages list
```

Manual environment variables are useful for scripts. Runtime MCP configs should prefer `noeis mcp` so secrets remain centralized.

## Commands

```bash
noeis pages list
noeis mcp --help
noeis pages get <id> --json
noeis ingest https://example.com/research
noeis ingest ./source.txt --title "Source title"
noeis draft <pageId>
noeis ask <pageId> "What changed?"
noeis schema show
noeis schema edit
noeis log --since 1d
```

Write commands require a Connected agents token with `agent-write`.
