# Test Plan — Design sprint QA (2026-06-03)

**Scope:** External bridge card redesign, evidence drag affordance, magnetic/smooth UI, dark-mode token polish, responsive bridge layout (≤760px).

**Method:** Local Chrome via Cursor browser MCP on `http://localhost:3000` with API on `:5500`. Seed user `qa_editor_seed` / `QaSeed1234` (`node scripts/seed_editor_qa.js`). Every pass/fail cites DOM read or unit test run — no unverified claims.

**Preconditions**

- API: `npm start` (port 5500)
- UI: `cd note-taker-ui && npm start` (port 3000)
- Seed: `node scripts/seed_editor_qa.js`
- Optional article for reader QA: `POST /save-article` (Bearer token)

---

## 1. External bridge card (`/integrations`)

| ID | Case | Steps | Expected | Result |
|----|------|-------|----------|--------|
| B1 | Pre-mint layout | Open `/integrations` → Show advanced agent settings | Mint row + scope field visible | **Pass** |
| B2 | Mint token | Click **Mint bridge token** | Token well, Copy token, Test bridge connection, Copy OpenClaw config | **Pass** |
| B3 | Config / Reference tabs | Default **Config**; switch to **Reference** | Reference shows A2A/MCP examples, bridge methods | **Pass** |
| B4 | Responsive ≤760px | Emulate 760×900; inspect mint + primary actions | Inputs/buttons stack full width (~90%+ card) | **Pass** (buttons ~664px @ 760px viewport) |
| B5 | Copy / test actions | Click Copy token; Test bridge connection | Clipboard / success toast (or non-error response) | **Not run** (smoke optional) |

**Unit:** `ExternalBridgeCard.test.jsx` — 3/3 pass.

---

## 2. Evidence drag affordance (concept editorial)

| ID | Case | Steps | Expected | Result |
|----|------|-------|----------|--------|
| E1 | Grip present | Concept with `workspace` card in idea workbench (Pulled material) | 6-dot grip, `aria-label="Drag this evidence into the draft"`, no `⋮` | **Pass** (after seeding workspace card) |
| E2 | Drop hint | Open concept draft | “Drag evidence here…” visible on drop zone | **Pass** |
| E3 | Drag into draft | Drag workspace card onto draft | Card integrates / draft updates | **Not run** (manual drag) |

**Unit:** `ConceptEvidenceStreamView.test.jsx` — 3/4 pass on grip/a11y cases; 1 failure on “Expand trace history” interaction (unrelated to grip change — verify separately).

**Seed note:** `QA Slash Concept` ships empty; add workspace card via `PUT /api/concepts/QA%20Slash%20Concept/idea-workbench` for browser E1.

---

## 3. Magnetic / smooth UI

| ID | Case | Steps | Expected | Result |
|----|------|-------|----------|--------|
| M1 | Reading rail | Open `/library?articleId=<id>`; scroll `.three-pane__main` | `.magnetic-reading-rail` present; progress fill moves (0 → ~0.55) | **Pass** |
| M2 | Top control | Rail visible while scrolled | **Top** button present | **Pass** |
| M3 | Caret toolbar (notebook) | `/think?tab=notebook&entryId=<id>` | `.think-rich-text-toolbar-magnet` on toolbar | **Pass** |
| M4 | Selection menu | Select paragraph text in article reader | `.selection-menu.is-magnetic` with Highlight / Notebook / Concept actions | **Pass** |
| M5 | Reduced motion | OS `prefers-reduced-motion: reduce` | Magnetic lerp disabled / instant positioning | **Not run** (manual OS setting) |

---

## 4. Dark mode polish

| ID | Case | Steps | Expected | Result |
|----|------|-------|----------|--------|
| D1 | Token defined | Toggle theme to Dark | `--surface-elevated` resolves (not empty); bridge token well + pre readable | **Partial** — light tokens verified in CSS; live dark toggle not fully exercised in this pass (theme control in top bar) |
| D2 | Editorial borders | Dark + `body.noeis-editorial` | `--vellum-line` bump on workbench borders | **Not run** |
| D3 | Magnetic rail dark | Dark + article reader | Rail background contrasts with page | **Not run** |

**Fix verified in code:** `--surface-elevated` added in `theme.css` (light + dark).

---

## 5. Regression / unrelated

| Item | Result |
|------|--------|
| `ConceptTemplatePickerModal.test.jsx` failures | Pre-existing on `main` (out of sprint scope) |

---

## Execution summary (2026-06-03 Chrome pass)

| Area | Automated unit | Browser |
|------|----------------|---------|
| Bridge card | Pass | Pass (B1–B4) |
| Evidence grip | 3/4 unit | Pass (E1–E2, with seeded workspace card) |
| Magnetic rail / selection / notebook toolbar | — | Pass (M1–M4) |
| Dark mode surfaces | CSS fix landed | Partial (D1–D3 remain) |
| Bridge smoke (copy/test) | — | Optional |

---

## Quick re-run commands

```bash
# Terminal 1
npm start

# Terminal 2
cd note-taker-ui && npm start

# Seed + unit tests
node scripts/seed_editor_qa.js
cd note-taker-ui && CI=true npm test -- --watchAll=false ExternalBridgeCard.test.jsx ConceptEvidenceStreamView.test.jsx
```

**Deep links (replace token from seed output):**

- Integrations: `http://localhost:3000/integrations`
- Notebook: `http://localhost:3000/think?tab=notebook&entryId=69e3d05c50f780e23546f805`
- Concept: `http://localhost:3000/think?tab=concepts&concept=QA%20Slash%20Concept`
- Article: `http://localhost:3000/library?articleId=6a2092ddff682d4e2de28ff7`
