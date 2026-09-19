## Working with Athan

Work like an operator teammate, not a note-taking bot. Athan is high-agency, anti-fluff, and thinks in systems. The main failure mode to avoid is **capability ahead of proof**: plans, surfaces, and agent personas that outrun a closed loop someone can actually judge.

This section is the Noeis-repo translation of personalOS `.codex/WORKING_WITH_ATHAN.md`. Keep product facts below; keep private life, family, and calendar detail out of this public repo.

### Default posture

- Closed loops over commentary. Observe → decide → act → record. Stop when the smallest judgeable thing exists.
- Artifact creation over prose. Evidence plus a next action over abstraction. Consolidation over proliferation.
- Calm, direct, dry. No morale-padding, no strategy memos without a deliverable, no extra agent roles without an owned output.
- Honor spec scope. Do not touch unrelated surfaces. Default to frontend-only changes unless the task explicitly requires backend work.
- Do not submit, publish, or expand platform surface without approval. Demo quality and one spine beat more features.
- Prefer fewer strong reusable artifacts (shared components, rules, tests, postmortems) over scattered one-offs.
- A correction that will matter again belongs in this file, a test, or a spec — not only in chat.

### How to ship here

- On multi-step UI, spec-stage, or feature work, report the stage deliverable and clear next steps after each iteration, not only at the end.
- On spec-driven tasks, stay inside the spec boundary.
- Investigation or inventory tasks stay investigation-only unless explicitly asked to change behavior.
- For large refactors: inventory → no-edit extraction plan → targeted tests for fallback branches before extracting components.
- When QA finds gaps, fix through the stack (API persistence + UI), verify in the browser when relevant, and document in `docs/` test plans — not shell-only wiring.

## Learned User Preferences

- UI should stay clean and calm while feeling smooth and modern: magnetic rails/bars with subtle cursor-follow, short eased transitions, and glass only on floating controls; honor `prefers-reduced-motion` and fine-pointer-only motion.
- Primary surfaces to design and test together: Home, Library, individual articles, Notebook, and Concept (Think hub).
- For visual/responsive QA on primary surfaces, test desktop, Safari-sidebar/tablet widths around 1280–1400px, and mobile (~430px width), not desktop only.
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
- Public share routes (no auth chrome): `/share/wiki/:idOrSlug`, `/share/concepts/:slug`, `/share/questions/:slug` — editorial content only; no library/highlights leak.
- ThinkMode `legacyShell=0` only forces ThreePaneLayout for home, notebook, and concepts index; questions always use the editorial shell.
- Editorial workbench styling uses `noeis-editorial` and shared tokens in `note-taker-ui/src/styles/theme.css` (plus `idea-workbench.css` / `stitch-editorial.css` where applicable).
- Local editor/browser QA: run `node scripts/seed_editor_qa.js` for the `qa_editor_seed` user; run `node scripts/seed_wiki_qa.js` for wiki/graph QA (credentials live in seed scripts — never store passwords in docs or AGENTS.md).
- Prioritized open work, return-loop roadmap, feedback inventories, and QA write-ups live in `docs/` (e.g. `noeis-return-loop-roadmap-spec-2026-06-25.md`, `noeis-feedback-status-inventory-2026-06-27.md`, `noeis-details-polish-spec-2026-06-23.md`).
- Chapter 0.5 return-loop UI uses `SystemStatusContext` (background work, latest receipt, recoverable failure) with a compact TopBar `SystemStatus` affordance and session-local recent-activity drawer — not a toast stack.
- Any PR that adds or modifies a surfacing/selection algorithm (what the paper leads with, which claim is served for check-in, what appears in review queues, retrieval cards) must state in its description: the eligibility gate (what content qualifies), the quality bar (what gets suppressed), and the silence fallback (what renders when nothing qualifies — filler is never the answer). See docs/noeis-taste-pass-spec-2026-08-29.md.
- Code craft is part of the product: prefer elegant, minimal implementations over additive ones. Every PR should leave the codebase smaller or clearer where it touches — delete dead branches, redundant state, duplicated helpers, and superseded components rather than layering around them. If a change adds a file, say what it replaces.
- Build for delight, not just correctness: each user-facing change should carry one moment of recognition, consequence, mastery, or closure (a truthful receipt, a memory of what they already hold, a passage that opens where it came from). Magic is material and honest — never badges, streak-fire, confetti, or engagement traps. Honor `prefers-reduced-motion`; silence and stillness are legitimate delight states.
