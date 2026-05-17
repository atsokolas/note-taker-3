# @noeis/cli

Command-line client for scripting a Noeis wiki without an MCP-speaking agent.

## Install

```bash
npm i -g @noeis/cli
```

## Auth

Create a Connected agents token in Noeis Settings, then run:

```bash
noeis login --token ntk_at_...
```

For local/self-hosted API targets:

```bash
noeis login --token ntk_at_... --api-url http://localhost:5500
```

You can also skip stored config and use environment variables:

```bash
NOEIS_TOKEN=ntk_at_... NOEIS_API_URL=https://api.noeis.io noeis pages list
```

## Commands

```bash
noeis pages list
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
