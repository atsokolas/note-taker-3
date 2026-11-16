# Public shared wiki visitor repair, November 16, 2026

## Reproduction

Fresh Chromium contexts, no cookies or saved auth, 1440×900 and 430×900. Production URLs:

- `/share/wiki/collection/how-to-think-about-ai` (5 entries)
- `/share/wiki/collection/mental-models` (7 entries)
- `/share/wiki/collection/behavioral-economics` (6 entries)
- `/share/wiki/collection/value-investing` (5 entries)

“Cut off” was the entry body, not a failed collection fetch or a stopped render. Every one of the 23 bodies was limited to 224px (`max-height: 14rem`), hidden overflow and a gradient mask. The DOM held the complete text, but visitors could not see the lower paragraphs. The collections themselves scrolled to their last cards. No collection console/render error was observed.

“Not openable” was a missing interaction: every entry heading was plain text, and every collection contained zero entry links. There was no entry click/back flow to test. These are starter packs, whose public payload has synthetic `starter:...` IDs. Their plain slugs are not standalone published wiki pages: the five AI entry slugs tested via `/share/wiki/<slug>` rendered “Shared page unavailable” with public-page API 404 responses. Those guessed standalone URLs were not links offered by the collection.

## Repair

- Remove the clipping and fade from collection entry bodies.
- Link titles to `/share/wiki/collection/:idOrSlug/:entryId`.
- Resolve nested entries only from the existing public-safe collection response, including direct loads. No new backend endpoint or auth change.
- Render the unchanged body and public source references in both views. Citation clicks scroll within the entry’s own references, not another card's sources.
- Provide an explicit collection back link and a calm unavailable state for an unknown entry.
- Keep internal/private wiki links inert. No content, citation values, publishing status or stored data changes.

`CollectionEntryBody` replaces duplicated inline body rendering. The new smoke file/config replaces no existing tests; it adds the missing real-browser visitor gate.

## Verification

- New browser smoke also failed on all 8 production combinations before release because there were no entry links.
- Independent scoped review found no blocking correctness/privacy issue. Its suggested full-text, source-URL and citation-scroll assertions were added to the smoke.
- Regression tests first: 3 new navigation assertions failed before implementation, then passed.
- Focused UI tests: SharedWikiCollectionPage and SharedWikiPage, 31 passed. This is scoped coverage, not a full repository suite.
- Production UI build passed. Existing Node proxy/deprecation warnings remain; no new build error.
- Signed-out browser smoke: all 8 collection/viewport combinations passed against the local frontend and unchanged live public collection API. For every entry: click from collection, verify full body/references, browser Back and Forward, direct URL load, explicit collection back link. All 23 entries at both widths, no page/console errors, no horizontal overflow, and no clipped card bodies. Screenshots captured for each collection and each entry.
- Production remains unchanged until this PR is merged and deployed. Local success is not a live-release claim.

## Repeatable smoke

Start a local frontend on 3016 with the public read-only API:

```sh
REACT_APP_API_BASE_URL=https://note-taker-3-unrg.onrender.com PORT=3016 BROWSER=none npm --prefix note-taker-ui start
cd note-taker-ui
npx playwright test --config=playwright.shared-wiki.config.js
```

For an existing preview or production deployment:

```sh
PLAYWRIGHT_BASE_URL=https://www.noeis.io npx playwright test --config=playwright.shared-wiki.config.js
```

No writes, adoption, registration or source-link visits occur. The test uses fresh signed-out contexts and fails on missing entry links, clipped bodies, page errors, broken direct URLs or round trips. Browser artifacts are stored under ignored `tmp/shared-wiki-smoke`; production before screenshots/metrics under ignored `tmp/wiki-evidence` in the implementation checkout.
