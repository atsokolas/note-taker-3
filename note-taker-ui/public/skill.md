# Noeis agent setup

You are helping a user connect an external agent runtime to Noeis.

## Goal

Connect this machine to Noeis so you can read, retrieve, and write against the user's Noeis workspace with explicit browser approval.

## Fast path

Run:

```bash
npm install -g @noeis/cli
noeis connect openclaw
```

If the user asked for Hermes, run:

```bash
npm install -g @noeis/cli
noeis connect hermes
```

If the user asked for Codex, Claude Code, OpenCode, or a custom runtime, run:

```bash
npm install -g @noeis/cli
noeis connect codex
```

Then open the browser approval URL printed by the CLI, ask the user to approve access, and wait for the CLI to finish writing the local configuration.

## What access means

The connected agent token is scoped to Noeis read and agent-write operations. It can retrieve workspace context, create handoffs, ingest source material, and write proposed or approved changes through Noeis APIs. The user can revoke the token from Noeis settings.

## Useful commands

```bash
noeis pages list
noeis ingest https://example.com/research
noeis ask <pageId> "What changed?"
```

## Local or self-hosted API

Hosted Noeis does not require `NOEIS_API_URL`. For local or self-hosted targets, set:

```bash
export NOEIS_API_URL="http://localhost:5500"
```

Then rerun the relevant `noeis connect ...` command.
