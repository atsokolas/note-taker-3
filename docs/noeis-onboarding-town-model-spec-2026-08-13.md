# Noeis onboarding — current state walkthrough + Town-model rebuild

Date: 2026-08-13
Status: built — stages S1-S6 shipped and verified live (see Part 5)
Scope: signup → first page → extension → imports → public-wiki fork

---

## Part 1 — What onboarding actually does today

Read from source at `codex/noeis-design-finish-2026-07-26`. Not observed live; every
claim below cites the file that produces the behavior.

### 1.1 The path a new user walks

1. **`/register`** — `components/Register.js`. Username + password. The Chrome
   extension is mentioned in body copy with a store link (`Register.js:115`); there is
   no install step.
2. **On success → `navigate('/login')`** (`Register.js:79`). The user fills a second
   form to enter the product they just created an account for.
3. **`/login`** — `components/Login.js`. On token, honors
   `sessionStorage.auth_return_to` if set (`Login.js:72`), otherwise falls through to
   the authenticated shell.
4. **Authenticated `/` → `Navigate to="/wiki"`** (`App.js:569`).
5. **`WikiFrontPage`** loads pages + briefing. If `hasAnyWikiContent === false` and
   `localStorage['noeis.wikiOnboardingComplete'] !== 'true'`, it redirects to
   `/onboarding/wiki` (`WikiFrontPage.jsx:231-237`).
