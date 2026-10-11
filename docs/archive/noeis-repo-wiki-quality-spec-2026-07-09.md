# Spec — Repo wiki quality: evidence-first, not template-first

**For:** Codex
**Author:** Athan + Claude (live audit of the deployed repo-wiki feature, 2026-07-09, real account, test subject `atsokolas/note-taker-3`)
**Context:** The repo-wiki pipeline works mechanically (watcher arms, sources sync, page builds, maintenance runs) — but the output is bland and generic, and the create path pollutes the user's wiki. This spec is grounded in a live dissection of an actual generated page (`6a4d62322dc08f4e66589d1e`, 1,495 words · 45 claims · 7 sources). Root causes are proven, not guessed. The container is good; the content pipeline is the problem.

**Verification rule:** every fix has a live acceptance test on `https://www.noeis.io`. Rebuild the `atsokolas/note-taker-3` wiki and one well-documented external OSS repo after the changes and paste before/after. Do not close from unit tests alone.

---

## The diagnosis (from the live page — do not re-derive)

The generated wiki for `atsokolas/note-taker-3` cites exactly **7 sources**:
```
[1] README.md
[2] package.json
[3] .github/workflows/agent-harness-regression.yml
[4] note-taker-ui/package.json
[5] server/routes/wikiRoutes.js
[6] server/services/wikiMaintenanceService.js
[7] AGENTS.md          ← agent-instructions file ingested as evidence
```
45 claims over 7 thin sources, for a full-stack app with ~40 spec docs in `docs/`, dozens of services, and a complete React UI — none ingested. Consequences observed on the live page:

1. **Generic prose** — the model stretches thin evidence across a mandated section skeleton, so every repo reads the same.
2. **Instruction contamination** — the page quotes AGENTS.md as product truth: *"Developer posture: preserve the Library → Think → Wiki loop first; speed, automation, and repo-watch polish are secondary…"* — internal agent policy narrated as repo documentation.
3. **Gate language leaks into content** — the page summary (and therefore the wiki front page's Today's-Page lead) is the quality-gate's own template phrase: *"is a product-aware developer operating manual for this GitHub repository: understand the user experience first, run the local stack, prove changes with attached commands, then edit the route/service/model/component that owns the behavior."* Zero facts about the repo. This is the single most visible embarrassment.
4. **Duplicate pages** — 7+ identical "Atsokolas/Note-Taker-3 Repo Wiki" pages exist; Explore is flooded with them and Today's Page was hijacked by one.
5. **Title mangling** — `atsokolas/note-taker-3` was title-cased to "Atsokolas/Note-Taker-3 Repo Wiki". Code identifiers must keep their casing.

---

## Fix 1 (P0) — Evidence-first ingestion: feed the writer a real corpus

**Where:** `server/services/githubRepoWatcherService.js` (`selectRepoEvidenceEntries`, `DEFAULT_DOC_PATH_LIMIT`, the scoring regexes ~lines 59–160).

**Changes:**
1. **Raise the evidence budget substantially.** Target **25–50 sources** for a mid-size repo, not 7. Keep a byte budget per blob (existing `blobTextLimit`) but stop starving the count.
2. **Ingest the documentation corpus for real:** all of `README*`, `docs/**/*.{md,mdx,rst,txt}` (drop the current filters that skip most of `docs/`), `CONTRIBUTING`, `ARCHITECTURE*`, ADR dirs, `CHANGELOG*`, release notes (already fetched), plus key config (`package.json` scripts, CI workflows — already present).
3. **Add structural evidence the docs can't provide:** a **code inventory source** generated from the git tree — top-level directory map, route files list, service/model/component file lists with paths (no blob fetch needed; derive from the tree API response already in hand). This lets claims cite real paths ("`server/routes/wikiRoutes.js` owns the wiki API") without fetching every blob.
4. **Prioritize by information value:** architecture/design docs > READMEs > ADRs/CHANGELOG > config > code inventory. Fill the budget in that order.

**Acceptance:** rebuilt `note-taker-3` wiki cites ≥25 sources including ≥5 `docs/` specs and a code-inventory source; the References list shows them. Paste the list.

## Fix 2 (P0) — Blacklist instruction files from evidence

