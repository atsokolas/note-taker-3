# Noeis Full Product QA Sweep — 2026-06-14 (logged in, production)

Ran the provided QA plan against https://www.noeis.io logged in. Evidence = screenshot/DOM/network per claim; stop-on-error; no fabrication.

## Scope covered
- ✅ Pass 1 (smoke/nav/routes), Pass 2 (global search, theme, settings), Pass 8 (UI/UX spot incl. dark mode), Pass 9 (regression targets).
- ⛔ **Passes 6–7 (OpenClaw CLI + MCP tool execution) NOT RUN** — require the noeis-wiki MCP server + OpenClaw CLI in the tester's runtime; cannot be driven from a browser. Marked BLOCKED, not failed. (Indirect signal from prior sweep: Settings showed active OpenClaw tokens in real use.)
- 🚫 No destructive actions (archive/merge/delete), no credential entry.
- Note: the browser session **expired mid-sweep once** (silent logout → all routes redirect to marketing). Possible short token TTL — flagged P3 (NEW-session-ttl); could not quantify.

---

## Executive summary
**Strong build. The two highest-leverage bugs from prior sweeps are now fixed** (pull-in bidirectional write, search-result navigation), the wiki front page + calm Think index shipped and render correctly, settings scroll + single-h1 are clean, and auth-gate is solid. **One functional regression persists (AT-357 promote no-op) and one new dark-mode inconsistency I introduced (wiki front page uses cool blue-black, not warm near-black).**

**Ship verdict: SHIP WITH KNOWN ISSUES.** No P0/P1 blockers in tested scope; AT-357 is the one real functional gap and it's contained (a dead handler).

---

## Regression targets (Pass 9)
| ID | Prior | Now | Evidence |
|---|---|---|---|
| **AT-355** Pull-in bidirectional write | ✅ | ✅ PASS | Clicked PULL → 0/0 → **1 out · 1 in**, `POST /api/connections`, "Reference landed / trace saved" |
| **AT-356** Wiki build streams in place | ✅ | ✅ PASS | Built "Loss Aversion" → Words 0 → **842 in place, no reload** (30 paras). Persists on reload. |
| **AT-354** Think rail clip | ❌ | ✅ **FIXED** | Concept workbench rail now `no-clip` (was 561>336/321) |
| **AT-357** Promote-to-wiki | ❌ | ❌ **STILL BROKEN** | Click → **zero network**, no modal, no nav. Unchanged across 3 pushes. |
| Settings scroll | ✅ | ✅ PASS | Reaches "Export your data" bottom, no artifact |
| Global search nav (was P2) | ❌ | ✅ **FIXED** | Enter on result → routes to wiki page |
| Settings 2× h1 (was P3) | ❌ | ✅ **FIXED** | Single h1 |
| MCP auth | — | ⛔ NOT TESTABLE here | needs CLI/MCP runtime |

## Bug table
| ID | Sev | Page | Repro | Expected | Actual |
|---|---|---|---|---|---|
| AT-357 | P1 | /think concept | Click "Promote to wiki page" | POST creates wiki page + navigates | Zero network, no modal, no nav |
| NEW-darkbg | P2 | /wiki (front page) | Toggle dark | Warm near-black `rgb(20,17,13)` like rest of app | Cool blue-black `rgb(13,20,34)` — inconsistent surface token (introduced in AT-394; design-language §5 says never cold blue-black) |
| NEW-failmsg | P3 | /wiki/workspace build | Build a page | Clean "Built / ready" after success | Transient "Failed to build" line lingers in rail after a successful self-retry (stale message not cleared) |
| NEW-session-ttl | P3 | global | Leave session idle | Session persists reasonably | Silent expiry mid-sweep → all routes bounce to marketing; possible short TTL |

## What's confirmed working
- **Routes/nav:** /, /library (253 articles), /think (home + concepts), /wiki (front page), /wiki/workspace, /settings — all load, single h1, no h-scroll, no console errors, session survives refresh (until expiry).
- **Wiki front page (AT-394):** masthead + date, agent lead, Today's page (leads with freshly-built "Loss Aversion" — daily newness working), Recently grown w/ growth notes, Explore index. Live + correct.
- **Calm Think index (AT-329):** orientation lead, In motion, On the shelf — live.
- **Global search:** palette opens, typed results + actions, Enter navigates, Escape closes.
- **Pull-in (AT-355), wiki build in-place (AT-356), rail clip (AT-354):** all good.
- **Dark mode:** correct on wiki article/think/library (warm near-black, no Inter) — EXCEPT the front page (see NEW-darkbg).
- **Settings:** typography/density/theme/accent, connected agents (tokens prefix-only, no raw leak), export, full scroll.
- **Auth gate:** logged-out → all protected routes redirect to marketing, no data leak.

## UI/UX table
| Page | Issue | Sev | Fix |
|---|---|---|---|
| /wiki front page | Dark bg cool blue-black, not warm near-black | P2 | Repoint front-page `--canvas` to the shared warm-dark token (`rgb(20,17,13)`) |
| /wiki/workspace | Stale "Failed to build" rail line after successful retry | P3 | Clear failure message on successful retry |
| global | Possible short session TTL | P3 | Confirm token lifetime / refresh |

## MCP / agent table
| Area | Result | Notes |
|---|---|---|
| noeis-wiki MCP tools (Pass 7) | ⛔ NOT TESTED | Needs MCP server in tester runtime |
| OpenClaw connect/list (Pass 6) | ⛔ NOT TESTED | Needs OpenClaw CLI |
| Connected-agents UI | ✅ (prior sweep) | tokens prefix-only, no raw leak |

## Final verdict: **SHIP WITH KNOWN ISSUES**
Fix AT-357 (promote) and NEW-darkbg (front-page dark token, mine) before calling it clean. MCP/OpenClaw passes need a CLI-equipped tester to close.
