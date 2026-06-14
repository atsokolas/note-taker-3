## Learned User Preferences

- UI should stay clean and calm while feeling smooth and modern: magnetic rails/bars with subtle cursor-follow, short eased transitions, and glass only on floating controls; honor `prefers-reduced-motion` and fine-pointer-only motion.
- Primary surfaces to design and test together: Home, Library, individual articles, Notebook, and Concept (Think hub).
- On multi-step UI or feature work, report clear next steps after each iteration rather than only at the end.
- When QA finds gaps, fix through the stack (API persistence + UI), verify in the browser when relevant, and document in `docs/` test plans — not shell-only wiring.
- For investigation or inventory tasks, stay investigation-only: no behavior changes unless explicitly asked; deliver docs (inventories, extraction plans) rather than opportunistic refactors.
- For large refactors, prefer inventory → no-edit extraction plan → targeted tests for fallback branches before extracting components.
- For Think index layouts (home, concepts, questions, notebook), prefer shared `CalmIndexView`, `ThinkShelfRail`, and `calmIndexModel.js` over duplicating layout variants inline in ThinkMode.jsx.
- When changing Think index layouts, preserve ThoughtPartnerPanel mounting and queued-prompt coverage in `ThinkMode.templates.test.jsx`.
- Wire thinking-partner actions (pull-in references, wiki promote, streaming wiki build, agent retrieval) to real backend behavior that survives reload; sequence bidirectional graph edges before flows that depend on them.

## Learned Workspace Facts

- React UI lives in `note-taker-ui/` (dev server port 3000); API via `npm start` at repo root (port 5500).
- Production: frontend at https://www.noeis.io (Vercel); API at https://note-taker-3-unrg.onrender.com (Render, auto-deploys from `main`).
- Think hub: `/think?tab=home|notebook|concepts|questions`; Library: `/library`; articles open with `articleId` on library or `/articles/:id`.
- Connections: use `/connections` as the single hub (`/integrations` same page; `/data-integrations` redirects with query/hash preserved for OAuth returns like `?source=readwise#sources`).
- Public share routes (no auth chrome): `/share/wiki/:idOrSlug`, `/share/concepts/:slug`, `/share/questions/:slug` — editorial content only; no library/highlights leak.
- ThinkMode `legacyShell=0` only forces ThreePaneLayout for home, notebook, and concepts index; questions always use the editorial shell.
- Editorial workbench styling uses `noeis-editorial` and shared tokens in `note-taker-ui/src/styles/theme.css` (plus `idea-workbench.css` / `stitch-editorial.css` where applicable).
- Local editor/browser QA: run `node scripts/seed_editor_qa.js` for the `qa_editor_seed` user (credentials live in seed script — never store passwords in docs or AGENTS.md).
- Structured QA write-ups, refactor inventories, and extraction plans live under `docs/` (e.g. Space to Think and design-sprint test plans).
