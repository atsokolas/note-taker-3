# Search Performance Import Workflow

Use the internal `Search Opportunities` page when you want a fast local pass over pasted Google Search Console data without waiting on backend work.

## Supported paste shapes
- Query exports with headers such as `Query`, `Queries`, or `Top queries`
- Page exports with headers such as `Page`, `Top pages`, `Landing page`, or `URL`
- Combined query/page exports with `Clicks`, `Impressions`, `CTR`, and `Position`
- Tab-delimited copies from spreadsheets or CSV text exports

## What the page does
- Parses the pasted export client-side
- Aggregates duplicate query/page rows
- Buckets opportunities into:
  - `Existing page should be improved`
  - `New page should be created`
  - `Query is low quality or off-strategy`
- Keeps recommendations aligned to Noeis’s wedge:
  - reliable recall
  - concept formation
  - human-centered AI
  - serious reading workflows

## How to use it
1. Copy the relevant Search Console rows for the time range you care about.
2. Open the internal `Search Opportunities` page.
3. Paste the export, set the date range/source label, and run the analysis.
4. Use the generated execution brief for approval and execution.
5. After the change ships, validate signups and activation quality in Marketing Analytics.

## Heuristic notes
- The page prefers improving an existing matching page before suggesting a new page.
- New pages are only suggested when the query intent appears distinct from the current landing page.
- Low-quality buckets catch obvious off-strategy or low-signal queries so they do not distract from signup/activation work.
- The output is a triage aid, not a ranking oracle. Founder judgment still decides what ships.
