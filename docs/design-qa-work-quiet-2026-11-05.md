# Work — Quiet Canvas acceptance

Approved visual: Library `libfile_02005754a734819199a79ffeeb9819f0`, locally `../noeis-work-calm-type.png`. User approved build, test and merge. Based on main `45046566`, retaining the dated-entry and provenance work from PR621.

## Result

The note now has one compact header, a restrained serif title and neutral sans-serif writing. Dates sit in a reading gutter on desktop and above their entries on mobile. The narrow, muted rail retains nested projects and folders; occasional work views and filtering are in More. The current folder reveals itself when the selected note has no visible project. Search exposes all matching branches.

Existing tools are reorganized rather than removed: Dates and + Entry use the existing editor/date projection; the title chevron holds filing, original written date, people/meeting metadata and calendar access; the note menu holds text style, outline/folding, Make Open, paragraph movement, links, return line and continuation. Week mode opens the actual full-width planner and closes back to the quiet note. Healthy Open rests collapsed; source captures, pending drafts and new conflicts/errors reveal it. Save failures and note conflicts remain visible outside the menus.

One `WorkMenu` replaces ad-hoc tool placement/dismissal. Retired colored navigation roles, duplicate title framing and the permanent tools row were removed. Pending item identities are projected once per render. No server, schema, date backfill, accepted HTML/block content, source identity, save protocol or theme setting was changed.

## Browser evidence

Real Work components and shared editor, copied into an isolated fixture preview at `http://127.0.0.1:3110/work?note=n0`. Fictional records are handled by an Axios adapter that rejects unknown requests; no real account or production writes. The application's actual entry point was separately built, not replaced by the fixture.

Evidence retained in ignored `output/quiet-qa/`:

- `desktop-light.jpg` — final light view, 1487×1058 CSS/pixel viewport, device density 1.
- `desktop-tokyo.jpg` — Tokyo Midnight, same desktop viewport; captured before the final reading-measure refinement.
- `tablet-light.jpg` — 1280×900, no horizontal overflow.
- `mobile-light.jpg` — 430×932, one writing column and date labels above entries.
- `paired-comparison.jpg` — approved raster and implementation together in a browser comparison board, both normalized by the same CSS width. Source and desktop implementation each 1487×1058 pixels; no aspect distortion.
- `initial-desktop.jpg` — first iteration retained to document the shared Think font override that was corrected.

The source and rendered implementation were opened and paired for comparison. The complete source/implementation views are legible at this simple screen's density; computed font/color/target measurements supplement the typography and controls, so a separate enlarged asset crop was unnecessary. There are no photographic or generated decorative assets to verify. Existing licensed Work icon assets are reused.

### Fidelity review and iteration

- Initial P1: shared Think `!important` styling forced serif prose. Fixed with a Work-owned sans-serif rule, scoped to Work. Computed family is Helvetica Neue with platform fallbacks; desktop reading size 20px (derived from the existing body-size input), 33px leading; mobile uses the body-size input directly. One 28px regular Newsreader title, 24px on mobile.
- Initial P2: sidebar/paper tones put more emphasis on the rail. Reassigned existing semantic canvas/paper roles so the writing leads; no fixed light-only palette.
- Initial P2: the shared masthead padding did not match its sticky-height variable. Work's desktop masthead now measures 64px; rail and note header use that same variable.
- Initial P2: mobile note-information menu could cross the viewport and paint beneath sibling controls. Final popovers stay between x20 and x410 at 430px width, with the open menu above adjacent controls.
- After the paired comparison, adjusted the desktop reading scale/measure and top spacing toward the approved composition. The final light capture is the post-fix evidence.

Acceptable deliberate differences: actual global navigation/utility destinations and theme machinery remain, rather than substituting a static Paper selector. Actual complete authored date headings remain editable in the gutter rather than silently shortening stored text. Task checkboxes and source links remain in the existing Open record instead of creating a second inline task store. Fixture note/project contents determine visible children, not hardcoded sample rows. Paragraph gaps follow the author's paragraph breaks. None blocks the approved hierarchy or core workflow.

## Interaction and accessibility checks

Chrome desktop, 1280px and 430px checked. Verified:

- Source selection → Make Open → focused composer → edit title → Add → source-link return highlights the original passage. Source words remain unchanged; action appears in the same existing item flow. Reload retained the note and linked item.
- Mobile Notes & folders → nested rail → Collapse returns to visible writing. Collapse/back restores focus to the navigation trigger.
- Dates and information disclosures, Escape returning focus, outside dismissal and popover bounds. Nested Contents consumes Escape before the containing tool closes.
- Native project/folder disclosures retain keyboard controls, complete child lists and independent membership. No drag/drop or filing API path was replaced.
- Current-day duplicate entry, backdated entry, heading correction, undo/reload, folding and source identity covered by the existing editor tests.
- Open's pending→conflict and draft→error transitions reopen recovery even after manual collapse, covered by new regression tests.
- Visible icon controls measured 44×44px; dates and note tools also have 44px targets. No horizontal viewport overflow at tested widths. Reduced-motion rules remain in place; no decorative motion added.
- Browser error logs empty during acceptance.

Measured contrast from rendered semantic colors:

| Theme | Writing | Rail labels |
| --- | --- | --- |
| Light | 13.08:1 | 5.62:1 |
| Tokyo Midnight | 14.97:1 | 11.95:1 |

## Engineering verification

Affected selection: all `src/work` suites plus `src/api/uiSettings.work.test.js`: 203 tests across 22 files pass. The final week-focus regression also passes in the 20-test WorkWeekfold suite. Covers data durability, account changes, conflict recovery, original dates, rich-text blocks/selection, planner state, nested navigation and provenance. New tests cover native menu dismissal/focus, recovery disclosure transitions, unprojected-note visibility and the retained full week.

Full production UI build with original app entry and built-in lint; `git diff --check`. Local Node is 22.22.3, below the declared 22.23.4 minimum; remote exact-head CI is the supported-runtime release gate. Test runner may emit Tippy development-only destroyed-instance teardown warnings; these are retained in raw receipts, not suppressed. No browser errors were observed.

Independent read-only review found mobile-collapse and nested-Escape defects, both fixed. A bounded delta found the pending→conflict disclosure transition, now keyed by attention identity and regression-tested. Final delta review reported no remaining supported blocker in the menu, draft and rail changes. The week-mode remount subsequently received explicit focus transfer and a focused-button regression test; Chrome confirmed focus enters Week and returns to Note information. No GitHub approval review was submitted.

Limits: fixture persistence and Chrome acceptance do not prove authenticated production account state or physical iPhone/Safari behavior. No backend changes require a migration. Automatic deployment and exact-head CI status are recorded in the PR/release report after push and merge.

final result: passed
