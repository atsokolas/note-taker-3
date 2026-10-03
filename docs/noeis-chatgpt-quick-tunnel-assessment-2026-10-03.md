# Temporary tunnel compatibility assessment

Status: owner-approved temporary accountless Cloudflare metadata exposure completed and stopped. Existing cloudflared2026.7.1 was reused; no installation, account, subscription, upgrade or external grant was needed. No ChatGPT plugin/connection was created. All disposable services and credentials were cleaned up.

Cloudflare's [official Quick Tunnels documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) states that temporary tunnels need no account or domain, use changing hostnames, have no uptime guarantee, limit concurrent requests to 200, and do not support SSE. Email gating requires an interactive browser and cannot protect noninteractive MCP/token requests compatibly. Anyone knowing an ungated URL can reach its permitted routes. These constraints make this a possible bounded acceptance-test path, not a store submission or production host.

## Prepared transport option

`NOEIS_MCP_JSON_RESPONSES=true` opts the hosted adapter into the installed MCP SDK's `enableJsonResponse` option. All other values leave the default SSE response behavior unchanged; direct router configuration also accepts a boolean `enableJsonResponse`. This option changes response representation, not authentication, permitted tools, ownership checks, or review policy.

Primary SDK evidence is the installed `@modelcontextprotocol/sdk` source: `dist/cjs/server/webStandardStreamableHttp.d.ts` documents `enableJsonResponse` as JSON instead of SSE; `webStandardStreamableHttp.js` implements a promise for completed JSON responses. The hosted adapter already uses stateless POST requests, so it does not require an enduring server push channel. It refuses MCP GET streams. JSON mode cannot carry incremental progress notifications; tools must return their existing honest pending state and pollable run ID. Other product SSE endpoints are not made compatible by this flag.

Passed local test: `node server/routes/__tests__/hostedMcpRoutes.test.js`, using disposable loopback HTTP. It checks default SSE content type, opt-in JSON content type, and real SDK client initialize → tools/list → connection_info tool roundtrip. This is not evidence that ChatGPT accepts the random hostname, loads the package, or completes native OAuth.

## Requirements before any approved public test

Do not expose the existing local staging runner. Its known synthetic password, fixed issuer/client/callback, and broad local fixture routes are unsuitable for public access. A later, separately reviewed runner would need an isolated disposable database, no inherited production environment or credentials, an unpredictable test login, and a narrow gateway exposing only approved flows. A later deny-default gateway is now prepared in `scripts/noeis_chatgpt_test_gateway.cjs`, with loopback tests in the adjacent `.test.cjs` file. It does not create a runner, login or grant, and must not expose the existing synthetic fixture. The parent separately owns any approved tunnel startup and the fresh disposable API runner.

A single public HTTPS origin would front the narrowly allowed OAuth discovery/authorize/token/revoke routes, `/mcp`, the browser consent at `/settings/connected-agents/chatgpt?request=...`, login and connection-management views, their required assets, and the exact scoped browser API paths. Deny unrelated APIs, ingestion/debug/admin/seed endpoints and unrelated product streaming routes by default. Determine the actual login, settings and connection-management dependencies from the chosen browser flow before writing an allowlist; do not assume the existing whole API can be safely proxied. Preserve route paths, authentication headers, request bodies and status codes; apply existing effective body/rate limits and no-store response policy. Never log bearer tokens, passwords, authorization codes or refresh credentials.

For a chosen approved origin `https://REPLACE.invalid`, the configuration relationship must be:

```dotenv
NOEIS_CHATGPT_OAUTH_ISSUER=https://REPLACE.invalid
NOEIS_CHATGPT_MCP_RESOURCE=https://REPLACE.invalid/mcp
NOEIS_APP_URL=https://REPLACE.invalid
NOEIS_MCP_INTERNAL_API_URL=http://127.0.0.1:REPLACE_API_PORT
NOEIS_MCP_JSON_RESPONSES=true
```

