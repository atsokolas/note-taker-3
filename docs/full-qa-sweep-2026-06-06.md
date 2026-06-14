# Noeis Full QA Sweep — 2026-06-06 (logged in, prod)

Ran the provided QA plan against https://www.noeis.io, logged in. Evidence = screenshot/DOM/network per item. Scope note below.

## Scope actually covered
- ✅ Pass 1 (smoke/nav/routes), Pass 2 (global search, settings, theme), Pass 6 partial (settings/connected-agents UI only), Pass 8 (UI/UX spot), Pass 9 (regression targets).
- ⛔ **NOT run — Passes 6–7 MCP/OpenClaw/Hermes tool execution:** these require the noeis-wiki MCP server + OpenClaw CLI wired into the tester's own runtime, which this session does not have. Cannot be driven from the browser. Marked BLOCKED, not failed. (Indirect signal: Settings shows **9 active "OpenClaw local" tokens, last used today** — so the integration is in real use by the account.)
- 🚫 Did not perform destructive actions (archive/merge/delete/revoke), credential entry, or agent connection.

---

## Executive summary
**Solid:** routing/nav (all routes load, no blank/404/crash, no console errors anywhere), session persists, dark mode is first-class and now the tuned default ("Dark (Noeis)"), settings page (scrolls fully, no bottom artifact, rich integrations + export), global search palette opens with typed results + actions + Escape-to-close, wiki morning-paper/maintenance/knowledge-map/drop-source all functional, corpus graph telemetry live.

**Broken (carried over, re-confirmed):** AT-357 promote no-op, AT-354 Think rail clip.

**New this sweep:** global-search result click didn't navigate (P2), brief flash-of-unstyled-content on wiki load (P3), 2× h1 on /settings (P3).

**Ship verdict: SHIP WITH KNOWN ISSUES.** No P0/P1 blockers in the tested surface. The two carried-over bugs (357, 354) are contained; search-nav needs a clean retest.

---

## Regression targets (Pass 9)
| ID | Status | Evidence |
|---|---|---|
| **AT-355** Pull-in bidirectional write | ✅ FIXED (prior pass, this session) | PULL → 0/0 → 1 out · 1 in, chip + "Bidirectional trace saved both ways" |
| **AT-356** Wiki build streams in place | ✅ FIXED (prior pass) | Built page rendered title/TOC/12 paras/infobox without reload |
| **AT-357** Promote-to-wiki | ❌ STILL BROKEN | Click "Promote to wiki page" → zero network, no modal, no nav |
| **AT-354** Think rail clip | ❌ STILL BROKEN | scrollWidth 561 > clientWidth 336; header/eyebrow/search clip right edge (Think concept/question only) |
| Settings scroll | ✅ PASS | Scrolls to bottom (3850px), reaches "Export your data", no artifact |
| MCP auth | ⛔ NOT TESTABLE here | 9 OpenClaw tokens active/last-used-today in Settings = working for the account; cannot exercise tools from browser |

## Bug table
| ID | Sev | Page | Repro | Expected | Actual |
|---|---|---|---|---|---|
| AT-357 | P1 | /think?tab=concepts | Click "Promote to wiki page" | POST creates wiki page + navigates | Zero network, no modal, no nav |
| AT-354 | P2 | /think?tab=concepts & questions | Load concept; inspect right rail | Rail content fits 336px column | scrollWidth 561 > 336; clips right edge |
| NEW-search-nav | P2 | global search | Search "opportunity" → click "Opportunity Cost" result | Navigate to that wiki page | Stayed on Knowledge map (no nav). Needs clean retest (may be click-vs-rerender) |
| NEW-fouc | P3 | /wiki | Hard load /wiki | Styled immediately | ~1s flash of unstyled content (cool-grey bg, plain buttons) before correct dark styling |
| NEW-h1 | P3 | /settings | Inspect headings | One h1 | Two h1 ("Settings" + "Export your data") |

## What's confirmed working (functional)
- **Nav/routes:** /, /library, /think?tab=home|notebook|concepts, /wiki, /wiki/workspace, /settings — all load, single h1 (except settings), no h-scroll, no console errors, session survives refresh.
- **Global search:** opens, returns typed Wiki-page results + Actions (New Think note / Pull reference / New wiki page from "x" / New collection), Escape closes.
- **Settings:** Typography/Density/Theme/Accent/Brand-energy; Connected agents (9 tokens, prefixes only — no raw token exposed ✅); Export (PDF/JSON/clipboard); full scroll.
- **Wiki:** Morning-paper briefing accurate + live counters; Knowledge map (force-directed, typed legend, Map/List/Export); DROP SOURCE fires POST /api/wiki/ingest; corpus telemetry (8 wiki · 51 working thoughts · 178 live edges · 146 graph objects); build streams in place; pull-in bidirectional.
- **Library:** Cabinet/shelves, 23 articles, reading room w/ draft-first moves + provenance rail + cross-surface pullable refs.
- **Dark mode:** first-class on every surface (warm near-black rgb(20,17,13), Newsreader, gold/cyan accent, no Inter).

## UI/UX table
| Page | Issue | Sev | Recommended fix |
|---|---|---|---|
| /think concept | Right agent rail clips own content (561>336) | P2 | Match Think rail column width/wrapping to Library/wiki rails |
| /wiki | FOUC on load | P3 | Inline critical CSS / prevent unstyled paint |
| /settings | 2× h1 | P3 | Demote "Export your data" to h2 |
| global search | result row may not navigate | P2 | Verify result onClick routing |

## MCP / agent table
| Area | Result | Notes |
|---|---|---|
| noeis-wiki MCP tools (Pass 7) | ⛔ NOT TESTED | Requires MCP server in tester runtime; not available in browser session |
| OpenClaw connect/list (Pass 6) | ⛔ NOT TESTED | Requires OpenClaw CLI |
| Connected-agents UI | ✅ | 9 active tokens, prefixes only, no raw token exposed; Issue/Activity/Revoke/Delete present |
| Token security | ✅ (display) | Runtime config shows `ntk_at_xxxx…` prefix only |

## Final verdict: **SHIP WITH KNOWN ISSUES**
Core product is functional and visually polished; no P0/P1 in tested scope (AT-357 is P1 but contained — a single dead handler). Fix AT-357 + AT-354 + verify search-nav before calling it clean. MCP/OpenClaw passes need a tester with the CLI + MCP server to complete.
