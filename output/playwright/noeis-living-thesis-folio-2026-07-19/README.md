# Living Thesis folio design evidence — 2026-07-19

QA-only acceptance for the conditional authenticated Living Thesis surface. No real Thesis 001, founder judgment, publication, email, or public state was created or changed.

## Visual references

- North-star concept: `/Users/athantsokolas/.codex/generated_images/019f7b8c-43d1-7983-87d6-11a346378965/exec-2c8393b9-cd4c-40f8-a550-ee4dc5bb7d89.png`
- Before, 1440px: `/Users/athantsokolas/Documents/GitHub/note-taker-3-1/output/playwright/noeis-judgment-live-2026-07-19/living-thesis-1440.png`
- Before, 1366px: `/Users/athantsokolas/Documents/GitHub/note-taker-3-1/output/playwright/noeis-judgment-live-2026-07-19/living-thesis-1366.png`
- Before, 430px: `/Users/athantsokolas/Documents/GitHub/note-taker-3-1/output/playwright/noeis-judgment-live-2026-07-19/living-thesis-430.png`
- After: `after-read-1440.png`, `after-read-webkit-1366.png`, `after-read-webkit-430.png`, and `after-editor-webkit-430.png`

## Interaction and motion

- Keyboard disclosure editor: `disclosure-edit-keyboard-1440.png`
- Editor entry frames: `editor-transition-00ms.png`, `editor-transition-90ms.png`, `editor-transition-230ms.png`
- Reduced-motion narrative editor: `reduced-motion-narrative-edit-1440.png`
- Final independent motion verdict: Approve; no findings and no Block conditions.
- Normal section transitions use opacity and 6px translation for 180ms with strong ease-out.
- Reduced motion removes translation and retains a 120ms opacity cue; Escape closes immediately.
- Pointer press/release uses `scale(0.98)` with 140ms press and 100ms release.

## Browser acceptance

- Chrome 1440px: pass
- WebKit 1366px: pass, zero console warnings/errors
- WebKit 430px: pass, `scrollWidth === clientWidth === 430`, zero console warnings/errors
- Keyboard: first editor control receives focus; Escape closes and returns focus; one structured section edits at a time
- API fixture: `api-acceptance.json` proves canonical private QA page, narrative causal arrays preserved, initial snapshot/restore, and private public-read 404

## Verification

- Focused Living Thesis and reader tests: 62/62
- Wiki component regression: 41 suites, 407/407
- Full `npm run wiki:qa`: pass
- Separate `CI=true npm run build`: pass

## Intentional deviations from the concept

- No rich-text toolbar: the current Judgment contract supports plain text fields, so the redesign uses the existing textarea/select capabilities.
- No mock graph controls: causal `nodes` and `edges` remain preserved reserved arrays while the canonical summary edits as prose.
- No mock timestamps or invented judgment: the page uses explicit QA/demo fixture content and the existing persisted metadata.
- General Wiki reader, dossier, comparison, public proof, and navigation surfaces are unchanged.
