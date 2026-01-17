# UI Overhaul Plan (Audit + Migration)

## 1) Current app audit

### Routes / pages (from `note-taker-ui/src/App.js`)
- `/` → Landing (or redirect to `/today` when `hasSeenLanding`)
- `/today` → TodayMode
- `/library` → Library
- `/think` → ThinkMode
- `/review` → ReviewMode
- `/settings` → Settings
- `/how-to-use` → HowToUse
- Legacy/feature routes still active:
  - `/brain` → Brain
  - `/resurface` → Resurface
  - `/all-highlights` → AllHighlights
  - `/tags` → TagBrowser
  - `/tags/:tagName` → TagConcept
  - `/collections` → Collections
  - `/collections/:slug` → CollectionDetail
  - `/notebook` → Notebook
  - `/views` → Views
  - `/views/:id` → ViewDetail
  - `/search` → Search
  - `/journey` → Journey
  - `/concept/:tag` → TagConcept (alias)
  - `/articles/:id` → ArticleViewer
  - `/trending` → Trending
  - `/export` → Export
  - `/login`, `/register`

### Layout components in use
- `note-taker-ui/src/layouts/WorkspaceShell.jsx` (TodayMode, ThinkMode, ReviewMode, Library via LibraryShell)
- `note-taker-ui/src/components/library/LibraryShell.jsx` (wraps WorkspaceShell for Library)
- `note-taker-ui/src/components/ui.js` → `Page`, `Sidebar`, `PanelHeader`, `QuietButton`, etc.

### Left nav implementation
- `note-taker-ui/src/components/ui.js` → `Sidebar` component
- `note-taker-ui/src/App.js` mounts `Sidebar` and defines nav items

### Context panel implementation
- `WorkspaceShell` renders right panel with `PanelHeader`
- `LibraryContext` right column in Library via `LibraryShell`
- `TodayMode`, `ThinkMode`, `ReviewMode` pass `right` content to `WorkspaceShell`
- Notebook uses its own internal panel split (`note-taker-ui/src/components/Notebook.js`)
- ArticleViewer uses its own layout/panel logic (`note-taker-ui/src/components/ArticleViewer.js`)
- ReferencesPanel is a dedicated component (`note-taker-ui/src/components/ReferencesPanel.jsx`)

### Duplicated / parallel panel logic
- `WorkspaceShell` (main 3‑pane grid)
- `Notebook` has a custom two‑pane layout (`.notebook-panels`)
- `ArticleViewer` has a custom layout + highlights UI and selection popup
- `App.js` shows a separate “library rail” panel for `/articles/:id`

## 2) Migration plan (keep app runnable after each step)

### New top nav structure (target)
- Global top nav with:
  - Left: brand + primary tabs: Today, Library, Think, Review
  - Center: global search/command (Readwise‑like)
  - Right: Settings, Help, Profile
- Sidebar becomes optional: used only for local subnav (Library cabinet, Think sections).

### Universal 3‑pane contract (target)
1. **Left pane** (context navigation)
   - Route‑specific: Library cabinet, Think sections, Review tabs, Today focus list.
2. **Main pane** (primary content)
   - Editorial, text‑forward, calm.
3. **Right pane** (context/actions)
   - Always structural column, collapsible; no overlays.

### Page grouping (target IA)
- **Today**: Desk (resurface + continue reading/thinking + prompt)
- **Library**: Cabinet + Reading Room + Context
- **Think**: Notebook + Concepts + Questions (Questions inside Think)
- **Review**: Journey + Reflections + Resurface

### Refactor order (safe, incremental)
1. **Introduce TopNav component** (no behavior change)
   - Render TopNav above existing Sidebar so app remains usable.
2. **Adopt TopNav for Today/Library/Think/Review**
   - Keep Sidebar temporarily for legacy routes.
3. **Align Today/Library/Think/Review to the 3‑pane contract**
   - These already use `WorkspaceShell`; tighten layout tokens and headers.
4. **Migrate legacy pages into the new structure**
   - Notebook → fold into Think (reuse WorkspaceShell)
   - ArticleViewer → move into Library reading room
   - Journey/Resurface → Review tabs
5. **Retire duplicate panels**
   - Remove `library-rail` in `App.js` once ArticleViewer is merged into Library
   - Replace Notebook’s custom panels with the shared shell
6. **Finalize**
   - Update routes/redirects to keep old paths working
   - Remove sidebar when all routes have a local left pane
