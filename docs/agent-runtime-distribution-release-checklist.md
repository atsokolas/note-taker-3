# Agent runtime distribution release checklist

OpenClaw setup exposed a packaging gap: browser approval works, but the public install path is not live until the npm packages are published.

## Current status

- `@noeis/cli` is not published on npm.
- `@noeis/wiki-mcp` is not published on npm.
- Internal installs should use:

```bash
cd ~/Documents/GitHub/note-taker-3-1
npm install -g ./packages/cli
noeis connect openclaw
```

## Required public release sequence

1. Publish `@noeis/wiki-mcp`.

```bash
cd packages/wiki-mcp
npm publish --access public
npm view @noeis/wiki-mcp version
```

2. Change `packages/cli/package.json` from the internal file dependency:

```json
"@noeis/wiki-mcp": "file:../wiki-mcp"
```

to the published version:

```json
"@noeis/wiki-mcp": "^0.1.0"
```

3. Run `npm install` in `packages/cli`, then publish `@noeis/cli`.

```bash
cd packages/cli
npm install
npm publish --access public
npm view @noeis/cli version
```

4. Verify the public happy path from a clean machine or temp prefix.

```bash
npm install -g @noeis/cli
noeis mcp --help
noeis connect openclaw --no-browser
```

5. Only after the npm checks pass, update public product copy and `skill.md` to use:

```bash
npm install -g @noeis/cli
noeis connect openclaw
```

## Acceptance criteria

- `npm view @noeis/wiki-mcp version` returns a version, not 404.
- `npm view @noeis/cli version` returns a version, not 404.
- `noeis connect <runtime>` writes exactly one token source: `~/.config/noeis/config.json`.
- Generated runtime MCP configs call `noeis mcp`.
- Generated runtime MCP configs do not contain `NOEIS_TOKEN`.
- `noeis mcp --help` works after a global install.
- A post-connect access check confirms read/write Noeis access.
