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

The MCP surface includes wiki tools plus Library/Think tools for saved articles, highlights, concepts, and questions. Agents can search highlights, fetch articles, create article highlights, file articles into folders and keep them on the Shelf, create or update Think questions, update concepts, pin highlights to concepts, and create or edit wiki pages.

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

Both lists below are the complete tool surface, checked against `toolDefinitions`
by `test/server.test.js` — a tool added without a line here fails the suite.

Read tools return normalized JSON, so an agent can list pages, choose one, read
it, inspect references, and catch up on recent activity with a read-scoped token:

- `list_edition_profiles`
- `list_editions`
- `get_edition`
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
- `list_folders`
- `search_articles`
- `get_article`
- `list_article_highlights`
- `search_highlights`
- `get_highlight`
- `list_questions`
- `get_question`
- `list_concepts`
- `get_concept`
- `list_concept_notes`
- `list_notebook_entries`
- `get_notebook_entry`
- `list_notebook_folders`

Write tools require a token with the `agent-write` scope. Read-only tokens receive `403` from the Noeis API on these calls:

- `create_page`
- `update_page`
- `archive_page`
- `create_edition`
- `configure_edition`
- `file_edition_items`
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
- `create_article`
- `create_folder`
- `file_article`
- `keep_article`
- `place_article`
- `delete_article`
- `delete_folder`
- `nest_folder`
- `set_folder_feed`
- `create_highlight`
- `update_highlight`
- `delete_highlight`
- `write_concept_note`
- `update_concept_note`
- `delete_concept_note`
- `create_notebook_entry`
- `update_notebook_entry`
- `delete_notebook_entry`
- `add_highlight_to_notebook_entry`
- `create_notebook_folder`
- `delete_notebook_folder`
- `create_question`
- `update_question`
- `update_concept`
- `pin_highlight_to_concept`

`delete_article`, `delete_highlight`, `delete_notebook_entry` and
`delete_concept_note` are the tools with no undo. Each says so in its description and each expects the reader to have
been asked first. `delete_folder` and `delete_notebook_folder` are not among them:
a Library folder must be empty before it will go, and a Notebook folder unfiles
its notes rather than taking them with it.

## Releasing

Two packages, published in order, because the CLI depends on this one:

```bash
cd packages/wiki-mcp && npm publish --access public
cd ../cli            && npm publish --access public
```

Bump both versions first, and bump the CLI's `@noeis/wiki-mcp` range to match
the version being published. That range is the thing to watch: it sat at
`^0.1.2` while this package moved to 0.3.0, and a caret on a `0.x` version pins
the minor — so the CLI could never install what had been written, and every
agent connected through it kept the tools as they stood at 0.1.2.

Verify the artifact rather than the working tree, since `files` decides what
actually ships:

```bash
npm pack --pack-destination /tmp
cd $(mktemp -d) && npm init -y && npm install /tmp/noeis-wiki-mcp-<version>.tgz
node -e "import('@noeis/wiki-mcp').then(m => console.log(m.toolDefinitions.length, 'tools'))"
```

## Prompt

- `wiki_schema`: fetches the current Noeis wiki schema markdown and returns it as prompt context.
