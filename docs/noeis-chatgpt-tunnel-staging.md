# Temporary synthetic tunnel staging

This runner is separate from the fixed-password loopback fixture. Never expose `run_noeis_chatgpt_local_staging.js` or port 5607 directly through a tunnel. The public entry must be the separately reviewed gateway on loopback port 5680, whose default-deny route list blocks registration, generic agent issuance, arbitrary REST routes and repository artifacts. The runner itself installs no tunnel software and starts no tunnel.

After the owner-authorized tunnel provides an exact HTTPS origin, run:

```
node scripts/run_noeis_chatgpt_tunnel_staging.js --public-origin https://EXACT-ASSIGNED-NAME.trycloudflare.com
```

The argument must be the exact canonical HTTPS origin with one hostname label before `trycloudflare.com`; paths, credentials, ports, query strings and other domains are refused. The API binds only to `127.0.0.1:5607`. Public issuer, MCP resource and app origin derive from the provided origin; inner MCP requests use the fixed loopback API. Incoming Host or forwarded headers never select them. JSON MCP responses are enabled.

Each launch creates a fresh disposable Mongo database and two new random synthetic usernames/passwords, a random JWT signing key, and six aligned fictional sources per account. Each source exceeds 450 words, discusses replication limits in synthetic evaluation and identifies itself as fictional test material. These provide richer candidate-generation fixtures, not actual research evidence or a guarantee that a generated candidate will pass quality review. A private mode600 temporary file contains fixture login details and signing material. Only its path and nonsecret fixture IDs appear in `output/noeis-plugin/tunnel-staging-fixtures.json`; credentials are never copied into repository artifacts or printed.

The child receives a strict environment allowlist, an empty temporary working directory that prevents repository `.env` loading, and loopback-only DNS/socket guards. No production database, personal API key, paid service or inherited token is used. External watches, email, embeddings, scheduled maintenance and storage workers are disabled; existing dossier recovery reads only the disposable database. The existing cached Mongo binary is required; automatic download is refused. Optional `--local-model` uses only the installed Ollama-compatible API at `127.0.0.1:11434` and `muse-glimmer:30b-mlx`; the protocol key placeholder is not an external credential.

By default the sole predefined client is `noeis-chatgpt-review`, with callback `${PUBLIC_ORIGIN}/chatgpt-test-callback`. This is a synthetic review callback, **not an OpenAI callback registration**. Do not use it to claim native ChatGPT connection. After the actual native interface supplies its exact client/callback details and the owner approves their use, `--clients-file /PRIVATE/TEMP/clients.json` can supply that explicit configuration. The regular file must be mode600 under the temporary directory; URL and client validation uses the existing OAuth configuration validator. No callback is guessed or automatically registered.

The runner creates no OAuth grant. Initial public testing is limited to reviewed metadata and connection inspection. Account consent, grant creation, read/write invocation and submission retain their separate authorization gates; the public gateway must continue blocking consent until specifically approved. A tunnel installation/public-exposure approval does not itself authorize consent.

Native login readiness is checked locally, without printing the returned JWT. A successful boot produces `NOEIS_TUNNEL_STAGING_READY` with process IDs, public configuration, private credential-file path and nonsecret fixture IDs. SIGINT or SIGTERM stops the server, destroys Mongo, and deletes the temporary credential/signing material. Stop the gateway and tunnel separately. Restarting changes all credentials and fixture IDs; existing grants cannot survive cleanup.

Local validation used an offline metadata-only origin, `https://offline-review.trycloudflare.com`, without connecting to it, installing a tunnel, exposing a port publicly or creating a grant. Actual public acceptance and a positive Wiki candidate awaiting owner review remain separate checks.

## Completed temporary metadata test

Owner-approved accountless exposure reused the existing official cloudflared binary and was stopped after inspection. The native ChatGPT form confirmed User-Defined OAuth Client, token endpoint auth none, optional secret and exact callback https://chatgpt.com/connector_platform_oauth_redirect . The provider-selected public ID noeis-chatgpt-review can be configured with that exact callback in a private clients file; no OpenAI-generated client ID or production secret is needed. Configuration was prepared, not applied.

Public discovery/frontend/login and canonical MCP401 challenge passed; denied routes and consent remained403. Both synthetic accounts retained zero issued/active tokens. All services and disposable credentials were cleaned up. Actual ChatGPT plugin creation, trust-checkbox acceptance, personal consent and tool invocation remain separate approval gates. See the compatibility assessment for exact proof and limits.

For personal native-login handoff, the runner also creates `owner-login.txt` mode600 in the same private temporary directory. It contains only account 1’s temporary synthetic username/password and intended origin, without JWT signing material. Its path appears as `ownerLoginFile` in readiness. Open that local file for the owner to read/copy personally; do not read its password into tool output, messages, browser automation arguments or shared artifacts. Cleanup deletes it with the rest of the temporary directory.
