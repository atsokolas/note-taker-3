# Think Home Visual Regression Baseline

Use this checklist to capture and compare Think Home UI after design-token/shell changes.

## Capture Matrix

- `think-home-light-desktop.png` (`1440x900`)
- `think-home-dark-desktop.png` (`1440x900`)
- `think-home-light-tablet.png` (`1024x768`)
- `think-home-dark-tablet.png` (`1024x768`)

## Page State

- Route: `/think?tab=home`
- Logged in user with:
  - notebook entries
  - concepts
  - questions
  - return queue items
  - recent highlights/articles
- Right drawer expanded for one capture, collapsed for one quick sanity check (optional)

## Capture Rules

- Browser zoom `100%`
- Stable window size (do not maximize between captures)
- Same theme + same dataset across before/after comparison
- Wait for Think Home lists to finish loading before capture
- Avoid hover states during capture

## What To Compare

- Borders reduced (no “outlined everywhere” look)
- Surface hierarchy: shell < panel < card (max two visible elevations)
- Typography hierarchy:
  - `Think`
  - section titles
  - item titles
  - metadata
- Header density reduced (tabs + utility buttons calmer)
- Notebook panel visually quieter than main content
- Working Memory drawer readable but not dominant
- No overflow/clipping at tablet width

## Notes

- This repo currently does not include an automated screenshot runner.
- Store captured baselines in `docs/ui-regression/screenshots/` (create locally if missing).
