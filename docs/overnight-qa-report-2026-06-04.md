# Overnight QA Report — 2026-06-04

**Requested:** detailed functional sweep across all features, then a UI/UX sweep.
**Outcome:** BLOCKED on the authenticated app. Did what was possible without auth. Read this first thing.

---

## ⚠️ The blocker (why the full sweep didn't run)

**The browser session is logged out.** Every authenticated route (`/think`, `/wiki`, `/library`, all concept/wiki workspaces) redirects to the public marketing landing at `/`. The entire functional + in-app UI/UX sweep lives behind auth.

**I cannot log in for you.** Entering a password / authenticating is a prohibited action even when asked and even with credentials pre-filled in the browser — account access is yours to perform. So I could not run the in-app sweep tonight.

**To unblock:** log in at https://www.noeis.io/login (creds are pre-filled in the tab), then tell me to resume. The whole sweep then takes one pass.

---

## ✅ What I verified WITHOUT auth

### Deploy investigation (answers the open "did the fixes land?" question)
All four fix commits ARE on `origin/main`:
- `8e29f71` Fix Think connective tissue: scoped edges, wiki stream, retrieval quality (AT-355/358)
- `8b5af98` Fix Think pull/promote wiring and wiki stream refresh (AT-354/357)
- `f7db749` Fix wiki promote navigation query suffix (AT-357)
- `e836991` Fix Think connections and editorial rail polish (today 19:58 — the "UI fix")

Frontend deploys on **Vercel** (`.vercel/` present), backend on **Render**.

**Important:** my last live re-test (2026-06-03 23:41) showed AT-354/355/356/357 all still broken, but those commits were already merged. Two possibilities, can't disambiguate while logged out:
1. **Deploy lag** — merged to main but Vercel hadn't shipped the bundle at test time. (Most likely; today's `e836991` may already supersede.)
2. The fixes don't resolve the live repro.
**Action for the morning:** log in, then I re-run the AT-354/355/356/357/358 watchlist against the now-current build to confirm which.

### Public marketing site UI/UX sweep (this is genuinely good)
Routes checked: `/`, `/login`. Both clean.
- **Typography:** Newsreader serif throughout (hero h1 105px), zero Inter. On-brand.
- **Palette:** warm cream `rgb(255,252,247)`, body text `rgb(101,101,92)`.
- **Landing:** strong editorial hero ("Reading becomes notes. Notes become concepts…"), CAPTURE/SHAPE/CLARIFY columns, "FOR PEOPLE WHO READ SERIOUSLY" + five-minute tour, WHAT CHANGES rail. Reads like the vision.
- **Login:** clean two-column ("Return to your notebook"), username/password, register link, Chrome-extension mention.
- **No console errors** on `/`, `/login`.
- **No horizontal scroll** at 1440px on any public route.
- Nav: GUIDES / AI SECOND BRAIN / PRIVACY / LOGIN; footer adds SECOND BRAIN APP / PRIVACY POLICY / TERMS. Routes exist: `/guides`, `/ai-second-brain`, `/second-brain-app`, `/privacy`, `/terms`.

### Minor note (public site)
- Could NOT force a true mobile viewport — the Chrome MCP `resize_window` resized the OS window but the page stayed 1440px (innerW reported 1440 even at 390 request). Real mobile responsiveness needs a device or devtools pass. Not a bug, a test-tooling limitation — flagging so "mobile OK" is never claimed off a fake viewport.

---

## ⛔ NOT tested (blocked by logout) — the actual ask

Functional: Home (universal command/greeting/pulse), Think chassis + postures, Concept CHALLENGE/STRENGTHEN/CLARIFY, pull-in (AT-355), promote-to-wiki (AT-357), wiki build in-place refresh (AT-356), wiki morning-paper/metabolize, Library-as-source, knowledge map, connective-tissue backlinks.
UI/UX: in-app dark mode, spatial grammar, agent-rail clipping (AT-354), reading measure, register transitions, all in-app surfaces.

These are exactly the watchlist + the deep-dive items. All ready to run the moment you're logged in.

---

## Recommended first move in the morning
1. Log in.
2. Tell me "resume" — I re-run the AT-354/355/356/357/358 watchlist first (confirms whether tonight's commits fixed the live repros or it was deploy lag), then the full functional + UI/UX sweep, filing evidence-backed results per the playbook.
