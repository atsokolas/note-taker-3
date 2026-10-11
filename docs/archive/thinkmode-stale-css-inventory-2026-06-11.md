# ThinkMode stale CSS inventory (2026-06-11)

Cross-reference after removing the legacy `mainPanel` concept-selected branch and `showLegacyConceptCollections` UI from `ThinkMode.jsx`. JSX grep across `note-taker-ui/src` found **no remaining usages** of the hero/summary/toolbar classes listed below.

**Live surfaces checked:** `selectedConceptLayout` / `concept-editorial-shell`, Insights tab (`insightsPanel`), `ConceptNotebook` (via idea workbench — uses `concept-outline__*`, not hero classes), `AddToConceptModal` (uses `concept-search-*`), `ConceptsIndexView`, composer popover.

| Selector | File:line | Used by | Recommendation |
| --- | --- | --- | --- |
| `.think-concept-hero` | `theme.css:5397` | none | **remove** |
| `.think-concept-hero` (dark) | `theme.css:3876` | none | **remove** |
| `.think-concept-hero h1` | `theme.css:5425` | none | **remove** |
| `.think-concept-kicker` | `theme.css:5416` | none | **remove** |
| `.think-concept-summary` | `theme.css:5431` | none | **remove** |
| `.think-concept-summary p` | `theme.css:5436` | none | **remove** |
| `.think-concept-summary-editor` | `theme.css:5444` | none | **remove** |
| `.think-concept-summary-actions` | `theme.css:5464` | none | **remove** |
| `.concept-description` | `theme.css:5451` | none | **remove** |
| `.think-concept-toolbar` | `theme.css:5470` | none | **remove** |
| `.concept-suggestion-actions` | `theme.css:5739` | none | **remove** |
| `.concept-note-card` | `think-calm-d3a.css:496` (grouped) | none | **review** — split from live `.concept-highlight-card` sibling in same rule block |
| `.think-concept-hero` (calm bundle) | `think-home-polish.css:1874,1883,2695,2707` | none | **remove** (keep paired `.think-concept-loading` rules) |
| `.think-concept-hero h1` | `think-home-polish.css:1894,2743` | none | **remove** |
| `.think-concept-kicker` | `think-home-polish.css:1888` | none | **remove** |
| `.think-concept-summary`, `.think-concept-summary-editor` | `think-home-polish.css:1900-1901` | none | **remove** |
| `.think-concept-summary p` | `think-home-polish.css:1906` | none | **remove** |
| `.concept-description`, `:focus` | `think-home-polish.css:1912-1918` | none | **remove** |
| `.think-concept-toolbar` (+ button variants) | `think-home-polish.css:1925-1939` | none | **remove** |
| `.think-concept-hero` (calm-ui-global group) | `calm-ui-global.css:392` | none | **review** — drop from comma list; keep `.think-concept-loading` |
| `.think-concept-hero` (noeis-rebrand groups) | `noeis-rebrand.css:417,502,674` | none | **review** — remove from shared surface lists |
| `.think-concept-kicker` (noeis-rebrand) | `noeis-rebrand.css:456` | none | **remove** |
| `.think-concept-toolbar` (noeis-rebrand) | `noeis-rebrand.css:707` | none | **remove** |
| `.think-concept-hero h1` (think-calm-d3a) | `think-calm-d3a.css:281` | none | **remove** |
| `.think-concept-hero` (think-calm-d3a group) | `think-calm-d3a.css:486` | none | **review** — split from live `.think-concept-loading` |
| `.think-concept-loading` | `theme.css:5407`, `think-home-polish.css:1875`, `ConceptsIndexView.jsx`, `LibraryMain.jsx`, `selectedConceptLayout` | live | **keep** |
| `.think-concept-composer-*` | `theme.css:4805+`, `ThinkMode.jsx`, `ConceptsIndexView.jsx` | live | **keep** |
| `.think-concepts-empty-state*` | `think-home-polish.css:1492+`, `ConceptsIndexView.jsx` | live | **keep** |
| `.concept-highlight-card` | `ThinkMode.jsx` (Insights + right drawer), `think-calm-d3a.css:495` | live | **keep** |
| `.concept-note-grid` | `ThinkMode.jsx` (Insights, questions right panel) | live | **keep** |
| `.concept-related-tags` | `ThinkMode.jsx`, `QuestionEditorialView`, `NotebookContext`, `SynthesisModal` | live | **keep** |
| `.concept-search-*` | `AddToConceptModal.jsx`, `SearchResultsList.jsx`, `theme.css:5705+` | live | **keep** |
| `.concept-editorial-*` | `ConceptEvidenceStreamView`, `EditorialRail`, `selectedConceptLayout`, `stitch-editorial.css` | live | **keep** |
| `.concept-outline__*` | idea workbench / legacy collections styling | live (workbench) | **keep** — not the removed mainPanel branch |
| `.notebook-editorial-*` | `notebookEditorialLayout`, `stitch-editorial.css` | live | **keep** |
| `.think-notebook-editor-pane` | `mainPanel` notebook branch, `NotebookView.jsx` | live | **keep** |
| `.think-section-home--notebook` | `mainPanel` notebook empty state | live | **keep** |

## Notes

- **`concept-highlight-grid`** — no CSS definition found under searched files; only `.concept-note-grid` is used in JSX.
- **`stitch-editorial.css`** — no matches for legacy hero/summary selectors; editorial concept/notebook shells are live.
- **Grouped rules** — several polish/calm files batch `.think-concept-hero` with live selectors (`.think-concept-loading`, card surfaces). Prune dead selectors without dropping live siblings.
- **Suggested cleanup order:** `theme.css` base blocks first, then split grouped overrides in `think-home-polish.css`, `calm-ui-global.css`, `noeis-rebrand.css`, and `think-calm-d3a.css`.
