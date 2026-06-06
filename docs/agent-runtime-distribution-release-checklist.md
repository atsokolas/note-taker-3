# Agent runtime distribution release checklist

OpenClaw setup exposed a packaging gap: browser approval worked, but the public install path was not live until the npm packages were published.

## Current status

- `@noeis/wiki-mcp@0.1.1` is published on npm.
- `@noeis/noeis-cli@0.1.2` is published on npm and installs the `noeis` binary.
- `@noeis/cli` was attempted first and npm reports public access/dist-tags, but raw registry lookup still 404s. Do not use it as the user-facing package unless npm support resolves that registry inconsistency.
- Public installs should use:

```bash
npm install -g @noeis/noeis-cli
noeis connect openclaw
```

## Completed release sequence

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
"@noeis/wiki-mcp": "^0.1.1"
```

3. Run `npm install` in `packages/cli`, then publish `@noeis/noeis-cli`.

```bash
cd packages/cli
npm install
npm publish --access public
npm view @noeis/noeis-cli version
```

4. Verify the public happy path from a clean machine or temp prefix.

```bash
npm install -g @noeis/noeis-cli
noeis mcp --help
noeis connect openclaw --no-browser
```

5. After the npm checks pass, update public product copy and `skill.md` to use:

```bash
npm install -g @noeis/noeis-cli
noeis connect openclaw
```

## Acceptance criteria

- `npm view @noeis/wiki-mcp version` returns a version, not 404.
- `npm view @noeis/noeis-cli version` returns a version, not 404.
- `noeis connect <runtime>` writes exactly one token source: `~/.config/noeis/config.json`.
- Generated runtime MCP configs call `noeis mcp`.
- Generated runtime MCP configs do not contain `NOEIS_TOKEN`.
- `noeis mcp --help` works after a global install.
- A post-connect access check confirms read/write Noeis access.