**Never ingest as evidence:** `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, `**/prompts/**`, and similar agent/LLM instruction files. They describe how *agents should behave*, not what the product is. (If desired later, tag them as a distinct `policy` source type excluded from claim support — but v1: exclude entirely.)

**Acceptance:** rebuilt page has no AGENTS.md in references and no "developer posture"-style policy narration in prose.

## Fix 3 (P0) — Kill template-first writing; gate on evidence, not section names

**Where:** the repo quality gate in `server/services/wikiMaintenanceService.js` (~lines 549–575) and the repo draft prompt.

**Changes:**
1. **Drop the mandated nine-section skeleton.** Sections should follow the repo's actual shape (a CLI tool, a library, and a web app should produce *different* pages). The draft prompt should say what a great repo wiki *achieves* (orient a new contributor; map the architecture as it actually is; surface real commands; name real risks) — not dictate headings.
2. **Gate on evidence density instead:** claims-per-source ratio (e.g. ≤4 claims per source), ≥N distinct repo paths mentioned that actually exist in the tree, runnable commands verified against `package.json`/CI (the existing command checks are good — keep them), and **zero gate/template phrases in output** (assert the literal strings "product-aware developer operating manual", "route/service/model/component" do not appear in page text).
3. **The page summary must be repo-specific.** Assert the summary mentions the repo's actual domain (e.g. for note-taker-3: reading/wiki/knowledge workspace), not process language.

**Acceptance:** rebuild `note-taker-3` + one external OSS repo → the two pages have visibly different section structures; neither contains the template phrases; summaries state what each product *is*. Paste both summaries.

## Fix 4 (P0) — Upsert by repo identity; clean up the dupes

**Where:** the repo-wiki create path (`WikiRepoCreateComposer` → its route) + a one-time cleanup.

**Changes:**
1. **Create = upsert keyed on `owner/repo`** (the watcher already has this identity). If a page for that repo exists: re-arm/refresh it and navigate there — never create a second page. Show "Updated existing repo wiki" receipt.
2. **One-time cleanup for the polluted account:** merge/delete the 7+ duplicate "Atsokolas/Note-Taker-3 Repo Wiki" pages — keep the newest (or rebuild fresh post-fix), delete the rest **via the owner-delete path with the user's confirmation in the PR** (list the page ids being removed).
3. **Cap repo-wiki presence on return surfaces:** Today's Page and Explore should never be majority-repo-wiki; exclude repo wikis from Today's Page selection unless they actually changed, and dedupe Explore entries (Explore listing the same title 7× is also a general Explore bug — fix at the surface too).

**Acceptance:** clicking CREATE REPO WIKI twice for the same repo yields one page; Explore shows at most one entry per page; the dupes are gone from the account. Screenshots before/after.

## Fix 5 (P1) — Preserve identifier casing in titles

`atsokolas/note-taker-3` must render as `atsokolas/note-taker-3` (repo slugs, package names, file paths keep their casing everywhere — title normalization skips code identifiers). Suggested title format: **"note-taker-3 — repo wiki"** with the full slug in the dossier panel.
**Acceptance:** rebuilt page title shows the slug uncased; no title-cased identifiers anywhere on the page.

---

## Confirmed working — do NOT rework (verified live 2026-07-09)
- Watcher mechanics: arms correctly, tracks head SHA, "last checked" receipt on the page (`GitHub watcher armed for atsokolas/note-taker-3 · head e6acfc3`). ✅
- Sources pin to path + commit SHA — the receipts model for code is right. ✅
- Developer-quickstart command extraction (`npm run start`, `npm run wiki:qa`) with root-harness preference. ✅
- The page container: contents rail, dossier panel (Kind/Sources/Claims/Last reviewed), private/share controls all render properly. ✅
- **No regressions elsewhere:** Margin of Safety renders clean (0 markup leaks), morning paper fast + complete lead, Library intact (270 sources, no repo contamination). The damage is data pollution (dupes), not code. ✅

## Priority
1. Fix 3 (gate/template leak) + Fix 2 (AGENTS.md) — they cause the visible embarrassment and are small.
2. Fix 1 (evidence budget) — the substance fix; without it the pages stay thin no matter the prompt.
3. Fix 4 (upsert + cleanup) — stops the pollution and repairs the account.
4. Fix 5 (casing) with any of the above.

## The line
A repo wiki earns its keep the same way every Noeis page does: **real claims pinned to real evidence.** Right now the pipeline hands the writer 7 files and a rubric, and gets back a rubric. Hand it the repo — docs, structure, releases — and gate on evidence instead of headings, and the same writer that produces your Margin of Safety page will produce repo wikis worth sharing. That's the bar: would a new contributor to `note-taker-3` actually orient faster with this page than with the README? Today, no. After this spec, it must be yes.
</content>
