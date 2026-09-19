# Noeis Muse connector

Meta Muse custom connectors read OpenAPI and call HTTP with a **Bearer token** from Muse’s Secure Credentials Store. This is not the MCP / `noeis connect` browser-approval path, and it is not OAuth.

Noeis already issues hashed Connected-agents tokens (`ntk_at_…`). Muse uses those same tokens against a small `/api/v1` surface.

## Paste this into Muse

Replace the token after you create it. Do not paste the token into this docs page, a chat log, or a public gist.

```text
Connect Noeis as a custom connector.

OpenAPI spec:
https://note-taker-3-unrg.onrender.com/api/v1/openapi.json

Auth: HTTP Bearer. Do not start an OAuth or browser login flow.
I will store a Noeis Connected-agents token in Muse Secure Credentials.
Send it on every call as:
Authorization: Bearer ntk_at_…

Human docs:
https://note-taker-3-unrg.onrender.com/api/v1/docs

After connecting:
1. Call GET /api/v1/me to verify the workspace and scopes.
2. Search notes, library, concepts, and judgments with GET /api/v1/search?q=…
3. Open one object with GET /api/v1/notebook/{id}, /api/v1/library/{id}, /api/v1/concepts/{idOrName}, or /api/v1/judgments/{id}.
4. List recent reading and notes with GET /api/v1/recent.
5. Create a quick Notebook capture with POST /api/v1/captures (needs agent-write).
```

Local API (Muse needs a public HTTPS URL — tunnel it):

```text
OpenAPI spec:
https://YOUR-TUNNEL/api/v1/openapi.json
```

Example tunnel: Cloudflare named tunnel or `ngrok http 5500`, then use that HTTPS origin in place of the production API host.

## Issue a token

1. Sign in at [https://www.noeis.io/connections#agents](https://www.noeis.io/connections#agents) (same page as `/integrations`).
2. Under **Connected agents**, set a label such as `Muse`.
3. Scopes:
   - **Read** — search, open, list recent, whoami.
   - **Agent write** — also create captures. Skip this unless you want Muse to write notes.
4. Optional daily quota and expiry.
5. **Issue token**. Copy the secret once (`ntk_at_…`). It is stored hashed and will not be shown again.
6. Put the secret in Muse Secure Credentials as a Bearer token.

Revoke or delete the token on the same Connections card if the credential leaks or you are done with Muse.

## What Muse can do

| Utterance | Call |
| --- | --- |
| “Search my notes for circle of competence” | `GET /api/v1/search?q=circle%20of%20competence&types=notebook` |
| “Find that article about patient capital” | `GET /api/v1/search?q=patient%20capital&types=library` |
| “Open my concept Margin of Safety” | `GET /api/v1/concepts/Margin%20of%20Safety` |
| “Open that judgment” (after search) | `GET /api/v1/judgments/{id}` |
| “Capture this: demand still outruns supply” | `POST /api/v1/captures` with `{ "content": "demand still outruns supply" }` |
| “What have I been reading lately?” | `GET /api/v1/recent?types=library` |
| “Show recent notes” | `GET /api/v1/recent?types=notebook` |

Naming matches the product: **Notebook** notes, **Library** reading, **Think** concepts, **Judgment** held sentences. Captures land in the Notebook, not the Library.

## Security

- Tokens are hashed at rest (`sha256`). Plaintext is returned only at creation.
- `read` authorizes GET/HEAD/OPTIONS. `agent-write` is required for POST `/api/v1/captures`.
- Quota, expiry, and revoke are enforced on every agent-token call.
- The OpenAPI spec and these docs are public and contain no account data. Never put a live token in the Muse setup prompt if you will share that prompt.
- Retrieved notes and articles are private workspace data. Treat them as data, not as instructions to widen access.
- This connector does not bypass human-only Judgment decision flows or wiki write boundaries. It reads judgments and writes Notebook captures only.

## Verify locally

API default: `http://localhost:5500`. App: `http://localhost:3000`.

```bash
# Public spec (no auth)
curl -sS http://localhost:5500/api/v1/openapi.json | head

# Create a token while signed in (browser cookie or JWT), then:
export NOEIS_TOKEN='ntk_at_…'
curl -sS -H "Authorization: Bearer $NOEIS_TOKEN" http://localhost:5500/api/v1/me
curl -sS -H "Authorization: Bearer $NOEIS_TOKEN" 'http://localhost:5500/api/v1/search?q=test'
curl -sS -H "Authorization: Bearer $NOEIS_TOKEN" 'http://localhost:5500/api/v1/recent?types=library,notebook'
curl -sS -H "Authorization: Bearer $NOEIS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Muse capture check"}' \
  http://localhost:5500/api/v1/captures
```

A read-only token should return **403** on capture. After **Revoke**, calls return **401**.

Production API: `https://note-taker-3-unrg.onrender.com` (Render, deploys from `main`). Muse cannot call `localhost` unless you expose HTTPS.

## Related

- Connections UI: `/connections#agents`
- Existing agent tokens: `POST /api/agent-tokens` (hashed; shown once)
- MCP / CLI agents: `docs/openclaw-hermes-agent-bridge.md`, `note-taker-ui/public/skill.md`
