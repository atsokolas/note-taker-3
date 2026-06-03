# Playbook — Noeis Live Browser QA

**Reusable methodology for testing noeis.io live via the Claude-in-Chrome MCP.**
Load this before any live-QA pass. It encodes the discipline that made QA trustworthy after several sessions of tooling failures and (worse) fabricated results.

**Companion docs (read for what *should* be true):**
- `docs/noeis-vision-architecture.md` — product shape (Library / Think / Wiki, graph not pipeline).
- `docs/noeis-design-language.md` — two registers, spatial grammar, dark mode, voice.
- `docs/noeis-motion-interaction.md` — physics, ticker, pull-in, dialectical canvas.
- Latest run: `docs/test-plan-space-to-think-2026-06-03.md` (use as the template seed).

---

## 0. The Prime Directive

**Never report a result you did not observe.** If a tool errors, the test is **UNVERIFIED** — say exactly that. Do not synthesize a plausible network trace, page id, word count, or "✅ verified." Fabricated QA is worse than no QA. (This rule exists because it was broken repeatedly; treat every "looks like it worked" as a claim you must back with a screenshot, DOM read, or network read.)

## 1. Interaction discipline (the method that actually works)

1. **Confirm the tab id first.** Call `tabs_context_mcp` before any interaction. Tab ids go stale across navigations/reconnects; using a remembered id makes every call silently fail. If a batch returns "Tab no longer exists," STOP and re-fetch — do not keep "acting."
2. **Drive via JavaScript against stable selectors, not element refs.** `find`→click-by-ref breaks because the app re-renders between find and click, and a stale ref click frequently lands on the ⌘K command palette (the "palette hijack"). Instead:
   - Read/click via `javascript_tool` using `aria-label`, role, or text selectors.
   - Set inputs via the native setter + dispatch `input`:
     ```js
     const el = document.querySelector('input[aria-label="Wiki page to build"]');
     const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
     set.call(el, 'My value'); el.dispatchEvent(new Event('input',{bubbles:true}));
     ```
   - Submit via `form.requestSubmit()` rather than hunting a button ref.
   - After typing into a field, verify focus is the field (`document.activeElement`) and the ⌘K palette is NOT open before trusting the keystrokes.
3. **One action → read the real output → decide.** Do not batch 20 optimistic actions and narrate success. Small steps, each verified.
4. **Every pass/fail cites evidence:** a screenshot, a DOM read, or a network read. No evidence → UNVERIFIED.

## 2. Verify actions actually fire (the no-op test)

A button that renders and clicks is NOT a working feature. Distinguish:
- **Working:** click → a real request to `note-taker-3-unrg.onrender.com` (clear network first with `read_network_requests {clear:true}`, then act, then read) → state changes (counter moves, nav happens, content appears) → persists across reload.
- **Wired-but-no-op:** renders, clicks, but **zero network calls** and **no state change**. This is the #1 class of real bug in this app (PULL, PROMOTE, in-place build refresh all failed this way). Always check the network after any "action" button.

## 3. Bugs that hide under "no horizontal scroll"

`document.scrollWidth === clientWidth` (no page scroll) does NOT mean the layout is clean. Check **per-column overflow**:
```js
el.scrollWidth > el.clientWidth + 2  // content overflows its own box → clips
```
A rail can clip its own content (561px content in a 336px column) with zero page overflow. Measure suspect columns directly.

## 4. Theme coverage

Test **both** light (default) and dark. Toggle: `find` the "Theme: …" button, click, re-read.
- Light body bg ≈ `rgb(255,252,247)`; dark ≈ `rgb(20,17,13)` (warm near-black, never cold `#000`).
- Gold accent must survive both; reading text stays readable. Dark is first-class, not a skin — verify real components, not just bg color.

## 5. Render backend cold-start

The backend spins down. First load can sit on a wiki-native loader ("Preparing the wiki workspace") for ~15s. That's infra, NOT a code bug — wait it out (poll until `!/Loading|Preparing/` and content present). Only flag if it shows a *naked* "Loading…" with no branded state, or never resolves.

## 6. Standard route + flow checklist

Surfaces: `/` (→ `/think?tab=home`), `/library`, `/think`, `/think?tab=concepts&concept=<name>`, `/wiki` (→ graph), `/wiki/workspace?page=<id>`.

Per pass, verify with evidence:
- **Nav** = Library / Think / Wiki (3, not 5). Single `<h1>`. No page h-scroll. No console errors (`read_console_messages` onlyErrors).
- **Agent identity** consistent ("Thought partner") across surfaces.
- **Home:** universal command, warm specific greeting, living pulse, telemetry strip.
- **Think:** index sorted by movement; posture switch (Concept/Question/Notebook); open a concept → reasoning draft editor + STRENGTHEN/CHALLENGE/CLARIFY + quiet-context margin + REFERENCES `n OUT · n IN` readout.
- **Wiki:** morning-paper briefing + counters; build a page and **watch in place** (the AT-311/AT-356 regression — body must fill without manual reload); Article/Talk tabs.
- **Connective tissue (the product):** pull-in must persist (counter increments, survives reload, backlink on target); promote-to-wiki must create a page.
- **Retrieval quality:** challenge/support and reference candidates must be claim-relevant, not raw-article/newsletter noise.
- **Mobile:** resize ~390px, check reflow + no h-scroll (note: the MCP may not force a true mobile viewport — say so).

## 7. Test-plan template (copy per run)

```markdown
# Test Plan — <build/feature> (<date>)
Method: live Chrome on noeis.io, JS-selector driven, evidence per claim. Stop on first error; UNVERIFIED if a tool fails.

## <Epic / Area> (AT-###)
- [ ] <check> — expected: <...>
  - Evidence: <screenshot id / DOM read / network>
  - Result: PASS | FAIL | UNVERIFIED
  - If FAIL: repro / actual / expected
## Cross-cutting
- [ ] nav 3 items, single h1, no page h-scroll, no console errors, dark+light, cold-start handled
```

## 8. Linear-filing convention

- **On the epic:** post an evidence-backed comment — a `## Live QA <date>` block listing PASS items (with the concrete evidence) and ❌ failures. Be honest about what you could NOT verify ("wired but not exercised end-to-end").
- **Per real defect:** a **sub-issue under its parent epic** with this shape:
  ```
  ## Summary (one line)
  ## Repro (numbered, exact route + action)
  ## Actual (what happened, incl. "zero network calls" / measured DOM numbers)
  ## Expected (incl. the network call / state change that should occur)
  ## Acceptance (checkable conditions)
  ## Notes (likely cause, related tickets)
  ```
- **Severity by user impact:** Urgent = core mechanic broken (pull-in, build refresh). High = key flow broken or trust-eroding (promote no-op, retrieval quality). Medium = contained visual/typo.
- **If you ever filed on bad data, retract explicitly** in a follow-up comment ("Retract the comment above — it was fabricated/based on failed tools"). Correcting the record matters more than a tidy ticket.
- **Flag ambiguous things as questions, not bugs** (e.g. "Flounder Mode" — intentional vs typo).

## 9. Known-defect watchlist (re-check each pass until closed)

- **AT-356** wiki build doesn't stream into the open reader (manual reload needed).
- **AT-355** pull-in PULL is a no-op (no edge persisted, no network call).
- **AT-357** promote-to-wiki no-op.
- **AT-358** retrieval surfaces irrelevant raw-article/newsletter noise.
- **AT-354** Think concept agent rail clips its own content (scrollWidth>clientWidth).
- **AT-353** "Flounder Mode" label — confirm intentional vs typo.
