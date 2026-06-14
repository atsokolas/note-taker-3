# NotebookEditorialView extraction plan (2026-06-11)

No-edit plan for extracting notebook editorial chrome from `ThinkMode.jsx`, mirroring `QuestionEditorialView` (`note-taker-ui/src/components/think/questions/QuestionEditorialView.jsx`).

## Scope (current line numbers in `ThinkMode.jsx`)

| Block | Lines | Role |
| --- | ---: | --- |
| `notebookEditorialLeftPanel` | 2923–3030 | `EditorialRail` with notebook sections (sources / highlights / annotations / default) |
| `notebookEditorialRightPanel` | 4658–4743 | Agent stream, reference pull-in, advanced drafts, notebook posture actions, `NotebookContext` |
| `notebookEditorialLayout` | 4873–4887 | Three-column shell wrapping left rail, `{mainPanel}`, right rail |
| `mainPanel` notebook branch | 3894–3947 | Empty-state home grid **or** `NotebookEditor` pane (passed into editorial shell `<main>`) |
| Routing gate | 5035–5036 | `!disableEditorialShell && activeView === 'notebook'` → editorial shell vs `ThreePaneLayout` |
| `leftPanel` notebook branch | 3080–3081 | Uses `notebookEditorialLeftPanel` only inside editorial layout; ThreePane fallback uses `defaultLeftPanel` |

State owned by ThinkMode today: `notebookEditorialSection` / `setNotebookEditorialSection` (declared ~392).

## Target component

**`NotebookEditorialView.jsx`** under `note-taker-ui/src/components/think/notebook/`.

Structure (same pattern as questions):

```tsx
type NotebookEditorialViewProps = {
  // Shell / nav
  activeSection: 'assistant' | 'sources' | 'highlights' | 'annotations' | string;
  onChangeSection: (section: string) => void;
  partnerRailNavItems: Array<{ value: string; label: string; short?: string }>;

  // Left rail — lists & search
  search: string;
  onSearchChange: (value: string) => void;
  filteredNotebookEntries: NotebookEntry[];
  notebookEntries: NotebookEntry[];
  renderNotebookFolderList: (
    entries: NotebookEntry[],
    options?: { emptyMessage?: string; skeletonRows?: number }
  ) => React.ReactNode;
  allQuestionsLoading: boolean;
  filteredQuestions: Question[];
  homeWorkingSet: { questions: Question[]; concepts: Concept[] };
  conceptsLoading: boolean;
  conceptsWithHighlights: Concept[];
  renderPartnerQuestionList: (items: Question[], emptyMessage: string) => React.ReactNode;
  renderPartnerConceptList: (items: Concept[], emptyMessage: string) => React.ReactNode;
  onCreateNotebookEntry: () => void;

  // Main column (children or inlined mainPanel notebook branch)
  children: React.ReactNode;

  // Right rail — agent & context
  thoughtPartnerContext: ThoughtPartnerContext | null;
  thoughtPartnerContextMetadata: Record<string, unknown>;
  queuedThoughtPartnerPrompt: string;
  thoughtPartnerPostureProps: Record<string, unknown>;
  queueThoughtPartnerPrompt: (prompt: string, options?: object) => void;
  renderReferencePullIn: (className?: string) => React.ReactNode;
  sharedArtifactDraftsModel: AgentArtifactDraftsModel;
  onOpenThreadFromDraft: (draft: object) => void;
  onCreateHandoffFromDraft: (draft: object) => void;
  onQueueFollowUpLoopFromDraft: (draft: object) => void;
  activeNotebookEntry: NotebookEntry | null;
  handleQueueOrganizationPrompt: () => void;
  handlePromoteThinkObjectToWiki: (target: string) => void;
  wikiPromotionState: WikiPromotionState;
  notebookWikiPromotionTarget: string;
  conceptWikiPromotionTarget: string;
  wikiPromotionError: React.ReactNode;
  renderWikiPromotionTrace: (target: string) => React.ReactNode;
  onSelectView: (view: string) => void;
};
```

