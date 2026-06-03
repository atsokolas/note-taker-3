## Learned User Preferences

- UI should stay clean and calm while feeling smooth and modern: magnetic rails/bars with subtle cursor-follow, short eased transitions, and glass only on floating controls; honor `prefers-reduced-motion` and fine-pointer-only motion.
- Primary surfaces to design and test together: Home, Library, individual articles, Notebook, and Concept (Think hub).
- On multi-step UI or feature work, report clear next steps after each iteration rather than only at the end.
- When QA finds gaps, fix through the stack (API persistence + UI), verify in the browser when relevant, and document in `docs/` test plans — not shell-only wiring.
- Wire thinking-partner actions (pull-in references, wiki promote, streaming wiki build, agent retrieval) to real backend behavior that survives reload; sequence bidirectional graph edges before flows that depend on them.

## Learned Workspace Facts

- React UI lives in `note-taker-ui/` (dev server port 3000); API via `npm start` at repo root (port 5500).
- Think hub: `/think?tab=home|notebook|concepts`; Library: `/library`; articles open with `articleId` on library or `/articles/:id`.
- Editorial workbench styling uses `noeis-editorial` and shared tokens in `note-taker-ui/src/styles/theme.css` (plus `idea-workbench.css` / `stitch-editorial.css` where applicable).
- Local editor/browser QA: run `node scripts/seed_editor_qa.js` for the `qa_editor_seed` user (credentials live in seed script — never store passwords in docs or AGENTS.md).
- Structured QA write-ups for this product live under `docs/` (e.g. Space to Think and design-sprint test plans).
