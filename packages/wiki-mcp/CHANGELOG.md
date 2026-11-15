# Changelog

Releases of `@noeis/wiki-mcp` on npm. The hosted endpoint at `<api>/mcp` runs
the source in this folder and updates when the API redeploys; this file tracks
what reaches `noeis mcp` and `noeis-wiki-mcp` through npm.

## 0.5.0 (2026-11-13)

First publish since 0.4.4 (0.4.5 was numbered in the repo but never published).
Tools: 90, up from 83.

### Added

- `search_noeis`: one read-only call that searches the Wiki, the Library
  (highlights and saved articles) and Editions together, so an agent can find
  where something lives before it opens it.
- Work for approved agents: `list_work`, `get_work_note`, `create_work_note`,
  `update_work_note`, `create_work_folder`, `update_work_folder`, for a
  connection approved with `--work`.
- `file_edition_items` takes the fuller Edition shape: per item `plain`, `why`,
  `passage` (checked word for word), `sourceKind`, `confidence` and up to three
  `figures`; per edition `headline`, `checked` (sections looked at where nothing
  met the bar) and `followUps` on the last issue's watch list.

### Changed

- `file_edition_items` is no longer annotated as non-destructive: filing again
  for the same window can overwrite a headline or follow-up answer.
- Tool input validation is bounded (at most 10,000 elements per call) before
  untrusted arrays and records are expanded.
- The server reports the package version in its MCP handshake (it said 0.3.0
  in every release since 0.3.0).
- `@modelcontextprotocol/sdk` raised to `^1.32.1`.

## 0.4.4 (2026-10-09)

Last version published before this file was started.
