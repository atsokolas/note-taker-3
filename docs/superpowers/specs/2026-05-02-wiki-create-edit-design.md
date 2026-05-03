# Wiki Create/Edit Design

**Date:** 2026-05-02

## Goal

Add a top-level Wiki workspace where users can create, edit, and maintain source-backed knowledge pages from anything they have captured or are currently exploring.

The first version should make Wiki feel like an active writing workspace, not a passive generated reference shelf. AI should help initiate and maintain pages, but the user remains in direct control of the page content, visibility, and source scope.

## Product Behavior

Wiki becomes its own first-class route at `/wiki`.

Notebook, Library, Concepts, Questions, highlights, articles, imports, approved working memory, and Thought Partner responses are inputs to Wiki. Wiki is the composed layer where the user turns those inputs into durable pages.

The user can create a Wiki page from many contexts:

- the Wiki index
- a typed idea
- a question
- a selected highlight
- an article
- a notebook entry
- a concept
- multiple selected sources
- pasted text
- search results
- a Thought Partner response

Every creation trigger enters the same pipeline:

1. The app creates a private draft Wiki page immediately.
2. The page opens right away.
3. AI infers the page title, page type, outline, relevant sources, and starter rich-text content.
4. The user edits the live page directly.
5. The AI/source panel remains available for citations, inserts, rewrites, and source review.

There is no pre-creation approval step. The draft status, private visibility, and source list make it clear that the initial page is editable and not final.

## Entry Points

### Wiki Index

`/wiki` should show:

- `New page`
- search across Wiki pages
- recent pages
- private/shared filters
- page type filters
- draft/published/archive filters

The empty state should invite page creation from any idea or source, not require a specific prompt format.

### Contextual Creation

The first implementation should include the Wiki index and one contextual `Create Wiki page` action where existing page context is already available. Additional source-surface actions are follow-up work.

Candidate contextual triggers:

- article page -> create from article
- highlight card -> create from highlight
- concept page -> create from concept
- question page -> create from question
- Thought Partner response -> create from response

The creation API should accept a generic `createdFrom` payload so more triggers can be added without changing the core data model.

## Page Lifecycle

### Status

Supported status values:

- `draft`
- `published`
- `archived`

New pages default to `draft`.

`Published` means the user considers the page useful and current enough for normal Wiki navigation. It does not imply public visibility.

`Archived` hides the page from default Wiki views while preserving it for history and references.

### Visibility

Supported visibility values for the first version:

- `private`
- `shared`

New pages default to `private`.

`Private` means only the owner can see and edit the page.

`Shared` is included from day one in the schema and UI so the product can grow into team and enterprise workflows. If the current app does not yet have full team identity or permissions, the first implementation may store the value and render a limited state rather than enabling broad collaboration.

The schema should be compatible with future enterprise visibility values such as:

- `team`
- `org`
- `restricted`
- `public_link`

### Source Scope

Supported source scope values for the first version:

- `entire_library`
- `current_item`
- `selected_sources`

New pages default to `entire_library`.

This default lets AI use all knowledge the user has access to. The user can limit scope when creating or editing a page.

## Page Types

Page type is metadata that changes the layout hints and AI drafting behavior. It should not be a rigid creation requirement.

Supported page types:

- `topic`
- `question`
- `project`
- `source`
- `person`
- `synthesis`

The app infers page type during AI drafting and lets the user change it later.

## Editor UX

The live Wiki page uses rich text editing. The implementation should reuse the app's existing TipTap dependency and editor patterns.

The page view should include:

- editable title
- page type control
- status control
- visibility control
- source scope control
- TipTap rich text editor
- right-side AI/source panel

The editor should autosave or save opportunistically with clear save state. The first version can use debounced `PATCH` saves if that matches existing Notebook behavior.

## AI/Source Panel

The right panel supports the hybrid editing experience after page creation.

Initial panel capabilities:

- show attached sources
- show relevant source suggestions
- insert cited material into the editor
- ask AI to expand, summarize, or rewrite a selected section
- show generation state and errors

The first implementation can keep rewrite/insert actions simple. The important product behavior is that the panel remains tied to the live page after the initial AI draft.

## Data Model

Add a new model: `WikiPage`.

### Fields

- `userId`
- `title`
- `slug`
- `pageType`
- `status`
- `visibility`
- `sourceScope`
- `createdFrom`
- `body`
- `plainText`
- `sourceRefs`
- `aiState`
- `createdAt`
- `updatedAt`

### Body

`body` should store TipTap JSON as the canonical rich-text document.

`plainText` should be derived from `body` and used for search, previews, and future embedding/indexing.

### Created From

`createdFrom` records the initiating context.

Suggested shape:

```json
{
  "type": "wiki_index|idea|question|highlight|article|notebook|concept|sources|paste|search|thought_partner",
  "objectId": "optional-source-object-id",
  "objectIds": ["optional-source-object-id"],
  "text": "optional user text or selected response",
  "label": "optional human-readable source label"
}
```

### Source References

`sourceRefs` records the material used or attached to the page.

Suggested shape:

