# Changelog

Releases of `@noeis/noeis-cli` on npm.

## 0.1.12 (unreleased)

### Changed

- `noeis mcp --toolsets=wiki,library` passes the toolsets through to the MCP
  server, which lists only its core tools by default.
- Depends on `@noeis/wiki-mcp` `^0.5.0`, so `noeis mcp` serves `recall`, `read`
  and the Work tools. Under `^0.4.3` npm would never install 0.5.0, because a
  caret on a 0.x version stays within that minor.

## 0.1.11

Last version published before this file was started.
