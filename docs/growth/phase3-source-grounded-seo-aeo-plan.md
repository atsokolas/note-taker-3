# Noeis Phase 3 SEO/AEO Plan

## Objective
Move Noeis from a second-brain acquisition surface to a source-grounded research wiki category surface that drives signups into activation.

## Current Positioning
Noeis is a source-grounded personal research wiki for serious readers.

It helps people turn saved reading, highlights, notes, and open questions into evidence-backed wiki pages, drafts, decisions, and reusable insight.

Use `AI second brain` and `note-taking` language as acquisition terms, not as the primary category.

## Priority Metrics
- Non-branded qualified organic clicks
- Organic signup rate
- Organic activation rate
- First saved article from organic users
- First highlight from organic users
- First source-backed wiki page from organic users
- First draft or synthesis from organic users
- Bing AI citations after Webmaster Tools verification

## Immediate Execution
1. Publish the missing proof-layer page: `from-saved-article-to-draft-in-noeis`. Done.
2. Align homepage and software metadata around source-grounded research wiki language. Done.
3. Route Search Console draft and saved-article queries to the new page. Done.
4. Add metadata, structured data, and attribution hooks for shared wiki pages. Done.
5. Replace the test Bing verification file with a real token and deploy.
6. Feed Search Console and Bing exports into the Search Opportunities importer weekly.
7. Add backend activation events for source-backed wiki creation, source attachment, and AI draft generation. Done.

## Next Content Cluster
- Personal research wiki for serious readers
- Source-grounded AI notes
- Readwise to research wiki
- Evidence-backed writing workflow
- Private wiki vs notes app
- AI research assistant with citations
- How founders turn reading into decisions
- How researchers turn sources into claims

## Shared Wiki AEO Surface
Shared wiki pages are a growth surface, but they need quality control before broad indexing.

Next implementation steps:
- Add dynamic metadata for shared wiki pages. Done.
- Add `CreativeWork` JSON-LD when public source references exist. Done.
- Add a curated examples page for intentionally public high-quality shared wikis.
- Track shared wiki views and adoption clicks as marketing attribution inputs. Done.
- Track shared wiki adoption as a downstream activation milestone. Done.
- Keep low-quality, private, or incidental shared pages out of indexing unless intentionally published.

## Activation Instrumentation
Done:
- `wiki_page_created` counts source-backed wiki page creation as an activation event.
- `wiki_source_attached` counts attaching source provenance to a wiki page as an activation event.
- `wiki_draft_generated` counts maintained AI wiki drafts as an activation event.
- `wiki_shared_adopted` counts successful adoption of a public page, collection, or starter pack into a user's workspace.
- The marketing funnel now includes these wiki events when attributing organic signup to activation.

Remaining:
- Add production Search Console and Bing exports to rank examples/proof pages by impression-to-signup opportunity.
- Surface wiki-specific activation breakdowns in the marketing analytics UI. Done.

## External Search Tooling
- Verify `www.noeis.io` in Bing Webmaster Tools.
- Replace `test-bing-verification` with the real Bing verification token.
- Set a real `INDEXNOW_KEY`.
- Submit the sitemap in Bing Webmaster Tools.
- Review Bing AI Performance once citation data exists.