6. **`/onboarding/wiki`** — `pages/WikiOnboarding.jsx`, four steps:
   - `show` — a static example page ("Loss Aversion") demonstrating output shape.
   - `feed` — starter packs (`GET /api/public/wiki/starter-packs`), a
     `Connect Readwise or Notion` link to `/connections`, and a paste box.
   - `build` — **the best thing in the current onboarding.** `runBuildNarration`
     streams real agent stages ("Reading the material…", "Connecting the page to the
     graph…") with a live draft preview and a page/claim/link counter.
   - `hook` — "Your first page is ready", links to the wiki, `/connections`, and
     `/connections#capture` ("Set up browser save"), plus the `ReturnLoopCard`
     promising tomorrow's Morning Paper.
7. **In parallel**, `TourManager` (`App.js:564`) auto-starts a 5-step product tour for
   any first-time visitor (`TourManager.jsx:67-75`) and auto-navigates to the current
   step's route.

### 1.2 The public-wiki fork path that already exists

`SharedWikiPage.handleAdopt` (`SharedWikiPage.jsx:397`):

- Logged out → writes `auth_return_to = /share/wiki/:id?adopt=1`, sends to `/register`.
- Logged in → `adoptPublicWikiPage`, then, when the return carried `?adopt=1`, routes to
  `/onboarding/wiki?adoptedPage=<id>&source=shared`, which opens directly on the
  `hook` step with "This wiki is now yours."

So a fork-driven onboarding **exists and is wired end to end**. It is just unreachable
from anywhere a new user would actually start.

### 1.3 Defects found while tracing it

| # | Defect | Evidence |
|---|---|---|
| D1 | `OnboardingManager.jsx` is dead code — never imported or mounted anywhere. | grep: only self-references |
| D2 | `OnboardingChecklist` renders only on `/how-to-use` (`HowToUse.jsx:232`) and is **manual checkboxes in localStorage** — the user ticks their own boxes; no real completion signal. | `OnboardingChecklist.jsx:28-37` |
| D3 | **Two systems auto-drive the new user at once.** `WikiFrontPage` pushes to `/onboarding/wiki`; `TourManager` simultaneously auto-starts and auto-navigates to `/think?tab=home`. `/onboarding/wiki` is absent from `TOUR_AUTONAV_BLOCKED_PREFIXES`. | `WikiFrontPage.jsx:233`, `TourManager.jsx:34-39, 88-96` |
| D4 | Tour step 1's target `[data-tour-anchor="install-extension"]` **does not exist anywhere in the codebase**. The install-the-extension step points at nothing. | `tourConfig.js:9` vs. grep of `data-tour-anchor` |
| D5 | `/connections#capture` is a **dead anchor** — there is no `id="capture"` and **no extension install card anywhere in the product**. | `WikiOnboarding.jsx:434`, `DataIntegrations.jsx` id scan |
| D6 | The only in-app route to the extension is a `Chrome Extension` item in the account dropdown. | `App.js:545-549` |
| D7 | Extension "connected" flips only when the user opens the extension popup while logged in (`popup.js:95`). Installed-but-never-opened is indistinguishable from not installed. | `popup.js:95`, `useTourSignal.js:32` |
| D8 | `Register` → `/login` forces a second manual sign-in. | `Register.js:79` |
| D9 | `/proof` (the public gallery) has **no adopt CTA**. Cards link to "Inspect the maintenance proof" only. Forking is reachable only from a `/share/wiki/:id` deep link. | `PublicProofGallery.jsx:138-141` |
| D10 | Public forkable wikis have **no browse surface**. Forking is reachable only from a `/share/wiki/:id` deep link somebody handed you. | `wikiRoutes.js:4650`, no consuming page besides `WikiOnboarding` |
| D11 | Onboarding completion is `localStorage['noeis.wikiOnboardingComplete']` only — re-fires on a second browser, and cannot be measured server-side. Tour state, by contrast, *is* server-side. | `WikiOnboarding.jsx:13`, `server.js:3631` |

**Summary judgment:** there are three onboarding systems (checklist, tour, wiki
onboarding), two of them auto-driving, one dead, and the single most-requested install —
the Chrome extension — has no working surface in the product at all.

---

## Part 2 — What Town does, and the four mechanics worth stealing

Town (town.com, $55M a16z/Forerunner Series A) is an AI chief-of-staff. Four mechanics:

1. **You make something before you give something.** First screen is creating your
   "Townie" — an animal you name and shape. Emotional ownership precedes any data
   request.
2. **The agent asks for access in its own voice, with a stated payoff** — one ask at a
   time, not a settings grid.
3. **Permission is a dial, not a switch.** Approval-required defaults, per-action
   control, an audit log.
4. **Ingest → suggest, never interrogate.** It reads context and proposes work. The user
   never has to learn the product's vocabulary.

**The fifth thing, which matters most here:** Town does not make all its asks during
onboarding. It asks for the next thing when it hits a wall, across weeks. Onboarding
carries **one** ask.

**Translation to Noeis:** no mascot needed — the thing the user owns is the body of
knowledge itself. And Noeis already beats Town on mechanic #4: `runBuildNarration` shows
the agent thinking in real time, and the return loop is a real overnight-work promise.

---

## Part 3 — The rebuild (decided)

Two entrances, one system. The wiki build is **always backgrounded** — it is too slow to
hold a new user on a spinner. The user is doing something useful while it runs, and the
finished wiki is the payoff at the end.

### 3.1 Fork path — arrived on a public wiki

**Make it mine → create account → import → land on the wiki.**

1. **`Make this mine`** on any public wiki or proof card. Adoption starts server-side
   immediately and returns a run id.
2. **Create account** — one form, auto-authenticated, no second login. (D8)
3. **Import + extension** — both asks, while the fork builds behind them. Readwise /
   Notion OAuth, a paste box for anyone with neither, and the extension install card.
   Skippable, but framed honestly: *"You have pages. You have no sources yet — your copy
   can't diverge from the original until you feed it."*
4. **Land on the wiki.** If the fork has settled, it is simply there. If not, the wiki
   renders with an ambient build state rather than a blocking screen.

No subject question — the fork already declared the subject. **The walkthrough is offered,
not run:** they arrived with intent and have pages immediately, so there is no dead time
to fill, but they still have not learned how to feed the wiki. A persistent "Show me
around" affordance sits on the landed wiki and runs the same walkthrough as §3.2.

### 3.2 Cold path — arrived at noeis.io with nothing

**Dump or import → build starts in the background → walk them through the product →
deliver the finished wiki.**

1. **One screen, one box: "Paste something you've been reading."** Readwise / Notion
   connect sit beside it at equal weight. Paste is the hero because OAuth is a large ask
   from a product they have used for zero seconds; Readwise wins the moment they have it.
2. **Kick off the build and leave immediately.** No spinner, no narration screen. The
   run id goes to `SystemStatusContext` as background work.
3. **Walk them through the product while it builds.** This is the walkthrough's real
   job, and the only justification for its existence:
   - **Library** — "The 214 highlights I just read are in here." Their material, named.
   - **Reading room** — how a highlight gets captured and stays attached to source.
   - **The one ask: the extension.** This is its natural home — it lands exactly where
     the user is being shown how material arrives, and it fills build time productively.
   - **Think / notebook** — one stop, brief.
   - **The reveal** — "Your wiki is ready."
4. **Land on the wiki.**

Rules for the walkthrough:

- **Every stop references their actual material**, never generic UI. A tour over empty
  screens is worse than no tour.
- **Progress is ambient and always escapable.** A persistent "Building your wiki — 2 of
  7 pages · Take me there now" affordance. Never trap them in the walkthrough.
- **It is pace-flexible in both directions.** If the build finishes early, offer the jump
  immediately. If the user finishes the walkthrough first, hold on a live progress state,
  not a dead end.
- **It always runs, but it scales to the build.** A single pasted link builds far faster
  than a 200-highlight Readwise import. The walkthrough still runs in both cases — its job
  is teaching the loop, not filling time — but it is visibly short and skippable when the
  build is small, so it never reads as stalling.
- **Failure has a path.** If the build partially fails, the walkthrough ends on
  *"I hit a wall on 2 of these — here's what I got"*, using the recoverable-failure slot
  that `SystemStatusContext` already carries. It never ends on nothing.

### 3.3 Where the cut asks go

Deferred out of onboarding entirely, surfaced at the moment of need:

| Cut | New home |
|---|---|
| Notion / Evernote / file import | First time the agent runs out of material |
| The permission dial | On the **first receipt**, where it can be decided against evidence rather than in the abstract |
| "Tomorrow's Morning Paper" | Content of the final screen, not a step |
| The 5-step tour, the checklist | Deleted; the cold-path walkthrough replaces both |

### 3.4 Cold path merges into the fork path

Once the first page is built, the agent can name the subject it inferred and offer to
grow it: *"This is about AI infrastructure economics — I can add three related pages, or
start you from this pack."* One pasted article is a note, not a wiki; this is the beat
that makes it a graph. It also means **the cold user gets offered a fork once they have
shown you what they care about** — one system, two entrances.

### 3.5 What a fork actually copies — the layer boundary

**You fork a wiki. You never import a library.** This is a hard product line, and the
implementation already honors it: adoption returns pages only
(`wikiRoutes.js:4667`, `adoptStarterPackForUser`) and never the origin owner's sources.

- **Wiki layer (forked):** pages, claims, internal links — the synthesized output.
- **Source layer (never forked):** the user's Library — saved articles, highlights, notes.
  This stays theirs and starts empty. They build it, always.

Two consequences that shape the copy everywhere:

1. **Do not call the forkable surface a "library."** `/library` is an existing product
   surface meaning the user's own source corpus; reusing the word for public forkable
   wikis collides with it. Call them what they are — **public wikis you can fork**.
2. **This is exactly why import is a fork-path ask.** A fresh fork is pages with no
   sources underneath them. Until the user feeds it, their copy is a duplicate rather
   than a divergent, maintained thing. The ask writes itself.

### 3.6 Supporting work this requires

- **Public wiki funnel** (D9, D10): adopt CTA on `/proof`; a browsable index of public
  wikis available to fork. Inventory is **existing public wikis** — not an authored
  content library — so this surface has real material the day it ships.
- **Extension install card** (D5, D6): real surface at `/connections#capture` with
  `id="capture"`, rendered inline at the walkthrough's extension stop, carrying
  `data-tour-anchor="install-extension"` (D4).
- **Real install detection** (D7): content-script handshake on noeis.io so the app can
  tell *not installed* / *installed, not signed in* / *connected* apart, instead of only
  learning when the popup opens.
- **Backgrounded build**: `getWikiIngestRun(runId)` + `SystemStatusContext` already
  provide the polled-run and ambient-background-work seams. The build must be observable
  and resumable server-side.
- **Connect returns to a receipt, never a settings page.** `DataIntegrations` already
  computes `importStats.importedArticles` / `importedHighlights`; the missing piece is
  routing the OAuth return back into onboarding with those numbers as agent speech.
- **Onboarding state moves server-side** next to tour state (D11) — required anyway once
  the build spans a session.
- **Delete `OnboardingManager.jsx`** (D1) and the self-ticked checklist (D2).
- **One auto-driver only** (D3).

### 3.7 Settled: the account gate

**Signup comes before the build, on both paths.** Anonymous/session-scoped workspaces are
explicitly out of scope. Every build runs against a real authenticated account, which also
means the run record and onboarding state have an owner from the first moment — see D11.

---

## Part 4 — Suggested sequencing

| Stage | Work | Why here |
|---|---|---|
| **S1** | D3 (one auto-driver), D8 (auto-login), D1/D2 (delete dead code) | Pure subtraction; stops the race and the double sign-in |
| **S2** | Backgrounded build + ambient progress + escape affordance | Everything downstream depends on the build not blocking |
| **S3** | Extension install card, D4 anchor, D7 detection | The explicitly requested gap, and today fully absent |
| **S4** | Cold-path walkthrough over the running build | Only buildable once S2 and S3 land |
| **S5** | Fork funnel — `/proof` adopt CTA, browse surface for public forkable wikis, fork → account → import + extension → wiki | Opens the highest-intent entrance; reuses an adopt path that already works |
| **S6** | Connect-returns-to-receipt, D11 server-side state, the dial on first receipt | The Town feel and the measurement |

## Acceptance discipline

No stage is done on a code read. Each requires a real signup on a disposable account,
driven through the authenticated routed UI with no mocked responses, with the receipt or
persisted state verified after reload — per the standing evidence rules in `AGENTS.md`.

## Sources on Town

- [Town Raises $55M Series A from a16z and Forerunner](https://finance.yahoo.com/sectors/technology/articles/town-raises-55m-series-a16z-134500847.html)
- [How Town Became Silicon Valley's New Favorite AI Tool](https://inc-1-smart-business-story.beehiiv.com/p/how-town-became-silicon-valley-s-new-favorite-ai-tool)
- [Fortune — a16z and Forerunner bet $55M on Town](https://fortune.com/2026/06/03/towns-ai-assistants-andreessen-horowitz-forerunner-55-million/)

---

## Part 5 — What shipped

All six stages are built, verified against a live isolated stack with disposable
accounts, and pushed. Branch note: the first four landed on
`feat/onboarding-detached-build`; the last two landed on `feat/reading-loop`, which
another agent cut from that branch and checked out in the shared working tree
mid-effort. That branch contains all of this work.

| Stage | Shipped | Defects closed |
|---|---|---|
| S1 | One auto-driver, auto sign-in on register, dead code deleted | D1, D2, D3, D8 |
| S2 | Detached build (202 + polled `aiState.draftStatus`), ambient banner | — |
| S3 | Extension card, real three-state detection, tour anchor and route | D4, D5, D6, D7 |
| S4 | First-run walkthrough over the running build, ending on the Paper | — |
| S5 | Fork CTA on `/proof`, forkable-wiki browse with page preview | D9, D10 |
| S6 | Server-side onboarding state, Notion import receipt | D11 |

### Decisions taken during the build, and why

- **The tour was not deleted, then was neutered.** S1 deferred its auto-start until
  onboarding finished; the live run showed that only moved the collision — the tour
  grabbed the user the instant they reached home. It no longer auto-starts at all
  and remains reachable via `?tour=resume`. The walkthrough (S4) is its replacement.
- **The detached build fails closed.** Pages needing acceptance review or a repo
  build lease get a 409 pointing at the synchronous route rather than quietly
  skipping those gates.
- **Home is the Paper.** Onboarding ends there, and the walkthrough's last stop
  introduces it — which answers the objection behind keeping the landing on the
  wiki, since a new user no longer meets an empty Paper cold.

### Found while building, fixed

- The detached build raced the source-event worker over the same page and rendered
  the resulting Mongoose `VersionError` to the user verbatim. Now uses the route
  module's existing `savePageWithVersionRetry`; the driver message stays in the log.
- `useTourSignal` dragged the tour API layer (and axios) into every consumer via
  `TourProvider`. `TourContext` extracted to its own module.
- The first-run gate's effect re-runs on every route change, and sign-in bounces
  through several routes fast; its cleanup was cancelling the in-flight check while
  the "already checked" guard blocked the retry, so a new user silently never
  reached onboarding. Cancellation now tracks unmount only.

### Deferred, deliberately

- **The permission dial on the first receipt.** Noeis maintaining your own wiki
  pages is lower stakes than an agent acting in your inbox, and the decision is
  better made against a real receipt than in the abstract during setup. Not built.
- **Fork preview before signup** (an anonymous session-scoped workspace). The
  forkable-wiki cards now show the exact page titles a fork would create, which
  covers most of the value without the backend.

### Known, not caused here

`note-taker-ui/src/styles/wiki-critical.css` is 34,400 bytes against the 32,768
budget its test asserts, and has been throughout. Byte-identical to before this
work; untouched by it. It is the only failing suite.
