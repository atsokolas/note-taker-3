# @noeis/noeis-cli

Command-line client for Noeis: connect an agent, or work in your library from a shell.

## Install

```bash
npm i -g @noeis/noeis-cli
```

This installs the `noeis` command.

## Work from a shell

```bash
noeis brief "hiring"                               # where you stand: views, notes, marks, questions, pencil
noeis search "what have I written about hiring"   # your notes, highlights, views and pages
noeis read <id>                                    # the whole of any hit
noeis save https://example.com/essay               # into your Library (--later: the nightstand)
some-command | noeis save - --title "Transcript"   # text from standard input
noeis note "Hiring is a bet on slope."              # a note in Think
noeis tonight                                      # what fits tonight from your nightstand
noeis fortune                                      # one passage of your own, at random
```

Put `noeis fortune` at the end of your shell's rc file and every new terminal
opens on something you once thought worth keeping.

`save` and `note` need a read-write connection.

## Your Noeis as a folder

```bash
noeis sync              # ~/Noeis, once
noeis sync ~/Noeis --watch   # and every minute after
```

`Think/` holds your notes: edit one and it goes back, add a file for a new
note. `Library/` holds what you saved and marked: add a file to save something
there; the rest is kept by Noeis. `Wiki/` is read-only. `AGENTS.md` tells any
agent that opens the folder how it works. What the folder writes lands in
pencil until you ink it. A note changed in both places keeps Noeis's version
and adds yours beside it; nothing in Noeis is deleted from the folder.

Connected read-write, `noeis connect claude-code` also adds a hook so every
page Claude Code fetches lands on your "Read by agents" shelf.

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

Supported runtime names: `claude-code`, `claude-desktop`, `codex`, `cursor`,
`grok` (Grok Build), `hermes`, `muse` (Muse Code), `openclaw`, `opencode` and
`vscode`. Claude Code is registered through `claude mcp add-json --scope user`;
the others are written where each reads its servers (Claude Desktop's
`claude_desktop_config.json`, `~/.cursor/mcp.json`, VS Code's user `mcp.json`,
`~/.config/muse/settings.json`, `~/.grok/config.toml`, ...). Desktop apps don't
see your shell's PATH, so their config names node and this CLI by absolute path;
run `noeis connect` again after moving either.

Grok Bot and the Muse app run in the cloud and take a remote server, not a local
one: add the hosted endpoint `https://note-taker-3-unrg.onrender.com/mcp` as a
custom connector with the header `Authorization: Bearer <a Noeis agent token>`.

Use `--scope read-write` only when the human explicitly chose the broader
`read` + `agent-write` grant. Unknown scopes are rejected instead of widened or
silently replaced.

Add `--work` to also let the agent into Work, the private work notebook, with
the same read or read-write access. No other scope includes it.

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
