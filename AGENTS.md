## Learned User Preferences

- UI should stay clean and calm while feeling smooth and modern: magnetic rails/bars with subtle cursor-follow, short eased transitions, and glass only on floating controls; honor `prefers-reduced-motion` and fine-pointer-only motion.
- Primary surfaces to design and test together: Home, Library, individual articles, Notebook, and Concept (Think hub).
- On multi-step UI, spec-stage, or feature work, report clear next steps after each iteration (and the stage deliverable — the standout item built that stage) rather than only at the end.
- On spec-driven tasks, honor strict scope boundaries in the spec and avoid touching unrelated surfaces unless explicitly required.
- For visual/responsive QA on primary surfaces, test desktop, Safari-sidebar/tablet widths around 1280–1400px, and mobile (~430px width), not desktop only.
- When QA finds gaps, fix through the stack (API persistence + UI), verify in the browser when relevant, and document in `docs/` test plans — not shell-only wiring.
- For investigation or inventory tasks, stay investigation-only: no behavior changes unless explicitly asked; deliver docs (inventories, extraction plans) rather than opportunistic refactors.
- For large refactors, prefer inventory → no-edit extraction plan → targeted tests for fallback branches before extracting components.
- For Think index layouts (home, concepts, questions, notebook), prefer shared `CalmIndexView`, `ThinkShelfRail`, and `calmIndexModel.js` over duplicating layout variants inline in ThinkMode.jsx.
- When changing Think index layouts, preserve ThoughtPartnerPanel mounting and queued-prompt coverage in `ThinkMode.templates.test.jsx`.
- Wire thinking-partner actions (pull-in references, wiki promote, streaming wiki build, agent retrieval) to real backend behavior that survives reload; sequence bidirectional graph edges before flows that depend on them.
- Default to frontend-only changes unless the task explicitly requires backend work; wire new affordances to existing APIs, local state, or `SystemStatusContext` until backend receipt slices land.

## Learned Workspace Facts

- React UI lives in `note-taker-ui/` (dev server port 3000); API via `npm start` at repo root (port 5500); wiki frontend QA via `npm run wiki:qa` at repo root.
- Production: frontend at https://www.noeis.io (Vercel); API at https://note-taker-3-unrg.onrender.com (Render, auto-deploys from `main`).
- Think hub: `/think?tab=home|notebook|concepts|questions`; Library: `/library`; articles open with `articleId` on library or `/articles/:id`.
- Wiki hub: `/wiki`, `/wiki/home`, `/wiki/workspace?page=…` (compact list via `?view=list` with WikiFacetRail facets + search); legacy `/wiki/:id` redirects to workspace.
- Library default article list excludes suppressed items (`hiddenFromHome`, `debugOnly`, `archived`); append `?showSuppressed=1` to inspect the full corpus during QA.
- Connections: use `/connections` as the single hub (`/integrations` same page; `/data-integrations` redirects with query/hash preserved for OAuth returns like `?source=readwise#sources`).
- Public share routes (no auth chrome): `/share/wiki/:idOrSlug`, `/share/questions/:slug` — editorial content only; no library/highlights leak. Think does not publish notes, Volumes or concepts: they settle into Wiki (`POST /api/notebook|concepts/:id/settle`) and are shared from the wiki page; old `/share/notebooks|volumes|concepts/:slug` links redirect to the shared settled page or say one calm line.
- ThinkMode `legacyShell=0` only forces ThreePaneLayout for home, notebook, and concepts index; questions always use the editorial shell.
- Editorial workbench styling uses `noeis-editorial` and shared tokens in `note-taker-ui/src/styles/theme.css` (plus `idea-workbench.css` / `stitch-editorial.css` where applicable).
- Local editor/browser QA: run `node scripts/seed_editor_qa.js` for the `qa_editor_seed` user; run `node scripts/seed_wiki_qa.js` for wiki/graph QA (credentials live in seed scripts — never store passwords in docs or AGENTS.md).
- Prioritized open work, return-loop roadmap, feedback inventories, and QA write-ups live in `docs/` (e.g. `noeis-return-loop-roadmap-spec-2026-06-25.md`, `noeis-feedback-status-inventory-2026-06-27.md`, `noeis-details-polish-spec-2026-06-23.md`).
- Chapter 0.5 return-loop UI uses `SystemStatusContext` (background work, latest receipt, recoverable failure) with a compact TopBar `SystemStatus` affordance and session-local recent-activity drawer — not a toast stack.
- Any PR that adds or modifies a surfacing/selection algorithm (what the paper leads with, which claim is served for check-in, what appears in review queues, retrieval cards) must state in its description: the eligibility gate (what content qualifies), the quality bar (what gets suppressed), and the silence fallback (what renders when nothing qualifies — filler is never the answer). See docs/noeis-taste-pass-spec-2026-08-29.md.
- Code craft is part of the product: prefer elegant, minimal implementations over additive ones. Every PR should leave the codebase smaller or clearer where it touches — delete dead branches, redundant state, duplicated helpers, and superseded components rather than layering around them. If a change adds a file, say what it replaces.
- Build for delight, not just correctness: each user-facing change should carry one moment of recognition, consequence, mastery, or closure (a truthful receipt, a memory of what they already hold, a passage that opens where it came from). Magic is material and honest — never badges, streak-fire, confetti, or engagement traps. Honor `prefers-reduced-motion`; silence and stillness are legitimate delight states.

## Testing and agent efficiency

- Start with affected test files and directly related integration checks. Preview with `npm run test:server -- <path-fragment> --list` or `npm run test:ui -- --runTestsByPath src/<file>.test.jsx --list`; remove `--list` to execute. Every explicit server selector must match. Jest options use `--maxWorkers 2` or `--maxWorkers=2`; unsupported skip/discovery flags fail closed.
- Expand coverage for shared code, authentication, privacy, persistence, data-loss risks, dependency/configuration changes and broad refactors. Keep the storage/overwrite, ownership and public-share safeguards. Run full suites once at final validation for global test/CI infrastructure, not after every edit. UI build remains a gate when UI is selected.
- Root `test:server` and `test:ui` print compact receipts and save full logs/results under ignored `tmp/test-receipts/`. Read the selected failures or new warnings; do not ingest passing megabyte logs. Counts for node-style suites are files, not assertion counts. Never claim model token savings from CPU runtime or log size.
- Reuse a passing receipt only for the same command, commit/content tree, environment and unchanged installed dependencies; compare the receipt's identity to `node -e 'console.log(require("./scripts/test_receipt").identity())'`. The environment hash is intentionally conservative. Re-run after any change or uncertainty (including a dependency edit, service/fixture change, rename/deletion, or different runtime). There is no automatic result cache. Receipts do not prove a live service is unchanged.
- Use one appropriate independent review, then a scoped delta review for substantive fixes. Batch independent reads, inspect failures first, keep progress/review context concise, and do not repeat unchanged passing checks without a reason.
- CI routes known components using `scripts/ci_test_scope.js`, keeps `Server`, `UI`, `Chrome extension` checks and verifies selected jobs in `Tests complete`. Unknown/shared/configuration/safety inputs run all jobs. Do not filter the required workflow itself or remove tests to reduce its count. See `docs/lean-testing-workflow.md` for commands, routing boundaries and evidence.
