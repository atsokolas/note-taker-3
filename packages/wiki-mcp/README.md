# @noeis/wiki-mcp

MCP server for driving a Noeis wiki from external agents.

## Requirements

- Node 18.17+
- A Noeis connected-agent token from browser approval or `Settings -> Connected agents`
- Optional: `NOEIS_API_URL` if you are not using the hosted API

## One-command setup

Install the current internal CLI build and connect the runtime you use:

```bash
cd ~/Documents/GitHub/note-taker-3-1
npm i -g ./packages/cli
noeis connect hermes
# or
noeis connect openclaw
# or
noeis connect codex
```

The CLI opens Noeis in your browser, asks you to approve the local agent, writes the runtime MCP config, and runs an access check. The generated MCP config calls `noeis mcp`; it reads the token from the Noeis CLI config instead of copying the raw token into every runtime config.

Public package status: `@noeis/cli` and `@noeis/wiki-mcp` are not published on npm yet. After publish, install becomes `npm i -g @noeis/cli`.

## Agent launch links

Noeis also supports task links:

```text
https://www.noeis.io/a/run/at_...
```

These links package a specific task, target, runtime, and permission set. Opening the link lets the user dispatch the task into the normal Noeis handoff queue. If the requested runtime is not connected, Noeis shows the matching `noeis connect <runtime>` command before dispatch.

## Run

```bash
noeis mcp
```

`noeis mcp` reads the token and API URL from `~/.config/noeis/config.json`, `NOEIS_CONFIG_DIR`, or explicit environment variables. `NOEIS_API_URL` defaults to `https://api.noeis.io`.

## Need a normal CLI instead?

For cron jobs, shell scripts, or custom runtimes that do not speak MCP, install the sibling CLI:

```bash
cd ~/Documents/GitHub/note-taker-3-1
npm i -g ./packages/cli
noeis connect hermes
noeis ingest https://example.com/research
noeis pages list
```

The CLI uses the same Connected agents token and API routes as this MCP server.

## Claude Code

Add this to `~/.config/claude-code/mcp.json`:

```json
{
  "noeis-wiki": {
    "command": "noeis",
    "args": ["mcp"]
  }
}
```

Then run `claude` and check `/mcp`.

## Codex

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.noeis-wiki]
command = "noeis"
args = ["mcp"]
```

Restart Codex and confirm the `noeis-wiki` MCP server is connected.

## OpenCode

Add this server to your OpenCode MCP config:

```json
{
  "mcp": {
    "noeis-wiki": {
      "command": "noeis",
      "args": ["mcp"]
    }
  }
}
```

## Hermes

Add a stdio MCP server named `noeis-wiki`:

```json
{
  "servers": {
    "noeis-wiki": {
      "transport": "stdio",
      "command": "noeis",
      "args": ["mcp"]
    }
  }
}
```

## Optional local API

For local development:

```json
{
  "NOEIS_API_URL": "http://localhost:5500"
}
```

## Tools

Read tools available now. These return normalized JSON so external agents can list pages, choose one, read it, inspect references, and catch up on recent wiki activity with a read-scoped token:

- `list_pages`
- `get_page`
- `get_page_markdown`
- `search_pages`
- `get_schema`
- `get_briefing`
- `list_sources`
- `list_backlinks`
- `list_activity`
- `list_revisions`
- `list_source_events`
- `get_ingest_run`
- `list_proposals`
- `list_autolinks`
- `get_lint_run`

Write tools require a token with the `agent-write` scope. Read-only tokens receive `403` from the Noeis API on these calls:

- `create_page`
- `update_page`
- `archive_page`
- `ingest_source`
- `draft_page`
- `ask_page`
- `promote_answer`
- `lint_wiki`
- `apply_autolink`
- `add_source`
- `remove_source`
- `update_schema`
- `accept_proposal`
- `dismiss_proposal`
- `merge_proposal`

## Prompt

- `wiki_schema`: fetches the current Noeis wiki schema markdown and returns it as prompt context.
