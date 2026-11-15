# Changelog

Releases of `@noeis/noeis-cli` on npm.

## 0.1.13 (2026-11-15)

### Added

- `noeis search`, `noeis read`, `noeis save` and `noeis note`: recall, open,
  save a link or text to the Library (or the nightstand with `--later`), and
  write a note in Think, from any shell or agent that runs commands.
  `search` marks a hit an agent wrote, and the reader hasn't inked, as in pencil.
- `noeis connect claude-desktop`, `cursor` and `vscode`, written with absolute
  paths because desktop apps don't see the shell's PATH.

## 0.1.12 (2026-11-15)

### Added

- `noeis connect muse` (Muse Code) and `noeis connect grok` (Grok Build).

### Fixed

- `noeis connect claude-code` registers the server with `claude mcp add-json
  --scope user`; it used to write a file Claude Code never reads.

### Changed

- `noeis mcp --toolsets=wiki,library` passes the toolsets through to the MCP
  server, which lists only its core tools by default.
- Depends on `@noeis/wiki-mcp` `^0.5.0`, so `noeis mcp` serves `recall`, `read`
  and the Work tools. Under `^0.4.3` npm would never install 0.5.0, because a
  caret on a 0.x version stays within that minor.

## 0.1.11

Last version published before this file was started.
