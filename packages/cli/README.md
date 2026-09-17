# @noeis/noeis-cli

Command-line client for scripting a Noeis wiki without an MCP-speaking agent.

## Install

```bash
npm i -g @noeis/noeis-cli
```

This installs the `noeis` command.

## Connect an agent

The normal setup path requests read-only access, opens Noeis for human approval,
verifies workspace/grant metadata, writes the CLI credential, and writes the
runtime MCP config:

```bash
noeis connect hermes --scope read
# or
noeis connect openclaw --scope read
# or
noeis connect codex --scope read
```

Supported runtime names: `claude-code`, `codex`, `hermes`, `openclaw`, and `opencode`.

Use `--scope read-write` only when the human explicitly chose the broader
`read` + `agent-write` grant. Unknown scopes are rejected instead of widened or
silently replaced.

The generated runtime MCP config calls `noeis mcp`. The raw token stays in one place: the Noeis CLI config, normally `~/.config/noeis/config.json`. Generated MCP configs should not copy `NOEIS_TOKEN`.

For OpenClaw, `noeis connect openclaw --scope read` writes both the XDG MCP file
and `~/.openclaw/openclaw.json`, because OpenClaw installs differ in which config
path they read.

For local/self-hosted API targets, pass both URLs:

```bash
noeis connect hermes --scope read --api-url http://localhost:5500 --app-url http://localhost:3000
```

If the browser cannot open automatically:

```bash
noeis connect hermes --scope read --no-browser
```

The approval URL contains only the opaque session reference. The CLI retains its
polling secret. Only the human approves after comparing the code, runtime, account
destination, expiry, and actual scopes.

After approval, the CLI calls the metadata-only `/api/agent-connection` endpoint.
The matching MCP tool is `connection_info`; it returns stable workspace/grant
identity without reading or creating user content. Writing runtime config does not
prove that runtime loaded its tools, so reload the runtime and call
`connection_info` there before reporting setup complete.

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
