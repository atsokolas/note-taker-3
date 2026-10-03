# NOEIS ChatGPT account connect

Verified against [current official authentication guidance](https://developers.openai.com/plugins/build/auth) on 2026-10-03. This is the current OAuth 2.1 MCP account-link flow, using predefined public clients. It does not implement the obsolete AI plugin manifest authentication scheme, Sign in with ChatGPT identity, or a background execution service.

## Configuration and approval gates

OAuth discovery and issuance are disabled unless `NOEIS_CHATGPT_OAUTH_ISSUER` is configured. An incomplete or insecure configuration fails server startup instead of issuing unbound credentials. No production client, grant, secret, consent, or deployment was created for this implementation.

Example for an isolated local developer instance (these are illustrative values, not registered production settings):

```dotenv
PORT=5500
NOEIS_CHATGPT_OAUTH_ISSUER=http://127.0.0.1:5500
NOEIS_CHATGPT_MCP_RESOURCE=http://127.0.0.1:5500/mcp
NOEIS_APP_URL=http://localhost:3000
NOEIS_MCP_INTERNAL_API_URL=http://127.0.0.1:5500
NOEIS_CHATGPT_OAUTH_CLIENTS=[{"client_id":"noeis-local-chatgpt-review","client_name":"ChatGPT","redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"]}]
```

- `NOEIS_CHATGPT_OAUTH_ISSUER`: canonical API HTTPS origin in production, no path/query. This exact normalized issuer is returned in metadata and every callback, including denial/error callbacks to validated clients.
- `NOEIS_CHATGPT_MCP_RESOURCE`: exact canonical HTTPS resource URL, normally `<issuer>/mcp`. ChatGPT must send this value in both authorization and token requests. NOEIS checks the bound opaque access token against the same resource on the MCP endpoint and its inner API calls.
- `NOEIS_APP_URL` (or existing `FRONTEND_URL`): frontend origin hosting the consent page and existing NOEIS login. HTTP is allowed only for loopback development.
- `NOEIS_MCP_INTERNAL_API_URL`: trusted backend origin for the hosted MCP adapter's inner NOEIS API calls. Defaults to `http://127.0.0.1:${PORT || 3000}`. It is never taken from the inbound Host header, user input, tool arguments, or the standalone MCP client's production default. In production, configure a trusted reachable own-service origin if loopback is unsuitable.
- `NOEIS_CHATGPT_OAUTH_CLIENTS`: JSON array of predefined public client IDs, display names, and exact HTTPS callback allowlists. IDs must be unique. No wildcard/prefix callback matching, dynamic registration, client metadata URL fetches, or client secrets are enabled. The portal must be configured to use a predefined OAuth client and token authentication method `none` with PKCE. The illustrative ID above cannot link an actual ChatGPT connection until the corresponding client is configured in the management page.

Before enabling production, the owner must approve the issuer/resource/frontend origins, obtain the actual client ID and exact redirect URI from the MCP management page, select the predefined client/public PKCE mode, and configure matching portal/environment values. Current docs say servers advertising issuer identification can use `https://chatgpt.com/connector_platform_oauth_redirect`; copy the actual portal URI exactly rather than assuming it. If the chosen management surface cannot configure a predefined public client, use a reviewed identity provider/CIMD/DCR integration before publication; do not relax callback matching or fabricate credentials.

OpenAI account connection, tunnel/staging deployment, production deployment, directory submission/publication, and persistent production grants remain separate owner approval gates. A developer test does not authorize them.

## Staging package configuration

The checked-in MCP configuration intentionally uses `https://noeis-chatgpt-staging.invalid/mcp`. This reserved placeholder cannot connect. The default local ZIP is an **unconfigured staging review artifact**, not a working production connection or a deployment. The production API hostname is excluded by the staging package builder.

First obtain approval for an isolated HTTPS staging API, staging frontend, disposable/synthetic review accounts, and the exact public client/callback configuration. Configure the server environment from `plugins/noeis/staging.env.example` outside the ZIP; replace every `.invalid` value and the illustrative client ID with approved values. Do not source the example as production configuration. The server's issuer, MCP resource, and packaged endpoint must agree exactly. Setting configuration does not deploy a server or grant consent.

Build the unconfigured review artifact:

```sh
node scripts/validate_noeis_plugin_schema.cjs
python3 scripts/package_noeis_plugin.py --output output/noeis-plugin/noeis-0.1.0-staging-unconfigured.zip
```

After an actual staging endpoint is approved and deployed, build a distinctly named configured artifact without editing source configuration:

```sh
python3 scripts/package_noeis_plugin.py --staging-mcp-url https://YOUR-APPROVED-STAGING-HOST/mcp --output output/noeis-plugin/noeis-0.1.0-staging.zip
```

Replace the illustrative hostname; the builder requires HTTPS, no embedded credentials/query/fragment, and canonical `/mcp`. It changes only the ZIP's MCP URL and emits a neighboring `.config.json` receipt recording staging target, configuration state, and that deployment/account-connect were not performed. The six-file ZIP contains no environment template or credentials. Use the approved actual staging URL for developer-mode connection, then perform consent and account-link verification separately. Canonical schema checks establish package structure; they do not prove endpoint availability, OAuth correctness, publisher approval, or portal acceptance.

## Endpoints and consent

- `GET /.well-known/oauth-protected-resource` (also the `/mcp` suffix form) advertises the canonical resource, issuer, and `read`/`agent-write` scopes.
- `GET /.well-known/oauth-authorization-server` advertises code/refresh grants, S256, `none`, and RFC 9207 issuer identification. It does not advertise DCR, CIMD, OIDC/email claims, or unsupported enterprise email domain restrictions.
- `GET /oauth/chatgpt/authorize` checks the predefined client, exact redirect, requested scopes, resource, and S256 challenge. It stores an opaque ten-minute pending request and opens `/settings/connected-agents/chatgpt?request=...`.
- `GET /api/chatgpt/oauth/requests/:id` uses existing NOEIS user authentication and returns `{requestId, clientName, scopes, resource, expiresAt}` for the consent screen. It returns no code, client state, credentials, or user data.
- `POST /api/chatgpt/oauth/requests/:id/consent` accepts `{approved: true|false}` through the existing user's Bearer JWT. Cookie-only auth cannot approve; this prevents cross-site cookie requests from approving grants. It atomically consumes the pending decision. Approve issues a hashed, single-use, sixty-second code bound to that signed-in account. Deny issues no token. The response is `{redirectUrl}` with `state` and exact `iss`.
- `POST /oauth/chatgpt/token` accepts standard form encoding or JSON. Authorization-code exchange requires client ID, exact redirect, resource, and PKCE verifier. Refresh requires client ID, exact resource, and current refresh credential. Responses have `Cache-Control: no-store` and `Pragma: no-cache`.
- `POST /oauth/chatgpt/revoke` accepts `{client_id, token}` (access or current/used refresh token). Unknown tokens receive the same 200 response to avoid disclosure. Revocation terminates the whole connection family.

`read` permits private Library/highlight/note/Wiki retrieval. The existing scope name `agent-write` is reused, but OAuth grant-family provenance now applies a server-enforced restricted ChatGPT capability profile. Its writes are source-bound thought appends, additive Edition filing, and Wiki source/candidate preparation. Direct replacement, deletion, sharing, publication and acceptance are rejected in MCP and direct REST. Candidate preparation and deferred ingestion preserve accepted wording pending owner review in NOEIS. Legacy manually created broad agent tokens remain unchanged. Consent describes the supported capability and is explicit, never auto-accepted. Lost consent/code/token responses require a fresh connection when safe retry is impossible; no successful connection is claimed without delivered credentials.

## Persistence and security boundaries

Access credentials reuse the existing `AgentToken` model and `ntk_at_` scheme, with a one-hour expiry and resource/client/family binding. Existing agent access checks, ownership constraints, per-tool scope gates, action logs/receipts, and Connected Agents revocation remain authoritative. Legacy manually created tokens continue to work unchanged.

OAuth requests and grant families are durable Mongo records. Access, refresh, and authorization-code plaintext is returned only at issuance and never persisted; SHA-256 hashes index opaque credentials (192-bit existing agent access secrets; 256-bit OAuth codes and refresh secrets). Codes are consumed with one atomic conditional update. Refresh hashes rotate with a compare-and-swap; used hashes remain recorded until the family expires. Reusing a stale refresh credential, including concurrent refresh replay, revokes the whole family and all its access tokens. Scope increases require a new consent request; refresh may only retain or narrow scopes. A refresh rotation replaces the access credential hash on the same Connected Agents record, invalidating earlier access tokens while preserving one grant identity and receipt stream. Existing Connected Agents revoke/delete also revokes the entire OAuth family; revoking the latest token blocks future refresh. Every OAuth access checks the active family and resource on each inner API call.

Because replay causes revocation, clients must serialize refresh and avoid retrying an old refresh credential after an ambiguous network response. Reconnect explicitly when rotation delivery is uncertain. This is fail-closed behavior, not a claim of seamless recovery.

TTL indexes clean expired requests and expired grant families. Application checks independently reject expiry immediately, without waiting for asynchronous Mongo TTL cleanup. The stateless MCP adapter creates a server per request and closes it after success or exception; it stores no bearer/session history in process memory.

## Evidence and remaining validation

`node --test server/routes/__tests__/chatgptOAuthRoutes.test.js` covers discovery, exact callback allowlists, unknown clients/scopes, resource substitution, plain PKCE rejection, explicit denial/state/issuer, cookie-only consent rejection, single-use decisions/codes, PKCE mismatch, hashed storage, account identity isolation, expiry, scope escalation, refresh rotation/replay, revocation, and a real local Mongo test proving concurrent code consumption, concurrent refresh fail-closed behavior, and persistence after reconnect. The test uses a disposable local Mongo instance, never production credentials or a production database.

`node server/routes/__tests__/hostedMcpRoutes.test.js` verifies the stateless transport, challenged CORS header exposure, real MCP tool listing, and explicit internal API origin. Existing scoped-token tests verify compatibility with manually created tokens.

A real ChatGPT account-link flow is not yet run: it requires the approved staging HTTPS endpoint, actual portal predefined-client configuration, and a consenting review account. Production independent security review, Mongo index provisioning, deployment logs/secret-redaction verification, external account-link/refresh/revoke smoke, and OpenAI management/submission review remain launch gates. Enterprise verified-email workspace restrictions and prior ID-token hints are not implemented or advertised.


## Public ingress and allocation gate (review F3)

The server now establishes a fixed 8192-byte JSON/form body boundary before its larger import parsers and applies durable Mongo rate/admission controls across workers. Global and configured-client budgets account for shared ChatGPT egress without grouping readers by IP; unknown client/credential values cannot allocate new limiter keys. Live authorization admissions and refresh history have explicit bounds; ambiguous allocation acknowledgements retain capacity safely. See [OAuth ingress controls](noeis-chatgpt-oauth-ingress-controls.md) for defaults, configuration, executed local proof, and the remaining staging edge/index/clock/cleanup verification gate. Application limits are implemented; deployed edge protection is not claimed as configured or verified.