**Dependency count:** ~35 props + `children` (vs **45 props** on `QuestionEditorialView` — questions carry more question-editor / related-data surface).

Prefer passing **`children`** for the notebook `mainPanel` branch so `NotebookEditor` save/delete/registerInsert wiring stays in ThinkMode until a second pass extracts `NotebookMainPanel`.

## Migration steps

1. **Create** `NotebookEditorialView.jsx` — copy JSX from `notebookEditorialLeftPanel`, `notebookEditorialRightPanel`, and shell markup from `notebookEditorialLayout`; import `EditorialRail`, `ThoughtPartnerPanel`, `AgentArtifactDraftsPanel`, `AgentSkillDock`, `NotebookContext`, `SectionHeader`, `QuietButton`, `AGENT_DISPLAY_NAME`.
2. **Lazy-load** in `ThinkMode.jsx` (line ~100 area, beside `QuestionEditorialView`):
   `const NotebookEditorialView = lazy(() => import('../components/think/notebook/NotebookEditorialView'));`
3. **Replace** `notebookEditorialLayout` with:
   ```jsx
   <NotebookEditorialView {...notebookEditorialProps}>{mainPanel}</NotebookEditorialView>
   ```
4. **Remove** inline `notebookEditorialLeftPanel`, `notebookEditorialRightPanel`, and shell divs from ThinkMode.
5. **Keep** `leftPanel` ternary at 3080–3081 unchanged until ThreePane notebook fallback is deleted — editorial left rail moves into extracted component only.
6. **CSS:** no moves required; classes (`notebook-editorial-shell*`, `editorial-side-rail`, `think-index__search`) already live in `stitch-editorial.css` / theme.

## Risks

| Risk | Mitigation |
| --- | --- |
| Prop drift / huge interface | Group into `notebookRailModel`, `notebookAgentModel`, `wikiPromotionModel` in a follow-up if prop list grows |
| `mainPanel` notebook branch double-render | Pass as single `children`; do not duplicate empty-state vs editor logic |
| `legacyShell=0` ThreePane notebook path | Keep until explicit removal; extraction must not change routing at 5035–5041 |
| Lazy-load test flakes | Extend `ThinkMode.templates.test.jsx` notebook editorial test; add snapshot of shell testids |
| Right-rail `NotebookContext` needs live entry | Pass `activeNotebookEntry` from ThinkMode; document null empty-state behavior |

## Tests to update

| File | Change |
| --- | --- |
| `note-taker-ui/src/pages/ThinkMode.templates.test.jsx` | Existing test *"wires Notebook into a passive agent posture…"* — mock `NotebookEditorialView` or assert against extracted component |
| `note-taker-ui/e2e/*notebook*` (if any) | Smoke notebook editorial shell after extraction |
| New unit test (optional) | `NotebookEditorialView.test.jsx` — rail section switch, right-rail advanced `<details>` |

## Comparison to QuestionEditorialView

| | Question | Notebook (planned) |
| --- | --- | --- |
| Extracted file | `questions/QuestionEditorialView.jsx` | `notebook/NotebookEditorialView.jsx` |
| Props | 45 | ~35 + `children` |
| Main editor | Inlined `QuestionEditor` | `children` = `mainPanel` notebook branch |
| Routing | `isQuestionEditorialView` (no legacyShell gate) | Gated by `legacyShell !== '0'` |
| Left rail | Question lists / filters | Notebook folders + partner lists |
| Right rail | References, synthesis, wiki promote | Passive agent, drafts dock, `NotebookContext` |

## Verification checklist

- [ ] `/think?tab=notebook` — editorial shell, left section tabs, right passive agent copy unchanged
- [ ] `/think?tab=notebook&legacyShell=0` — still ThreePane + `think-left-panel` / `think-main-panel`
- [ ] Create page, open entry, promote to wiki, organization prompt — no regressions
- [ ] `prefers-reduced-motion` / editorial CSS unchanged (`noeis-editorial` body class)
