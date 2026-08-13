# Note Taker UI

Frontend for the Note Taker web app.

This README is product-oriented so marketing, product, and engineering are aligned on what users actually see.

## What this product does

Noeis helps users ground what they learn, think with it, maintain durable synthesis, and improve consequential judgment over time.

Primary UX promise:

- Ground learning in Library
- Think in a native notebook
- Maintain durable, source-led Wikis
- Track decisions, outcomes, and lessons in Judgment

## Core rooms to reference in marketing docs

- `Library` (`/library`): folders and sources on the left, editorial reading in the center, and the Librarian on the right.
- `Think` (`/think`): a calm notebook where retrieved objects insert at the chosen prose position with provenance intact.
- `Wiki` (`/wiki`): the return surface for article-first, Library-grounded synthesis and human-reviewed maintenance.
- `Judgment` (`/judgment`): living cases that connect theses, decisions, reviews, outcomes, and retained lessons.

### Main screen: Think (`/think`)

Think is the primary writing workspace. The post-login return route is Wiki (`/wiki`).

Tabs and jobs:

- `Home`: continue recent work, working set, return queue, recent highlights/articles
- `Notebook`: draft and organize notes with inserted evidence
- `Concepts`: build concept workspaces, pin highlights, share read-only pages, export markdown
- `Questions`: track open questions and link them to concept scope
- `Handoffs`: coordinate tasks between user, native agents, and personal BYO agents
- `Paths`: follow concept-to-concept paths
- `Insights`: AI themes/connections (when AI service is enabled)

Right-side context area includes working memory and a context-aware Thought Partner panel.

### Settings (`/settings`)

Settings combines workspace controls and trust controls:

- Appearance: typography scale, density, accent, brand energy
- Onboarding: restart onboarding flow
- Agents & integrations: quick setup and advanced BYO controls
- Data integrations: jump to import workflows
- Export: JSON and PDF bundle exports

### Login + Register (`/login`, `/register`)

Messaging on auth pages reflects current onboarding:

- Chrome extension is optional
- Manual notes, paste import, markdown, and Readwise CSV are supported without extension
- Session expiry prompts users to log in again clearly

## Agentic capabilities

The app supports optional agentic workflows with user control:

- Thought Partner chat scoped to current workspace context
- AI-supported suggestions in concept workflows
- Handoff queue with explicit state transitions (claim/complete/reject/cancel)
- Orchestration policy for routing mode and task-type allowances
- Personal agent key management and BYO bridge token minting

## Related product pages

- `Data integrations` (`/data-integrations`): import and capture alternatives
- `Map` (`/map`), `Review` (`/review`), `Return Queue` (`/return-queue`), `Today` (`/today`): reinforcement and recall loops
- `How To Use` (`/how-to-use`): in-app onboarding narrative

## Development scripts

In `note-taker-ui/`:

- `npm start` - run dev server
- `npm test` - run tests
- `npm run build` - create production build
