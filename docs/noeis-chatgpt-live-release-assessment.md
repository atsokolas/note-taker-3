# Live-account release assessment — 2026-10-03

Owner authorized deployment to existing NOEIS hosting and real-account testing. Marketplace publication, new paid services, and added charges remain excluded. Owner personally grants OAuth at action time. Synthetic testing ended with zero grants/tokens; owned tunnel/API/database/private login files were removed. Existing private ChatGPT entry points to an inactive random hostname and must be updated to the stable API before real-account consent.

## Scope and current base

Fetched main is 28c23be1 (PR471 reading-place fix), ahead of original f466c9f6 base. Main changes six ArticleReader/selection files, with no overlap in this feature's edited paths; feature must merge latest main and repeat affected verification. PR470 feature HEAD before preparation is25a2492e. Draft currently contains65files,3569 additions/42deletions, including tests/docs/package/test runners; runtime changes are concentrated in OAuth/scoped-token middleware, hosted MCP client, source-thought CAS receipts, Notebook agent authentication, Wiki candidate holding, and consent UI. No production reset/stash required.

## Existing hosting and proposed public configuration

Existing Render service srv-cu084j1u0jms73ct6pe0, workspace tea-cu06oglsvqrc73be2l30, branch main, root repo, npm install build/node server/server.js startup, free plan, one instance. Auto-deploy watches server/** and package manifests. Last observed live Render commit is f466c9f6; PR471 UI-only changes do not trigger that filter. Existing Vercel serves www.noeis.io; release must verify its main commit separately.

Set only nonsecret values with a merging environment update (never replace or pull existing secrets):

- NOEIS_CHATGPT_OAUTH_ISSUER=https://note-taker-3-unrg.onrender.com
- NOEIS_CHATGPT_MCP_RESOURCE=https://note-taker-3-unrg.onrender.com/mcp
- NOEIS_APP_URL=https://www.noeis.io
- NOEIS_CHATGPT_OAUTH_CLIENTS=[{"client_id":"noeis-chatgpt-review","client_name":"NOEIS private review","redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"]}]

Internal hosted MCP defaults to its trusted loopback process PORT; no unknown PORT should be overwritten. JSON response option is optional and default SSE is tested; no need change existing mode. Native UI uses User-Defined OAuth Client, none, S256; client ID is public, with no generated client secret. Do not change existing database, JWT, model, worker or billing credentials.

## Persistence/startup effects

Adds ChatgptOAuthRequest, ChatgptOAuthGrant, ChatgptOAuthControl collections with unique/index/TTL definitions. Mongoose uses existing connect settings; index provisioning/runtime permissions must be verified, not assumed. Existing Article highlights gain optional revision/operation receipt fields; AgentToken gains optional OAuth family/client/resource fields. No backfill, drop, destructive migration or new startup worker. Missing issuer disables issuance; malformed/incomplete enabled config fails startup. Existing workers continue their previous startup behavior. Wiki source events from the ChatGPT profile require owner acceptance; accepted body replacement/share/delete/accept are denied.

## Cost boundary

Authenticated Render billing inspection shows Hobby included usage22.72/750hours,78MB/5GB bandwidth,1/500pipeline minutes and month-to-date/projected charges$0. Existing API is free; no resource, tier or subscription added. A release consumes existing included build/runtime/bandwidth quota. Bandwidth is metered beyond allowance, so permanent zero-cost guarantee is unavailable; bounded smoke is tiny relative to remaining allowance. No paid model invocation in live acceptance: retrieval, source-thought receipts and Edition filing can be exercised without model generation. Live model Wiki generation remains excluded unless no-cost execution is verified separately. Existing Vercel workspace is Hobby; authenticated usage shows1.46GB/100GB Fast Data Transfer and no plan change is needed. Existing Blob usage10.04GB is separate from this release; plugin does not add Blob operations or storage. Existing Mongo billing/quota is not exposed through available connector; only small additive OAuth records/indexes are introduced. No new Mongo service or tier change.

## Roll forward and recovery

Merge latest main in feature branch, run focused backend/MCP/package gates and UI tests/build; push feature and require current configured CI. Update PR to reviewable ready status, merge only the verified HEAD, then monitor both existing hosts. Verify Render live deploy commit, Vercel production commit, health, OAuth discovery exact issuer/resource/callback and unauthenticated MCP challenge before owner consent. Do not treat deployment success as native tool success.

If startup fails before any grants, clear the newly introduced issuer/client enablement and restore known-good existing deploy. After grants exist, first revoke every issued test family/access token through current Connected Agents or OAuth revoke and verify no active family/token. Older middleware otherwise treats these as ordinary agent-write tokens, losing the restrictive provenance policy. Disable OAuth issuance before rolling back. Preserve additive Mongo schema/receipt data and accepted Wiki content; do not delete collections or restore database snapshots. Revert only feature changes on latest main so PR471 remains preserved. Roll forward a targeted fix if revocation/compatibility cannot be proved.

## Smallest safe owner-account test

Use stable existing API and frontend, update the one existing private ChatGPT entry, show exact endpoint/scopes, and let Athan log in/consent personally. Start with read-only Library/highlight/notes/Wiki retrieval and source identity. Only then write clearly labeled private test thought and Edition research receipt, replay operation IDs to prove deduplication, and verify accepted Wiki content unchanged. No recurring topic/search, public sharing, marketplace submission, direct Wiki acceptance, or paid generation. Revoke and remove temporary private connection after acceptance per approved cleanup.
