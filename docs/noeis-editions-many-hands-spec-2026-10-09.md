# Editions: many hands, one paper

Spec · 2026-10-09 · Owner: Athan · Status: ready to build, one PR at a time

All file and line references are to `origin/main` at `0b1a5cbe` ("Let the model stage changes for approval…", #487). Lines drift; find by function name if a number is off.

Design reference: `design-mockups/editions-many-hands/D2-many-hands.html` (the target), `D-shelf.html` and `D-shelf-phone.html` beside it (the single-agent base). Live canvas: https://claude.ai/artifact/7oJroeRdtzQJmySFtw8gmh — the static HTML here is a snapshot of it.

---

## 1. Why

A paper can be kept by several agents (runtimes in `SUPPORTED_RUNTIMES`: `claude-code`, `codex`, `openclaw`, `hermes`, `opencode`, `agent`). Today the paper cannot say so honestly:

1. **Identity is a token label.** `scribe()` (`server/routes/editionRoutes.js:34`) stores `filedBy.label` from the agent token's label, so the reader sees "Filed by Codex Wiki account grounding audit" on every item. The token already has a `runtime`; nothing reads it.
2. **An empty section is ambiguous.** `emptySections()` (`server/services/editionShape.js:260`) reports any section with no items. With one agent that meant "the world was quiet". With several it can also mean "that agent never ran" — the paper's most important signal (printed silence) becomes unreliable.
3. **Corroboration is thrown away.** `addToHeld()` (`editionRoutes.js:41`) does `if (keptUrls.has(item.url)) return;` — a second agent's reading of the same source is silently dropped, regardless of who filed it. Two independent readings of one paper, each with its own boundary, is the most trust-relevant thing a multi-agent paper can show.
4. **No one owns a section.** Profiles (`POST /api/edition-profiles`, `editionRoutes.js:350`) have `sections: [{key, label}]` and no keeper.

## 2. Principles (the strongest objection, and the rule that answers it)

The objection: showing agents turns a paper into a model-brand scoreboard; readers want findings, not vendors. The rule: **an agent appears only where knowing who it was changes how much you trust what you read.** That is exactly three places: who keeps a section, what an empty section means, and when two agents read the same source.

Consequences:

- One maker's mark per section head, not a byline on every item. Item-level provenance stays available (tooltip / source peek), not printed in the reading flow.
- Marks are **shape + initials**, never colour. Colour already means *section*; a second colour system collides with it and fails colour-blind readers.
- Reputation is a receipt of the reader's own behaviour ("you kept 4 of 9 Codex filed"), never a ranking between agents, never an on-time score. AGENTS.md: no badges, streaks or engagement mechanics.
- Silence stays a first-class state. Filler is never the answer.

## 3. Out of scope

- Detecting that two *different* sources disagree. That needs a model judgement and would be a third agent's opinion presented as fact. Only exact same-source collisions (canonical URL) are in scope.
- Ranking, scoring or comparing agents.
- Changing what the agent selects. These PRs change what the paper *records and shows* about filing.

## 4. Build order

Each PR ships its own UI slice and is reviewable alone. Do not start the next until the previous is merged.

| PR | What | Size | Surfacing rule applies |
|---|---|---|---|
| 1 | Agent identity: runtime, display name, maker's mark | S | no |
| 2 | Two silences: "looked, nothing met the bar" vs "didn't report" | M | **yes** |
| 3 | Readings: a second agent's reading of a held source | M | **yes** |
| 4 | Section keepers | S | no |
| 5 | The storage-unit layout (shelf grid, section rows, desk strip) | L (may split 5a/5b) | **yes** |

AGENTS.md requires every PR that changes surfacing to state its **eligibility gate**, **quality bar** and **silence fallback**. Those statements are written below; paste them into the PR descriptions.

---

## PR 1 — Agent identity

**Goal:** "Codex Wiki account grounding audit" reads as **Codex** with a square mark; the full label survives as a tooltip.

Server

- Extract `SUPPORTED_RUNTIMES`, `normalizeRuntime`, `runtimeLabel` into `server/services/agentRuntime.js`. They are duplicated today in `server/routes/agentConnectRoutes.js:8–45` and `server/routes/agentTaskLinkRoutes.js:5`. Import from the new module in both (this is the "leave it smaller" part of the PR).
- `scribe()` (`editionRoutes.js:34`): add `runtime: normalizeRuntime(req.agentToken?.runtime)`. A request with no agent token (human) gets `runtime: ''`, not `'agent'`.
- Schema (`server/models/index.js`, `editionItemSchema` / `editionSchema`): add `runtime: { type: String, default: '', trim: true }` to `filedBy` and `writtenBy`. Same on `EditionProfile.configuredBy` (set in `editionRoutes.js:376`).
- Serialization stays backward compatible. Keep `filedBy` / `writtenBy` as label strings; **add** `filedByRuntime` (`serializeItem`, `editionRoutes.js:59`), `writtenByRuntime` (`serializeEdition`, `:78`), and the same on inbox rows (`collectInbox`, `editionShape.js:403`, around `:430`).
- No backfill. Legacy rows are handled by the UI fallback below.

UI

- New `note-taker-ui/src/components/editions/agentMark.js`:
  - `agentOf({ runtime, label })` → `{ key, name, initials, shape, label }`.
  - Map: `claude-code` → Claude / `Cl` / circle · `codex` → Codex / `Cx` / square · `openclaw` → OpenClaw / `OC` / diamond · `hermes` → Hermes / `He` / pill · `opencode` → OpenCode / `Op` / hexagon · `agent` → Agent / initials of label / dashed square.
  - Legacy fallback when `runtime` is empty: match the label case-insensitively (`/claude/`, `/codex/`, `/openclaw/`, `/hermes/`, `/opencode/`); else initials from the label, dashed square.
- New `AgentMark.jsx`: inline mark, `aria-label` = name, `title` = full label. Shapes via CSS only (border-radius, a rotated square for the diamond, `clip-path` for the hexagon). Mark uses `currentColor`; works in light and Midnight themes.
- Replace the printed bylines (each becomes mark + short name, full label in `title`):
  - `components/editions/EditionFinding.jsx:82`
  - `components/editions/EditionPaper.jsx:47`
  - `components/editions/EditionPowerThrough.jsx:33`
  - `components/editions/SourcePeek.jsx:82`
  - `pages/editionModel.js:215` `bylineFor` — dedupe by agent `key`, not by label.
- Public/shared view (`EditionPaper` via `SharedEdition`) shows the short name only; no runtime enum leaks beyond the name.

Tests

- `server/routes/__tests__/editionRoutes.test.js`: filing with a `codex` token stores `filedBy.runtime === 'codex'` and serializes `filedByRuntime`.
- `agentMark.test.js`: every runtime; legacy label fallback; unknown label initials.
- Update snapshots/assertions in `EditionInbox.test.jsx`, `Editions.test.jsx` that assert "Filed by …" text.

Done when: the live Issue 5 of This Week in AI shows **Codex** with a square mark, and hovering shows the full token label.

---

## PR 2 — Two silences

**Goal:** an empty section says which silence it is.

States for a section with no items in an issue:

| state | meaning | how it is known | printed copy (draft) |
|---|---|---|---|
| `checked` | an agent looked and nothing met its bar | a check receipt exists for that section in this issue | "{Agent} looked; nothing met the bar." |
| `unreported` | nobody said anything about this section | no receipt, and the profile was already receiving receipts when the issue opened | "Not reported this issue." |
| `unknown` | legacy — we can't tell | issue predates the profile's first receipt | today's copy: "Nothing filed under {label} in this issue." |

Server

- `editionSchema`: `checks: [{ section: String, note: String (≤ 280), by: { label, agentTokenId, runtime }, at: Date }]`, `_id: false`.
- `EditionProfile`: `receiptsSince: { type: Date, default: null }`. Set once, atomically, on the first accepted check for the profile (`updateOne({ _id, receiptsSince: null }, { $set: { receiptsSince: now } })`).
- `POST /api/editions/file` (`editionRoutes.js:419`):
  - accept `checked: Array<string | { section, note? }>`.
  - validate each `section` against `profile.sections` with the same refusal style as `normalizeItem` (`editionShape.js:171–175`, names the valid keys).
  - `items` becomes optional **when** `checked` is non-empty (today `:430` returns 400 on empty `items`). Still 400 if both are empty.
  - push checks atomically, skipping one that already exists for the same `section` + `by.agentTokenId` (`$push` with a filter on `checks` `$not: { $elemMatch: … }`, or a per-check `updateOne`). Respect the existing concurrency pattern in `appendUniqueItems` (`:295`).
  - response adds `checksAdded`.
- `POST /api/editions` (`:493`, full write): accept the same `checked`; on rewrite, merge with held checks by `section + agentTokenId` (extend `retainHeldItems`' "keep what was earned" logic, `editionShape.js:373`).
- `editionShape.js`: new `sectionSilences({ profile, items, checks, receiptsSince, windowStart, profiles })` → `[{ key, label, state, by: [{label, runtime}] }]` for empty sections only. Keep `emptySections` (other callers).
- `serializeEdition` (`editionRoutes.js:78`): add `silences`. Keep `unfilled` unchanged.
- `projectPublicEdition` (`editionShape.js:314`): include `silences` as `{ label, state, by: [name] }` — editorial, not private. Re-check the public snapshot hash (`hashPublicEdition`) and `scripts/backfill_shared_edition_snapshots.js` expectations.

MCP (`packages/wiki-mcp`)

- `tools/write.js:180` `file_edition_items`: `items` optional, add `checked` (array of section keys or `{section, note}`), refine "at least one of items or checked". Description, add: *"If you looked at a section and nothing met your bar, say so in `checked`. A section you leave silent reads to the reader as 'not reported'."*
- `client.js:953` `fileEditionItems`: pass `checked`.
- `tools/write.js:139` `create_edition`: accept `checked`.
- `packages/wiki-mcp/test/editions.test.js`.

UI

- `EditionReading.jsx:264` (the "Nothing filed under …" branch): render by `silences[].state` with the copy above and the agent mark(s) for `checked`.
- `editionModel.js:146` `gapLine`: prefer `silences`; fall back to `unfilled`.

Surfacing statement (paste into the PR)

- **Eligibility gate:** a check counts only if it comes from an agent-write token, names a section of the issue's profile, and lands in the issue for the current window (same `windowFor` resolution as items).
- **Quality bar:** a check is superseded the moment any item is filed into that section (state becomes filled; the check is kept but not shown). A check never creates an item, a count, or an inbox row.
- **Silence fallback:** issues opened before the profile's `receiptsSince` render `unknown` with today's copy, so shipping this does not retroactively accuse every agent of not reporting.

Tests: shape validation (bad section key refused with valid keys listed); items-optional-when-checked; duplicate check ignored; `sectionSilences` states across `receiptsSince` boundary; item supersedes check; public projection includes silences; MCP schema refine.

---

## PR 3 — Readings

**Goal:** when a different agent files a source already held in this issue, keep its reading beside the first one instead of dropping it.

Server

- `editionItemSchema`: `readings: [{ filedBy: { label, agentTokenId, runtime }, filedAt, finding, boundary, note }]`, `_id: false`, max 3 (enforce with `$slice`).
- `addToHeld()` (`editionRoutes.js:41`): return a third list, `readings`, for incoming items whose canonical URL is held **and** whose `filedBy.agentTokenId` differs from the held item's filer **and** from every existing reading's filer. Same-agent duplicates still drop, as today. If **either** side has an empty `agentTokenId` (human or legacy), drop as today — we can only call two readings independent when we know two hands wrote them.
- Readings are normalized with `normalizeItem` (boundary still required — a reading without "where this stops" is refused like an item).
- `appendUniqueItems()` (`:295`): after pushing new items, push each reading atomically:
  `updateOne({ _id, userId, items: { $elemMatch: { url, 'filedBy.agentTokenId': { $ne: id }, 'readings.filedBy.agentTokenId': { $ne: id } } } }, { $push: { 'items.$.readings': { $each: [reading], $slice: 3 } } })`.
  Readings do **not** count toward `profile.maxItems`.
- `retainHeldItems()` (`editionShape.js:373`): preserve `readings` across a full rewrite by URL.
- Response adds `readingsAdded`; `alreadyHeld` counts only true duplicates.
- `serializeItem`: `readings: [{ filedBy, filedByRuntime, filedAt, finding, boundary, note }]`.
- `projectPublicItem` (`editionShape.js:294`): include readings (filer name, finding, boundary, note). **Decision for Athan — see §7.**
- Inbox: a reading never creates an inbox row.

MCP

- `file_edition_items` description: replace *"an item whose link is already held is skipped rather than duplicated"* with *"if another agent already filed the same link, your item is kept as a second reading beside theirs (your own repeats are skipped). Write your own finding and boundary; do not paraphrase theirs."*

UI

- `EditionFinding.jsx`: when `readings.length`, render the primary reading and each additional one side by side — CSS grid `repeat(auto-fit, minmax(min(260px, 100%), 1fr))`, each column: mark + "{Agent}'s reading", finding, "Where this stops" block. One line above: "Filed independently by two hands." No synthesis, no "they agree/differ" text.
- Section head gets every distinct mark that filed into it this issue (feeds PR 5).

Surfacing statement

- **Eligibility gate:** exact canonical-URL match (`canonicalUrl`, `editionShape.js:128`) within the same issue; different, non-empty `agentTokenId`s.
- **Quality bar:** every reading passes `normalizeItem` (boundary required); max 3 per item; same-agent repeats dropped; readings never add items, counts, or inbox rows.
- **Silence fallback:** an item with no readings renders exactly as today.

Tests: second agent same URL → reading; same agent same URL → dropped; empty token id → dropped; cap at 3; concurrent filers (two simultaneous `file` calls) don't double-push; rewrite preserves readings; public projection.

---

## PR 4 — Section keepers

Server

- `EditionProfile.sections[]`: optional `keeper: { runtime, label }` (`runtime` through `normalizeRuntime`, `label` ≤ 60).
- `POST /api/edition-profiles` (`editionRoutes.js:350`): accept `sections[].keeper`; when sections are omitted, existing keepers persist (same rule as sections today, `:369–373`).
- `serializeProfile` (`:147`) and `serializeEdition().sections` include `keeper`.
- MCP `configure_edition` (`tools/write.js:163`): add optional `keeper` to the section shape; description: "Name which agent keeps each section if more than one agent files into this paper."

UI / model

- `editionModel.js`: `keepersFor(issues, sections)` → per section `{ agent, derived }`. Configured keeper wins. Otherwise the most frequent filer across the run, `derived: true`; ties → no keeper. A derived keeper is always labelled "usually filed by", never "keeps".
- `foreignFilers(issue, keepers)` → per section, filers whose agent ≠ keeper (drives the small second mark on the shelf).

Tests: profile round-trip with keepers; omitted sections keep keepers; derived keeper and tie.

---

## PR 5 — The storage-unit layout

Build design D2. Keep what production already has and works: the publications rail, the issue list, "In this issue", "Back to where you stopped", Power through, Later. AGENTS.md: the PR must say what it replaces — read `EditionShelfNav.jsx` and `EditionReading.jsx` first and decide; the likely candidate is the plain issue list under "ISSUES · 2026", which the shelf's row labels make redundant.

Model (pure, tested)

- `editionModel.shelfGrid(paper)` → `{ sections: [{ key, label, keeper }], rows: [{ issueId, label, current, cells: [{ section, count, state: 'filled'|'checked'|'unreported'|'unknown', foreign: [agent] }] }] }`. Rows oldest → newest, capped by `SHELF_ISSUE_LIMIT` (`editionModel.js:379`).

Components

- `EditionShelfUnit.jsx` — the frame: CSS grid, gap shows the frame colour, a row label column, one column per section. Cells are `<button>`s that open that issue at that section; `aria-label` spells the state ("Issue 5, Infrastructure & systems: looked, nothing met the bar"). Visuals: filled = section colour panel with count; `checked` = X-brace (two `linear-gradient` diagonals); `unreported` = open bay, dashed inset; `unknown` = plain open bay. Current issue: inverted row label + inset ring. Two short legs under the unit (decorative, `aria-hidden`).
- Section rows in the reading view (`EditionReading.jsx`): a coloured label block (section name, count, keeper mark; extra marks for foreign filers) beside the items. Empty sections render the PR 2 states inside a braced/open bay.
- `EditionDesk.jsx` — the desk strip under the masthead, only when ≥ 2 distinct agents filed into the paper's run: per agent → mark, name, sections kept (or "usually files" if derived), when it filed this issue ("Filed Oct 6" / "Looked, filed nothing" / "Not reported"), and **"kept by you: n of m"** across the run (`savedArticleId` counts by filer). No on-time score.
- Editor mark next to the standfirst and "Across the week": `writtenBy`.

Colour and theme

- Section colour by key heuristic, then by profile order: a section key containing `counter` → red; otherwise blue, ochre, red, birch, sage, slate, plum, ink (8 = profile max).
- Light: blue `#2c5a8a`, ochre `#d6a238` (dark text), red `#b4412c`, birch `#e2cfa8` (dark text). Text on panels must meet 4.5:1 (3:1 at ≥ 24px).
- **Midnight (dark) theme exists in production** and the mocks are light-only: define every panel colour, frame and brace as tokens in `styles/theme.css` / `semantic-theme.css` with dark values, and verify contrast in both.
- Fonts: the mocks use Archivo for labels; production uses the Newsreader + system UI pair. Use production's tokens; do not add a font.

Responsive (AGENTS.md QA widths)

- ≥ 1280: shelf beside the publication list; section label block 200px left of items.
- ~1280–1400 (Safari sidebar): same, unit narrows.
- ≤ 430: the unit becomes a horizontally scrolling row of small units (see `design-mockups/editions-many-hands/D-shelf-phone.html`); section label block becomes a full-width strip above its items; touch targets ≥ 44px.
- `prefers-reduced-motion`: no transitions on cells.

Surfacing statement

- **Eligibility gate:** the shelf shows the issues already listed for the paper (`shelfIssuesForPaper`), nothing new is selected.
- **Quality bar:** counts and states come only from stored items, checks and readings; no inference beyond PR 4's labelled "usually filed by".
- **Silence fallback:** a paper with one agent shows no desk strip and no marks on section heads beyond the single keeper; a paper with one issue shows a one-row unit.

Tests: `shelfGrid` across all four states, foreign filers, cap; `EditionShelfUnit` a11y labels; desk strip hidden for a single agent; Editions page renders with the Issue 5 fixture (`design-mockups/editions-many-hands/this-week-in-ai.json`). Browser QA at 1440, 1320, 430 in light and Midnight; screenshots in the PR.

---

## 5. Data reference

`design-mockups/editions-many-hands/this-week-in-ai.json` holds the real Issue 5 of This Week in AI (copied from production on 2026-10-09) and the per-issue section counts for Issues 1–5. Use it for fixtures and QA. Every item in it was filed by one agent token (Codex); multi-agent cases in tests must be constructed.

## 6. Risks

- **Agents won't send `checked` unless told.** PR 2's value depends on the MCP description and on whichever prompts/skills drive the filing agents (e.g. `scripts/create_this_week_in_ai_edition.js`). Update them in the same PR.
- **Late filing reads as failure.** The current Codex job files ~2 days after the window closes (Issue 5: window ended Oct 4, filed Oct 6). `unreported` must not be shown while an issue is still accepting filings; compute it only once the issue is closed (`stateOf`, `editionModel.js:115`) *and* past a grace period (suggest 3 days, constant in one place).
- **Public snapshots.** PR 2 and PR 3 change the public projection; existing share hashes will differ. Confirm the share "update available" flow handles it instead of silently republishing.

## 7. Decisions for Athan (answer before the PR that needs it)

1. PR 3: do second readings appear on publicly shared editions? Recommendation: yes — they are the most editorial thing on the page.
2. PR 2: grace period before a closed issue can show `unreported`. Recommendation: 3 days.
3. PR 5: does the shelf replace the "ISSUES · 2026" list or sit above it? Recommendation: replace.
4. PR 1: rename the existing Codex token label to something human ("Codex · research") in Connections, or rely on the runtime name alone? Recommendation: runtime name in the paper, label only in the tooltip — no rename needed.
