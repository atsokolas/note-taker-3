# Repo Wiki Onboarding Review — `atsokolas/note-taker-3-1`

Reviewed the live-generated wiki for `atsokolas/note-taker-3` (production QA reports from 2026-07-05), the generation pipeline (`/api/wiki/pages/from-github`, `githubRepoWatcherService`, `wikiMaintenanceService`), and the in-repo quickstart extractor (`wikiRepoQuickstart.js`).

---

## Verdict on the current generated page

The pipeline **works mechanically** (page created, GitHub watch armed, 12 source events attached, 531+ words synthesized) but **fails as developer onboarding**. A new engineer would clone the wrong mental model and still not know how to run the repo.

### Scorecard

| Criterion | Pass? | Evidence |
|-----------|-------|----------|
| How to run the repo | **No** | Generated text describes a "React-Webpack SPA" with "local storage" and a `src/` layout. Actual stack: `note-taker-ui/` (port 3000) + `server/` (port 5500), MongoDB, `npm start` at root. No run/test commands surfaced. |
| Architecture map | **No** | Missing monorepo split (`note-taker-ui/`, `server/`, `packages/wiki-mcp/`). No API/UI boundary, no key routes (`/wiki`, `/think`, `/library`). |
| Key files | **Partial** | README + random `docs/*.md` specs ingested; `AGENTS.md`, `package.json` scripts, and entrypoints not foregrounded. |
| Current vs stale | **No** | Hallucinated "provenance-aware wiki," "Debug Fixture literature," "published to npm," "comprehensive CI" — none supported by attached evidence. Roadmap specs (`docs/agent-next-leap-*.md`, growth briefs) treated as product truth. |
| Obvious next action | **No** | Ends in abstract purpose prose. No clone → install → run path. `wikiRepoQuickstart.js` exists but is **not rendered** in the read view. |

**Representative bad excerpt** (live verification, 2026-07-05):

> *"Packaged as an npm module… experimental platform for source-provenance practices, a theme highlighted in the Debug Fixture literature… comprehensive test suite and continuous-integration pipeline… provenance-aware documentation layer…"*

Your own QA script already flags these as unsupported boilerplate (`verify_repo_wiki_live.js` → `UNSUPPORTED_REPO_PATTERNS`; `wikiMaintenanceService.js` → `GITHUB_REPO_UNSUPPORTED_PATTERNS`).

---

## Root causes (why it reads wrong)

1. **Source selection bias** — Watcher ingests up to 12 paths; `docs/` ranks above code. For this repo, that pulls dated specs and growth logs instead of `package.json`, `AGENTS.md`, and `server/server.js`.
2. **Library contamination** — Unrelated Library fixtures ("Debug Fixture") leaked into synthesis before repo-specific rules tightened (`wikiMaintenanceService.claim.test.js` documents the fix; output predates or bypasses it).
3. **Generic LLM prior** — Model fills gaps with "typical Node SPA" narrative when evidence is thin.
4. **Quickstart not shipped** — `extractRepoDeveloperQuickstart()` is tested but never wired into `WikiPageReadView.jsx`.
5. **No doc-class labeling** — Specs, roadmaps, and runbooks are ingested with equal weight; nothing marks `docs/noeis-*-spec-*.md` as *planned*, not *shipped*.

---

## Ideal section outline (generated repo wiki)

Ordered for a developer landing cold:

```
1. At-a-glance (3 sentences)
   - What it is, who it's for, primary deploy URLs

2. Developer quickstart  ← pinned UI block (see UX below)
   - Prerequisites (Node, MongoDB, optional Docker/Qdrant)
   - Run / Test / Deploy commands (copy-paste)
   - Key paths (6 max)

3. Repository map
   - Directory table: path → responsibility
   - Runtime diagram: UI ↔ API ↔ DB ↔ ai_service

4. How to work here
   - Branch/deploy model (Vercel + Render from `main`)
   - QA entrypoints (`npm run wiki:qa`, seed scripts)
   - Where agent/human docs live (`AGENTS.md`, `docs/`)

5. Product surfaces (routes)
   - `/wiki`, `/think`, `/library`, `/connections` — one line each

6. Architecture & data flow
   - Auth, wiki maintenance loop, import connectors
   - Link to deeper pages (wiki graph), not inline walls of text

7. Configuration
   - Required env vars (grouped: local / production)
   - External services (MongoDB, Qdrant, AI service)

8. Current state vs roadmap  ← explicit separation
   - Shipped: bullet list with citation to README/CHANGELOG/code
   - Planned: bullet list tagged [Spec · date] — not mixed into "Current State"

9. Open questions / risks
   - Unknowns, failing tests, env gaps

10. Source receipts
    - GitHub watch status, head SHA, last maintained, doc manifest
```

**Project page contract** already aligns (`wikiPageStructureService.js`: Purpose → Current State → Key Decisions → Risks → Next Moves). Extend maintenance prompts to **require** a `Developer quickstart` subsection under Current State with labeled Run/Test/Deploy lines.

---

## Bad / stale phrases to avoid

Block at generation **and** quality-gate (you already have half of this):