```json
[
  {
    "type": "article|highlight|notebook|concept|question|memory|external",
    "objectId": "source-object-id",
    "title": "Source title",
    "snippet": "Short source excerpt",
    "url": "optional-url",
    "citationLabel": "optional-display-label",
    "addedBy": "user|ai",
    "createdAt": "timestamp"
  }
]
```

### AI State

`aiState` tracks generation and update state.

Suggested fields:

- `draftStatus`
- `lastDraftedAt`
- `lastError`
- `model`
- `sourceScopeAtDraft`

## Backend Routes

Add Wiki routes behind existing JWT auth.

```text
GET    /api/wiki/pages
POST   /api/wiki/pages
GET    /api/wiki/pages/:id
PATCH  /api/wiki/pages/:id
DELETE /api/wiki/pages/:id

POST   /api/wiki/pages/:id/ai/draft
POST   /api/wiki/pages/:id/ai/insert
POST   /api/wiki/pages/:id/sources
DELETE /api/wiki/pages/:id/sources/:sourceRefId
```

### Create Page

`POST /api/wiki/pages` creates the page immediately.

Required behavior:

- authenticate user
- default `status` to `draft`
- default `visibility` to `private`
- default `sourceScope` to `entire_library`
- accept optional `createdFrom`
- accept optional seed title/body
- return the created page

The frontend should call the AI draft endpoint after creation.

### AI Draft

`POST /api/wiki/pages/:id/ai/draft` populates or refreshes starter page content.

Required behavior:

- load the page for the authenticated user
- resolve source context from `sourceScope` and `createdFrom`
- call the AI service or local AI route used elsewhere in the app
- patch title, page type, body, sourceRefs, and aiState
- return the updated page

If AI fails, the page remains created and editable. The route records `aiState.lastError` and returns a recoverable error response.

## Frontend Architecture

Add Wiki frontend modules:

```text
note-taker-ui/src/api/wiki.js
note-taker-ui/src/pages/Wiki.jsx
note-taker-ui/src/components/wiki/WikiIndex.jsx
note-taker-ui/src/components/wiki/WikiPageEditor.jsx
note-taker-ui/src/components/wiki/WikiAiSourcePanel.jsx
note-taker-ui/src/components/wiki/WikiPageMetaBar.jsx
```

Route `/wiki` renders the index.

Route `/wiki/:id` renders the editor.

The main app navigation should include Wiki as a top-level destination.

## Data Flow

### New Page From Wiki

1. User clicks `New page`.
2. User enters any seed input or leaves it blank.
3. Frontend calls `POST /api/wiki/pages`.
4. Frontend navigates to `/wiki/:id`.
5. Frontend calls `POST /api/wiki/pages/:id/ai/draft`.
6. Editor updates as the draft response returns.
7. User edits and saves.

### New Page From Existing Object

1. User clicks `Create Wiki page` from a source object.
2. Frontend calls `POST /api/wiki/pages` with `createdFrom`.
3. Frontend navigates to `/wiki/:id`.
4. AI draft uses `createdFrom` plus default `entire_library` context.
5. User edits the live page.

## Error Handling

Page creation should be resilient. If AI drafting fails, the user still lands on an editable draft page.

Expected error states:

- AI unavailable
- source lookup failure
- save failure
- permission failure
- deleted or missing source object

The UI should present AI failures in the panel, not as full-page blockers.

Save failures should preserve local editor content and offer retry.

Permission failures should prevent access to pages not owned by the user. Future sharing must preserve this owner check and add explicit shared access checks.

## Testing

Backend tests:

- creates a private draft Wiki page by default
- lists only the authenticated user's Wiki pages
- updates title, body, status, visibility, and source scope
- rejects invalid status, visibility, page type, and source scope values
- deletes or archives a page according to the implemented route behavior
- AI draft route leaves the page editable when AI fails
- AI draft route patches title, page type, body, and sourceRefs when AI succeeds

Frontend tests:

- Wiki route renders index
- `New page` creates a page and navigates to the editor
- editor renders TipTap content
- metadata controls save changes
- visibility defaults to private
- source scope defaults to entire library
- AI/source panel shows draft errors without blocking editing

## First Implementation Scope

In scope:

- top-level Wiki navigation and routes
- WikiPage model
- authenticated CRUD routes
- TipTap-based page editor
- page metadata controls
- source scope and visibility fields
- immediate draft creation flow
- AI draft endpoint with graceful failure handling
- basic source panel showing attached sources and AI draft state

Out of scope for the first implementation:

- real-time collaborative editing
- full enterprise permissions
- public-link publishing
- bidirectional wiki backlinks
- Obsidian-compatible export
- advanced citation rendering inside TipTap nodes
- complex source filtering beyond entire library, current item, and selected sources

## Open Follow-Up Work

After the first version is working, the likely next increments are:

- richer contextual `Create Wiki page` actions across source surfaces
- source filtering by folder, concept, and date range
- backlinks between Wiki pages and source objects
- promoted/shared pages for teams
- enterprise policy controls for what can be shared
- Markdown export or Obsidian-compatible vault export
