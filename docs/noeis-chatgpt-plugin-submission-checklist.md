# NOEIS ChatGPT plugin review and submission gates

Status: local review package, not submitted, deployed, approved, or published. Package source: `plugins/noeis/`; ZIP: `output/noeis-plugin/noeis-0.1.0.zip`. Rebuild with `python3 scripts/package_noeis_plugin.py --output output/noeis-plugin/noeis-0.1.0.zip`. This replaces no existing MCP infrastructure; the new files bundle its workflows for installation.

## Verified architecture

Checked official docs on 2026-10-03: [packaging](https://developers.openai.com/plugins/build/plugins), [skills](https://developers.openai.com/plugins/build/skills), [authentication](https://developers.openai.com/plugins/build/auth), and [submission](https://developers.openai.com/plugins/deploy/submission). The supplied URLs resolve to current plugin documentation.

The ZIP has portable root `plugin.json`, root `mcp.json`, and three `skills/*/SKILL.md` workflows. It declares Agent Plugins 1.0.0 schemas and the existing HTTPS streamable HTTP `/mcp` endpoint. Presentation belongs under `extensions.com.openai`. No legacy `ai-plugin.json`, registered connection ID, lifecycle hook, credential, or automatic schedule is bundled. Skills use live MCP schemas and existing source, thought, Edition, and Wiki infrastructure. The plugin runs when invoked; host scheduling is a separate explicit user action.

Authentication uses NOEIS account connection with a predefined public OAuth client, authorization code and PKCE. Protected-resource discovery and authorization-server discovery describe the canonical resource. Tokens must be checked per request, including audience, expiry, revocation and granted scopes; the connected account, never a tool argument, controls isolation. Deployment configuration and the production account-link exercise remain separate approval gates.

## Local package evidence

`package_noeis_plugin.py` checks identity, version, schema declarations, HTTPS transport, absence of credential fields, skill frontmatter, path containment, a six-file allowlist, and ZIP integrity. It passed locally. Canonical full Agent Plugins 1.0.0 manifest and MCP schemas were retrieved from agent-plugins.org and validated offline with Ajv draft 2020-12: both passed (`node scripts/validate_noeis_plugin_schema.cjs`). Snapshots are in `scripts/plugin-schemas/`. Those schemas intentionally leave OpenAI extension semantics to the host; this is not portal approval. The package now includes exactly five positive and three negative synthetic reviewer scenarios. They are instructions for review, not claims that those scenarios passed. A reviewer-accessible demo recording URL remains required. No authenticated ChatGPT install, directory automated scan, domain verification, production grant, or reviewer account test has run. See the implementation acceptance report for backend and browser evidence; do not infer those passed from this package check.

## Release gates

- [ ] Review implementation diff and actual test report, including failed and never-run gates.
- [ ] Approve deployment of reviewed server/auth changes. Current ZIP points at the existing production hostname; it does not deploy code there.
- [ ] Choose canonical MCP resource/issuer and approve predefined public-client IDs and exact ChatGPT/Codex callback allowlist in deployment configuration. Configure deployment secrets outside artifacts.
- [ ] Exercise account login, clear consent, read/write scope selection, cancellation, disconnect/revocation, expiry, PKCE/resource rejection, and two-user cross-account denial on a safe test environment.
- [ ] In a fresh ChatGPT chat, test exact-passage comparison, missing content, explicit private thought save and reread, duplicate Edition filing receipt, queued/failed progress, and pending Wiki review. Verify optional cards/deep links open only the connected account's authorized content.
- [ ] Supply publisher-approved public privacy policy, terms, support contact, verified developer identity, and final brand assets. A local square SVG icon and proposed NOEIS developer label are supplied; the label must match the selected verified publisher. The manifest deliberately omits unverified legal URLs and publisher claims; add them only after they exist and identify the same publisher.
- [ ] Choose the owning OpenAI organization/project and complete developer verification and required submission permission.
- [ ] Authorize upload/connect to the portal separately. Complete portal domain verification and OAuth connection; resolve metadata, skill, and discovered-tool findings. Include MCP in the initial upload.
- [ ] Prepare reviewer instructions and a dedicated synthetic account through an approved channel. Never put reviewer passwords, access/refresh tokens, client secrets, private notes, or production data in the ZIP or repo.
- [ ] Authorize review submission; wait for successful checks/review. Authorize public publication separately after approval.

The directory requires ZIP upload, MCP connection/domain verification and successful scans before review. Publication is a separate choice after approval. Hosted tool changes are scanned from the server; metadata or skill changes need another ZIP. Account connection and portal consent have not been performed during implementation.

## User decisions needed

1. Approve the code and test evidence, then choose whether to deploy to a test environment first or the approved production endpoint.
2. Confirm publisher/organization identity, canonical domain, client/callback configuration, privacy/terms/support copy, and final branding.
3. Approve a synthetic reviewer account and limited test grant; perform consent personally or through an explicitly authorized operator.
4. Separately authorize portal upload/review submission and, after approval, public directory publication. No remote push, PR, merge, deployment, grant, or publication is implied by this package.

## Reviewer scenarios

Use only synthetic content: two accounts with disjoint Library passages and private thoughts; one existing Edition; one pending Wiki proposal. Ask to find a passage and compare it with a linked thought, then explicitly save a new thought and reread it. File the same research URL twice: the second receipt must say already held. Request Wiki maintenance: proposed and accepted states must remain distinct. Attempt an inaccessible account's IDs, omit scopes, disconnect, and replay an expired token: access must fail without disclosure. Test a timeout then reconcile before retrying. Do not create recurring research unless the reviewer explicitly requests a schedule.

## Strict remaining submission metadata blockers

The portable schema passes, but public MCP review remains blocked on real publisher-approved `supportURL`, `privacyPolicyURL`, and `termsOfServiceURL`; verified publisher identity matching the proposed `developerName`; and a reviewer-accessible `review.demo_recording_url`. The website URL, proposed label, primary/composer SVG icon, and five positive/three negative review cases are present. Final icon/brand approval, actual hosted OAuth/domain connection, successful portal scans, and approved reviewer access remain gates. Upload acceptance alone does not establish readiness for review.

## Dependent Edition draft risk

An incoming review inferred that the existing human Edition-thought conflict recovery may discard local writing. This has not been reproduced by this package task. It is a separate human draft flow: `file_edition_items` receipts prove research filing/deduplication, and must not imply that unrelated drafts are preserved. Reproduce and resolve or explicitly assess that dependent risk before promising draft safety in reviewer materials. No unrelated Edition UI changes were made.