| Category | Phrases to reject |
|----------|-------------------|
| Hallucinated distribution | "published to npm", "npm package metadata confirms", "packaged as an npm module" |
| Hallucinated quality | "fully tested", "comprehensive test suite", "continuous integration" (unless CI workflow file cited) |
| Product meta-fiction | "provenance-aware wiki", "source-provenance practices", "Debug Fixture" |
| Wrong stack | "local storage" persistence, lone `src/` React app, "React-Webpack" without evidence |
| Library framing | "Library highlights", "embedding highlights directly from the Library" |
| Scaffold leakage | "Repository sources are being attached", "Noeis will build this project wiki", "next maintenance pass should replace" |
| Roadmap as shipped | "will have grown", "scheduler confirmed" (from specs), "growth loop shipped" |
| Generic filler | "modern JavaScript SPA", "production-ready example", "target audience: front-end developers" |
| Doc-dump framing | "contributes evidence for this page", "strongest current signals", "Summary:" bullets |

**Doc-type prefixes to down-rank or label:** `*-spec-*.md`, `*-roadmap-*.md`, `docs/growth/daily/*`, `docs/superpowers/plans/*`, `*-investigation-*.md`.

---

## 5 acceptance checks (generated repo wiki)

1. **TTHW ≤ 5 minutes** — A developer who has never seen the repo can copy-paste Run + Test from the wiki and get a healthy local stack (or a clear, cited explanation of what's missing).

2. **Architecture fidelity** — Top-level directories in the wiki match the repo tree within one maintenance cycle; no invented `src/` monolith unless `src/` exists at root.

3. **Claim-evidence alignment** — Every factual claim in Purpose/Current State cites a repository source (README, `package.json`, workflow YAML, or code path). Zero unsupported patterns from `GITHUB_REPO_UNSUPPORTED_PATTERNS`.

4. **Roadmap quarantine** — Content from `*-spec-*` / `*-plan-*` files appears only under a **Planned / Spec** section, never under Current State or Developer quickstart.

5. **Next action obvious** — Above the fold: one primary CTA ("Run locally" with `npm start` + link to env setup) and secondary ("Open key file" → `AGENTS.md` or main entrypoint). GitHub watch receipt shows head SHA and last maintained date.

---

## UX: compact Developer quickstart block

`wikiRepoQuickstart.js` is the right foundation — wire it into `WikiPageReadView` for `isRepoDossierPage(page)` pages.

### Proposed compact layout

```
┌─ Developer quickstart ────────────────────────────────┐
│  atsokolas/note-taker-3 · main @ ac5ffce            │
├─────────────────────────────────────────────────────┤
│  Run    [npm start]                          [copy] │
│  Test   [CI=1 npm run wiki:qa]               [copy] │
│  Deploy Frontend → noeis.io (Vercel)                │
│         API → note-taker-3-unrg.onrender.com        │
├─────────────────────────────────────────────────────┤
│  Key paths                                          │
│  note-taker-ui/  server/  scripts/  packages/       │
├─────────────────────────────────────────────────────┤
│  [Open AGENTS.md]  [View on GitHub]  [Re-sync repo] │
└─────────────────────────────────────────────────────┘
```

### UX rules

| Rule | Rationale |
|------|-----------|
| **Show only when `extractRepoDeveloperQuickstart()` returns data** | Avoid empty chrome on scaffold pages |
| **Scaffold state** → show skeleton + "Syncing README & package.json…" + disable copy | Matches `wikiRepoQuickstart.test.js` null case |
| **Monospace + one-click copy** per command | Onboarding is copy-paste, not reading |
| **Deploy split** frontend / API | Matches `AGENTS.md` and actual split deploy |
| **Key paths as links** | `github.com/.../tree/main/note-taker-ui` |
| **Receipt line** under title | Reuse `formatGitHubRepoWatchReceipt()` — builds trust |
| **Collapse on mobile** | Run + Test visible; paths behind "More" |
| **Maintenance must emit labeled section** | Prompt should require `Developer quickstart` with `Run:`, `Test:`, `Deploy:`, `Key paths:` so heuristics + metadata both work |
| **Prefer metadata infobox** | When maintenance writes `page.metadata.runCommand` etc., UI skips regex guessing |

### Generation-side pairing

Force the maintenance prompt (`formatGitHubRepoPromptBlock`) to add:

> *"Include a `Developer quickstart` subsection with exactly: Run, Test, Deploy (frontend + API if present), Key paths (max 6). Use only evidence from README, package.json, AGENTS.md, and workflow files."*

Then `extractRepoDeveloperQuickstart()` becomes reliable instead of regex archaeology.

---

## Priority fixes (ordered)

1. **Re-rank GitHub evidence** — Boost `package.json`, `AGENTS.md`, `server/server.js`, `note-taker-ui/package.json`; demote `docs/noeis-*-spec-*` and `docs/growth/*`.
2. **Wire quickstart block** — `WikiPageReadView` + styles; gate on `hasRepoDeveloperQuickstart(page)`.
3. **Enforce quality gate on publish** — Fail maintenance output that triggers `findUnsupportedGitHubRepoClaims` before saving.
4. **Doc-type tags in source events** — `metadata.docClass: 'spec' | 'runbook' | 'readme'` so synthesis can segregate roadmap.
5. **Regenerate note-taker-3-1 wiki** — After above, re-run `verify_repo_wiki_live.js` against `atsokolas/note-taker-3-1` and assert all five acceptance checks.

---

## Summary

The repo wiki feature is a strong **skeleton** (atomic create, watch, maintenance, anti-hallucination tests, quickstart extractor). It is not yet a **developer onboarding artifact** until the generated body matches the repo's actual run path and separates shipped code from dated specs in `docs/`.