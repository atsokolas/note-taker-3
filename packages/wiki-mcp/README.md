# @noeis/wiki-mcp

MCP server for driving a Noeis wiki from external agents.

## Requirements

- Node 18.17+
- A Noeis connected-agent token from browser approval or `Settings -> Connected agents`
- Optional: `NOEIS_API_URL` if you are not using the hosted API

## Editions

An edition is a paper you keep for your reader — *This Week in AI*, *Weekend
Readings*. Noeis does not write it; it holds it to a shape and files it under a
window, and the reader reads it at `/editions` and saves sources from it into
their library.

The shape is the whole contribution. Every item carries a **finding** (what the
source says) and a **boundary** (what would limit it). An item without a
boundary is refused by name, so you can fix it and file again — that rule is
the difference between an edition and a newsletter. A section nobody filled is
printed rather than dropped.

```
create_edition   file or replace an edition for a window
list_editions    what is already on the stand — check before filing, so you
                 continue a run rather than starting a second one
get_edition      one edition in full, including which sources the reader took
```

Filing twice for the same window replaces your own edition rather than printing
a second copy of Tuesday, and sources the reader has already saved survive the
rewrite — those are theirs, not yours.

## Running it from a checkout

For testing against unreleased tools, point the runtime at this directory
instead of the published package. The server is a plain stdio process:

```json
{
  "servers": {
    "noeis-wiki-dev": {
      "transport": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/note-taker-3/packages/wiki-mcp/bin/noeis-wiki-mcp"],
      "env": { "NOEIS_CONFIG_DIR": "/Users/you/.config/noeis" }
    }
  }
}
```

`NOEIS_API_URL` is optional and defaults to the hosted API, so a checkout talks
to the same Noeis the published package does.

## One-command setup

Install the CLI and connect the runtime you use:

```bash
npm i -g @noeis/noeis-cli
noeis connect hermes
# or
noeis connect openclaw
# or
noeis connect codex
```

The CLI opens Noeis in your browser, asks you to approve the local agent, writes the runtime MCP config, and runs an access check. The generated MCP config calls `noeis mcp`; it reads the token from the Noeis CLI config instead of copying the raw token into every runtime config.

Public package status: `@noeis/noeis-cli` and `@noeis/wiki-mcp` are published on npm.

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

Both `noeis mcp` and `noeis-wiki-mcp` read the token and API URL from `NOEIS_TOKEN`/`NOEIS_API_URL` when set, and otherwise from `config.json` in `NOEIS_CONFIG_DIR` (default `~/.config/noeis`) — the file `noeis login` writes. `NOEIS_API_URL` defaults to `https://note-taker-3-unrg.onrender.com`.

The MCP surface includes wiki tools plus Library/Think tools for saved articles, highlights, concepts, and questions. Agents can search highlights, fetch articles, create article highlights, create or update Think questions, update concepts, pin highlights to concepts, and create or edit wiki pages.

## Need a normal CLI instead?

For cron jobs, shell scripts, or custom runtimes that do not speak MCP, install the sibling CLI:

```bash
npm i -g @noeis/noeis-cli
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
