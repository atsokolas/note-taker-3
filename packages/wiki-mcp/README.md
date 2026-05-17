# @noeis/wiki-mcp

MCP server for driving a Noeis wiki from external agents.

## Requirements

- Node 18.17+
- A Noeis connected-agent token from `Settings -> Connected agents`
- Optional: `NOEIS_API_URL` if you are not using the hosted API

## Run

```bash
NOEIS_TOKEN="ntk_at_..." npx -y @noeis/wiki-mcp
```

`NOEIS_API_URL` defaults to `https://api.noeis.io`.

## Need a normal CLI instead?

For cron jobs, shell scripts, or custom runtimes that do not speak MCP, install the sibling CLI:

```bash
npm i -g @noeis/cli
noeis login --token ntk_at_...
noeis ingest https://example.com/research
noeis pages list
```

The CLI uses the same Connected agents token and API routes as this MCP server.

## Claude Code

Add this to `~/.config/claude-code/mcp.json`:

```json
{
  "noeis-wiki": {
    "command": "npx",
    "args": ["-y", "@noeis/wiki-mcp"],
    "env": {
      "NOEIS_TOKEN": "ntk_at_..."
    }
  }
}
```

Then run `claude` and check `/mcp`.

## Codex

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.noeis-wiki]
command = "npx"
args = ["-y", "@noeis/wiki-mcp"]
env = { NOEIS_TOKEN = "ntk_at_..." }
```

Restart Codex and confirm the `noeis-wiki` MCP server is connected.

## OpenCode

Add this server to your OpenCode MCP config:

```json
{
  "mcp": {
    "noeis-wiki": {
      "command": "npx",
      "args": ["-y", "@noeis/wiki-mcp"],
      "env": {
        "NOEIS_TOKEN": "ntk_at_..."
      }
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
      "command": "npx",
      "args": ["-y", "@noeis/wiki-mcp"],
      "env": {
        "NOEIS_TOKEN": "ntk_at_..."
      }
    }
  }
}
```

## Optional local API

For local development:

```json
{
  "NOEIS_TOKEN": "ntk_at_...",
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
