# OAuth ingress and durable admission controls

Addresses independent review finding F3. No production load test, ingress configuration, deployment, or grant creation occurred. These application protections are implemented and exercised on isolated local HTTP/Mongo fixtures; staging edge protections remain a separately verified launch gate.

## Enforced application bounds

The main server mounts `buildChatgptOAuthIngress()` before the existing 50 MB JSON/form import parsers. Every request under `/oauth/chatgpt` or `/api/chatgpt/oauth` must pass this early middleware. The shared matcher is case-insensitive, matching Express’s default routing: uppercase and mixed-case route variants receive the same bound and missing/misordered-ingress rejection. The separate REST capability allowlist remains conservative and unchanged. The OAuth router refuses a missing bounded marker, and the middleware refuses an already parsed body, so accidentally mounting behind a larger parser fails closed.

- Raw request bodies are limited to **8192 bytes**, including chunked requests with no Content-Length. A Content-Length greater than the cap is rejected before reading the body. Exactly 8192 raw bytes can be parsed; 8193 returns **413**.
- Nonempty bodies accept only `application/json` or `application/x-www-form-urlencoded`. Unsupported media types and compressed bodies return **415**, avoiding alternate-parser/decompression bypass. Invalid JSON, arrays/scalars, and duplicate form keys return **400**.
- OAuth bodies are consumed exactly once and marked parsed, so the later large import parsers cannot reinterpret them. Non-OAuth import endpoints retain their existing limits.

Mongo-backed controls apply across workers and restarts. They do not use an IP as a proxy for a reader: multiple ChatGPT readers can share one egress IP. Rate keys comprise only a fixed deployment key and hashed **configured** client IDs. Attacker-supplied client IDs, credentials, authorization state, and IPs never create arbitrary limiter records. Unknown clients consume the fixed global endpoint budget without getting their own bucket.

Each endpoint has a fixed 60-second global/client budget. Conditional database updates increment only below the budget and reset at the next clock window. Client-denied calls still consume the global budget; this conservatively bounds total database work. **429** responses include `Retry-After` and `temporarily_unavailable`. Authorization GETs are throttled before validation/allocation; token/revoke before credential processing. Authenticated consent reads/decisions have a global budget, rather than generating new per-request or per-user limiter keys.

Authorization row admission reserves bounded ten-minute leases using atomic Mongo update pipelines. Global and client capacities are independent; both must be reserved before creating a request. Twenty simultaneous requests through two independent router instances were tested with capacity 2/client and 3/global: exactly 2 for the first client and 1 for the second succeeded. A definitive pre-write validation/duplicate insert rejection releases reservations. An ambiguous database/network error retains capacity until expiry because the row might have committed despite a lost acknowledgement; this prevents safe-retry failures from defeating the cap. A crash after reservation holds capacity until expiry rather than freeing it early. Consent retains the reservation until the original ten-minute admission expiry, even if the authorization row expires sooner; this avoids unlimited rapid allocate/approve loops.

Expired leases are filtered inside the atomic admission operation, independent of TTL cleanup timing. Expired request rows are deleted through the indexed expiry query before each valid allocation; delayed TTL monitoring does not permit accumulation of completed allocation windows. Mongo TTL indexes also clean idle request/control documents and expired grant families. Application expiry checks are authoritative. Healthy Mongo clocks/indexes/cleanup and coherent worker clocks still require deployment verification.

Refresh history is separately bounded: a family permits at most **2048 rotations** by default, then fails closed, revokes the family, and requires explicit reconnect. The counter increment and maximum predicate are atomic with refresh hash rotation. Thus legitimate rapid rotations cannot grow `usedRefreshHashes` beyond the configured bound during the thirty-day family lifetime. A read-only family cannot gain the supported `agent-write` scope by refreshing.

## Defaults and configuration

| Control | Default global | Default per configured client | Environment variables |
| --- | ---: | ---: | --- |
| Authorization requests/minute | 1200 | 600 | `NOEIS_OAUTH_AUTHORIZE_GLOBAL_PER_MINUTE`, `NOEIS_OAUTH_AUTHORIZE_CLIENT_PER_MINUTE` |
| Token requests/minute | 12000 | 6000 | `NOEIS_OAUTH_TOKEN_GLOBAL_PER_MINUTE`, `NOEIS_OAUTH_TOKEN_CLIENT_PER_MINUTE` |
| Revocation requests/minute | 2400 | 1200 | `NOEIS_OAUTH_REVOKE_GLOBAL_PER_MINUTE`, `NOEIS_OAUTH_REVOKE_CLIENT_PER_MINUTE` |
| Authenticated consent requests/minute | 2400 | global only | `NOEIS_OAUTH_CONSENT_GLOBAL_PER_MINUTE` |
| Live ten-minute authorization admissions | 2000 | 1000 | `NOEIS_OAUTH_PENDING_GLOBAL`, `NOEIS_OAUTH_PENDING_CLIENT` |

`NOEIS_OAUTH_MAX_REFRESH_ROTATIONS` defaults to 2048. Rate values must be positive integers no greater than 100000; pending capacities must be positive integers no greater than 10000; refresh rotations no greater than 4096. Zero, malformed, infinite, or larger values fail configuration instead of silently disabling bounds. The body cap is fixed in code, not an environment bypass. A small staging test can lower capacities/budgets without changing production defaults.

Pending capacity is an allocation window, not a promise of instant capacity recovery after a consent decision. For example, 1000 admissions/client across ten minutes limits sustained new links to approximately 100/minute once filled, even though the shorter minute rate limit permits bursts. Existing linked-tool traffic is outside these OAuth issuance controls.

## Proof and remaining ingress gate

`node --test server/routes/__tests__/chatgptOAuthRoutes.test.js` exercises actual early/late parser order, lowercase/uppercase/mixed-case JSON/form/body boundaries, chunked bodies, unsupported/compressed encodings, fail-closed misordered/missing middleware across those route variants, supported-scope refresh escalation, bounded refresh history, and real disposable Mongo tests for concurrent global/client admission, restart persistence, expiry reclamation without TTL lag, definitive-failure reservation release and lost-acknowledgement capacity retention, fixed-key token/revoke throttles, separate clients on shared egress, and window reset. Earlier code-consume/replay/persistence tests remain in the same suite.

Before exposing staging/public OAuth, verify the deployed early parser and all Mongo indexes, then run low-volume bounded rejection tests with approved disposable accounts. Confirm effective reverse-proxy request/header limits, connection/time limits, upstream rate/abuse controls, observability and redaction (including authorization query parameters/codes), coherent worker clocks, healthy TTL/index cleanup, and capacity chosen for actual concurrency. Global/client application budgets deliberately stop storage/work amplification but cannot distinguish attackers from legitimate readers of the same public OAuth client; edge controls remain necessary for volumetric/network attacks. An IP-only blanket block is not a substitute for accounting for shared OpenAI egress. No staging edge protection is claimed as configured or passed.
