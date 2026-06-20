# Spec — "The door" punch-list (onboarding funnel gaps, live-tested 2026-06-19)

**Authors:** Athan + Claude (live walk-through of the onboarding + adoption build on `https://www.noeis.io`)
**Context:** The Show → Feed → Build → Hook arc (`/onboarding/wiki`), starter packs, paste ingest, adoption, and the 6h scheduler are all **built and working live** — ~90% of `noeis-onboarding-spec-2026-06-18.md` + `noeis-wiki-adoption-spec-2026-06-18.md` shipped. This punch-list is the remaining gaps found by actually walking the funnel as a user. Ranked P0→P3.

## ⚠️ MANDATORY live-confirmation protocol (same as the polish spec)
An item is **not done** until reproduced on production and the **raw evidence pasted in the PR**: the exact action/URL, the literal before/after (DOM text, console value, screenshot of the screen, timing). A passing unit test does **not** close an item. If you can't paste production proof, mark it **NOT CONFIRMED** and leave it open. (This protocol exists because items have been reported done while production disagreed — verified twice this week.)

---

## P0 — The door doesn't auto-open for new users
**The single highest-leverage fix. Without it, the entire onboarding build is invisible to organic signups.**

### Live symptom
A brand-new / zero-content user who signs up and lands organically goes to `/wiki` — the empty "Nothing here yet — let's start your wiki" state — **not** the onboarding arc. The Show→Feed→Build→Hook flow only fires if you (a) navigate to `/onboarding/wiki` directly, or (b) arrive via a shared-link adoption (`SharedWikiPage.jsx` routes to `/onboarding/wiki?...`). Organic new users never see the funnel we built.

### Root cause
There is no first-run redirect. The arc lives at route `/onboarding/wiki` (`note-taker-ui/src/pages/WikiOnboarding.jsx`) gated only by `localStorage` key `noeis.wikiOnboardingComplete`, but nothing routes a new/zero-content user to it. `WikiFrontPage.jsx:201` renders the static empty state instead.

