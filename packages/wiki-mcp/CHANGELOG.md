# Changelog

Releases of `@noeis/wiki-mcp` on npm. The hosted endpoint at `<api>/mcp` runs
the source in this folder and updates when the API redeploys; this file tracks
what reaches `noeis mcp` and `noeis-wiki-mcp` through npm.

## 0.5.2 (unreleased)

### Added

- `brief`, listed with the core tools: where the reader stands, in one call at
  the start of a session, on a topic or none, pencil kept apart. It opens with
  `handedToYou`: what the reader handed off before stepping away.
- `take_handoff`, `finish_handoff` and `hand_off`, in core: take what the reader
  handed you with the brief on it, finish with what you did, what is open and
  what you would do next, and hand work on to the next agent.
- `recall` finds the reader's open questions, and the reading that bears on
  their own notes and views (`bearsOn`).
- Instructions tell an agent to start with `brief` and to save every page it
  reads with `create_article`.

## 0.5.1 (2026-11-15)

### Added

- The server sends `instructions` on connecting: recall before answering,
  quote and link what you use, and never present pencil as the reader's view.
- `recall` and `read` hits carry `pencil` (the agent that wrote them) for
  notes, saved articles and highlights the reader has not inked.
- `create_article` takes `placement: "later"` for the nightstand, and says
  that what an agent saves waits on the reader's "Read by agents" shelf.

## 0.5.0 (2026-11-15)

First publish since 0.4.4 (0.4.5 was numbered in the repo but never published).
Tools: 91, up from 83. Twelve are listed by default.

### Added

- `recall`: one read-only question to everything the reader keeps (saved
  articles, highlights with margin notes, Think notes, concepts, held views,
  wiki pages and Editions), answered by the retrieval the in-app partner uses
  instead of a whole-phrase text match. "What have I written about hiring"
  now finds the reader's own notes.
- `read`: open any `recall` hit in full by its id.
- Toolsets. Only the twelve core tools are listed unless the runtime asks for
  more with `--toolsets=` / `NOEIS_TOOLSETS` (local) or `?toolsets=` (hosted):
  `library`, `think`, `wiki`, `editions`, `work`, `all`. Unlisted tools stay
  callable. The tool list an agent pays for on every turn falls from about
  85,600 characters to about 16,800. Work tools list themselves for a
  connection approved for Work.
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
