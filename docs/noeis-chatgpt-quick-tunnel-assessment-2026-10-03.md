# Temporary tunnel compatibility assessment

Status: local configuration and compatibility checks only. No tunnel was installed or started, no endpoint exposed, and no external OAuth grant or ChatGPT connection was created.

Cloudflare's [official Quick Tunnels documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) states that temporary tunnels need no account or domain, use changing hostnames, have no uptime guarantee, limit concurrent requests to 200, and do not support SSE. Email gating requires an interactive browser and cannot protect noninteractive MCP/token requests compatibly. Anyone knowing an ungated URL can reach its permitted routes. These constraints make this a possible bounded acceptance-test path, not a store submission or production host.

## Prepared transport option

`NOEIS_MCP_JSON_RESPONSES=true` opts the hosted adapter into the installed MCP SDK's `enableJsonResponse` option. All other values leave the default SSE response behavior unchanged; direct router configuration also accepts a boolean `enableJsonResponse`. This option changes response representation, not authentication, permitted tools, ownership checks, or review policy.

Primary SDK evidence is the installed `@modelcontextprotocol/sdk` source: `dist/cjs/server/webStandardStreamableHttp.d.ts` documents `enableJsonResponse` as JSON instead of SSE; `webStandardStreamableHttp.js` implements a promise for completed JSON responses. The hosted adapter already uses stateless POST requests, so it does not require an enduring server push channel. It refuses MCP GET streams. JSON mode cannot carry incremental progress notifications; tools must return their existing honest pending state and pollable run ID. Other product SSE endpoints are not made compatible by this flag.

Passed local test: `node server/routes/__tests__/hostedMcpRoutes.test.js`, using disposable loopback HTTP. It checks default SSE content type, opt-in JSON content type, and real SDK client initialize → tools/list → connection_info tool roundtrip. This is not evidence that ChatGPT accepts the random hostname, loads the package, or completes native OAuth.

## Requirements before any approved public test

Do not expose the existing local staging runner. Its known synthetic password, fixed issuer/client/callback, and broad local fixture routes are unsuitable for public access. A later, separately reviewed runner would need an isolated disposable database, no inherited production environment or credentials, an unpredictable test login, and a narrow gateway exposing only approved flows. No such runner or gateway is prepared here.

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

## Native ChatGPT UI read-only checkpoint

On2026-10-03, the existing native Safari profile loaded https://chatgpt.com/plugins with title Plugins | ChatGPT, profile-menu and installed-plugin search controls. No developer-plus button or OAuth configuration fields were observed. The profile popover did not become available to the read-only interaction, so plan entitlement and existing Developer mode state remain unverified. No account identity, cookie or token was extracted. No setting, installation or grant was changed.

The current [official Developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode) documents eligible plans and static OAuth credentials. This is documentation evidence, not proof that this account UI permits a predefined public client with none and the needed callback. The minimum next read-only handoff is for the owner to open Settings > Security and login and show existing eligibility/mode state, without upgrading or enabling anything. If developer mode is off, its enablement needs separate approval before reading the app-creation OAuth form. Copy actual client/callback values from that form; do not invent them.