### Fix
Route genuinely new / zero-content users into `/onboarding/wiki` automatically. Two acceptable approaches:
1. A guard on app entry / `/wiki`: if the user has zero wiki pages AND `noeis.wikiOnboardingComplete` is not set → redirect to `/onboarding/wiki`. (Prefer a server-truth "has any content" check over localStorage alone, so it survives device changes and doesn't fire for returning users who cleared storage.)
2. Or make the `/wiki` empty state *be* the arc's entry — replace the "Nothing here yet" dead-end with the Show screen / a prominent "Start your wiki" that launches the arc.
Must NOT fire for users who already have content or have completed onboarding. Must be resumable.

### Live confirmation (paste in PR)
- Create/Use a genuinely empty account (or a test user with zero wiki pages). Log in fresh. Confirm you land in `/onboarding/wiki` (or the arc-entry empty state), NOT a static "Nothing here yet" dead-end. Paste the landing URL + screenshot.
- Confirm a populated/returning account does NOT get redirected into onboarding. Paste evidence.

---

## P1 — Dead air in the build narration (the bounce point)
**The build works but looks hung at the most important moment in the funnel.**

### Live symptom (measured)
On the Build screen, the paste→page build took **~60–70 seconds total**, and sat **~35 seconds frozen on a single line** ("Reading the material and choosing the useful shape…") with zero visible movement before the next narration line appeared. The counter stayed `1 page · 0 claims · 1 link` during the freeze. A first-time user reads that as "it hung" and leaves — at the exact moment the product is supposed to wow them.

### Root cause
The narration maps 1:1 to the wiki draft SSE stages (`maintaining → drafted → saved → graph_synced → complete`, `WikiOnboarding.jsx` stageCopy ~lines 15–21). The gap between `maintaining` and `drafted` is where the heavy LLM work happens — one stage, no sub-updates — so the UI shows nothing for ~30s+.

### Fix
Keep the screen alive during the long `maintaining→drafted` gap. Options (do at least one):
1. Emit finer-grained progress from the maintenance stream during the long step (e.g. "selecting sources", "drafting", "materializing" — these strings already appear later; surface them as they happen, not in a burst at the end).
2. Add a lightweight always-moving affordance (a subtle pulsing "still working…" / elapsed indicator / shimmer on the active line) so it never looks frozen — without becoming the spinner the spec forbids.
3. Consider building/streaming the page first with a thinner first pass so something readable appears faster, then enrich.
Target: no visible stall longer than ~3–4s on the build screen.

### Live confirmation (paste in PR)
- Run the paste path on production, time it, and confirm there is no >~4s stretch with zero on-screen change. Paste the timing + the narration sequence with rough timestamps.

---

## P2 — "Show" screen undersells; paste auto-titles are ugly

### 2a. Show is a teaser, not a demonstration
**Symptom:** Screen 1 shows just a title + one-sentence teaser ("Loss Aversion — People often feel losses more sharply…") under "This is what Noeis builds from your reading." The spec wanted a **real, gorgeous example page** rendered (read-only) so the promise is *shown*, not stated.
**Fix:** Render an actual rich example wiki page (or a faithful excerpt with sections/claims/citation marks) on the Show screen so "look what you'll get" is demonstrated. `WikiOnboarding.jsx` Show step (~lines 258–269).
**Confirm:** Screenshot the Show screen displaying a real multi-section example, not a one-liner.

### 2b. Pasted pages get ugly auto-titles
**Symptom:** Pasting raw text created a page titled **"Spaced repetition is a learning technique where you"** — the first ~8 words of the paste, truncated mid-sentence. First impression of the artifact looks sloppy.
**Root cause:** The paste/url ingest → `createWikiPage` path derives the title from the leading words of the body when no title exists (`server/services/import/urlTextIngest.js` / the create path in `WikiOnboarding.jsx buildFromPaste` ~lines 176–222).
**Fix:** Derive a clean concept title — for URL ingest use the page `<title>`/`og:title` (already fetched); for raw text, have the agent name the concept (it's about to read the text anyway) instead of truncating the first sentence. Trim to a noun-phrase title.
**Confirm:** Paste a paragraph on production; confirm the resulting page title is a clean concept name (e.g. "Spaced Repetition"), not a sentence fragment. Paste the title.

---

## P3 — Polish & smaller spec gaps

### 3a. Attribution line not rendered
`adoptedFrom` is stored and serialized but no UI shows the specced *"Adapted from a shared Noeis wiki · <date>"* line on adopted pages. Add a quiet attribution line on the adopted page header (`note-taker-ui/src/components/wiki/WikiPageReadView.jsx`). Origin user identity stays hidden (already the case). **Confirm:** adopt a page, screenshot the attribution line on the resulting page.

### 3b. Browser-extension nudge missing from the Hook
Spec wanted the cold-path Hook to nudge installing the browser extension / share-sheet so saving becomes a habit; live Hook only offers "Connect reading" (Readwise/Notion). Add the extension nudge for the cold (paste/pack) path. (`WikiOnboarding.jsx` Hook ~lines 323–354.) **Confirm:** screenshot the Hook showing the extension nudge.

### 3c. Visual polish
- Starter-pack cards are pill/blob-shaped and the **label text overflows the rounded edges** (e.g. "BEHAVIORAL ECONOMICS & DECISION-MAKING" spills past the pill). Fix the card shape/padding so text fits. (Feed step.)
- The **"Make this mine"** adopt button — the key growth-loop CTA — renders as a small plain grey button. Make it a prominent primary CTA (it's the entire viral loop). (`note-taker-ui/src/pages/SharedWikiPage.jsx` ~line 163.)
**Confirm:** screenshots of the Feed cards (no overflow) and the shared page (prominent adopt CTA).

---

## Summary / ranking

| P | Item | Why it ranks here |
|---|---|---|
| **P0** | Auto-redirect new users into the arc | Without it, the whole onboarding build is invisible to organic signups |
| **P1** | Kill dead-air in build narration | The bounce point — looks hung for ~35s at the wow moment |
| **P2a** | Show a real example page | The "look what you'll get" promise is undersold |
| **P2b** | Clean pasted-page titles | First artifact looks sloppy ("…learning technique where you") |
| **P3a** | Render attribution line | Spec'd, data exists, UI missing |
| **P3b** | Extension nudge in Hook | Cold-path habit loop |
| **P3c** | Card overflow + weak adopt CTA | Polish; adopt CTA is the growth loop |

**Suggested split:** P0 + P1 are the funnel-critical pair (do first, likely 1 frontend + 1 full-stack hand). P2/P3 are mostly frontend polish (Cursor-friendly). Everything verified live, before/after pasted, per the protocol above.

## What's already confirmed working (do NOT re-touch)
Show/Feed/Build/Hook arc renders and completes; paste-link/text endpoints; 4 starter packs as adoptable collections; live narration + climbing counter (no spinner); Hook return-loop card; `/share/wiki/:id` "Make this mine" + fork framing + privacy note; logged-out adopt → signup → onboarding handoff; provenance schema; collection sharing; 6h scheduler; cold-page maintenance.