`FRONTEND_URL` is the supported fallback when `NOEIS_APP_URL` is absent. The public issuer/resource/frontend use the chosen HTTPS origin; internal tool calls stay on the exact loopback API origin. Deep links derive from explicit configuration, never inbound Host headers. OAuth client ID and redirect URI must be copied exactly from the actual native client management UI. The callback is the client's provided URL, not a guessed tunnel path. Neither illustrative settings nor a previous local fixture callback prove native-client compatibility.

Browser login must occur against this disposable account through the same configured origin. Confirm secure-cookie/proxy behavior and header-only explicit consent in the selected gateway flow, including denial and revoke/reconnect. Do not disable cookie protections or accept consent on the user's behalf to make a test pass. An email PIN screen in front of token/MCP endpoints would break noninteractive clients. A changing tunnel origin invalidates audience/discovery/package settings; stop the run and deliberately reconfigure the next isolated test rather than silently reusing a grant.

Approval still required for tunnel installation/execution, public exposure, the exact scope/duration, chosen native client/callback, and actual login/consent/grant creation. A localhost SDK roundtrip does not satisfy these gates. No recurring work is created or implied.

## Native ChatGPT UI and approved metadata checkpoint

Read-only ordinary keyboard navigation in the existing Safari profile reached Settings > Security and login and confirmed access to the custom MCP form. No Developer mode control was visible on the actual Security page; no switch or subscription was changed. The current Plugins Add menu offers Create plugin, Upload plugin archive and Create custom MCP server.

The owner-approved temporary public gateway used a separate disposable runner, fresh unpredictable credentials and a frontend compiled with REACT_APP_API_BASE_URL=/. Public frontend/discovery200, canonical MCP401 OAuth challenge, GET-MCP405, blocked signup/token-mint/consent403 and fresh synthetic HTTP login200 passed. Browser invalid login401 verified the login request stayed on the same HTTPS origin; external browser requests were blocked. Secret browser login was not attempted after the CLI refused dynamic private-file import; no secret was embedded in tool arguments. Gateway/runner regression4/4 passes.

Entering only the temporary MCP URL in the unsaved native form enabled Advanced OAuth settings. Actual UI discovery confirmed:

- Registration method: User-Defined OAuth Client. DCR unavailable without registrationURL; CIMD unavailable because not advertised.
- Token endpoint auth method: none selected; secret optional. No secret was read or entered.
- Exact callback copied from UI: https://chatgpt.com/connector_platform_oauth_redirect .
- Provider supplies its predefined public client ID; the UI does not generate one. Prepared test ID: noeis-chatgpt-review, with the observed callback. This configuration was prepared but not applied.
- Authorization/token/issuer/resource endpoints matched the temporary public origin; read and agent-write scopes were discovered. OIDC remained unavailable as advertised.

The permission checkbox stayed unchecked, Create as a plugin was never selected, and no OAuth authorize/consent flow was initiated. Forms were closed. Both synthetic accounts had zero issued/active AgentTokens before cleanup. Cloudflared, gateway, API, browser and disposable Mongo were stopped; private login/signing material was deleted. The temporary hostname is no longer an available test endpoint.

Evidence is in output/noeis-plugin/evidence/chatgpt-native-oauth-discovery.json and .png, quick-tunnel-routing.json, quick-tunnel-browser-login.json, and tunnel-staging-zero-grants.json. No production secrets, data or services were used; cost stayed0.

## Exact remaining approval

The next phase requires separate owner approval to create a temporary private ChatGPT custom MCP plugin/connection, accept its trust checkbox, and personally grant the disposable NOEIS account read/agent-write access for bounded tests. It also needs a refreshed temporary origin, the prepared exact callback configuration applied to the new disposable runner, and a reviewed gateway revision allowing that specifically approved consent flow and required authenticated test routes. No agent may click consent on the owner’s behalf. Cleanup should revoke/delete the temporary connection and stop exposure afterward. No billing upgrade, production content, store publication or recurring execution is included.

A random Quick Tunnel remains a temporary test facility; store submission requires separately approved stable production hosting and the publisher/legal/reviewer gates.
