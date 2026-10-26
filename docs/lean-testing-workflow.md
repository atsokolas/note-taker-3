# Lean testing workflow

Use the smallest scope that covers the change and its dependencies. The goal is less irrelevant execution and less passing output in agent context, with safety coverage retained.

```sh
npm run test:server -- server/agentEval/ --list
npm run test:server -- server/agentEval/ --maxWorkers 2
npm run test:ui -- --runTestsByPath src/components/ArticleReader.test.jsx --runInBand --list
npm run test:ui -- --runTestsByPath src/components/ArticleReader.test.jsx --runInBand
npm run test:workflow
```

Server selectors are literal path fragments, combined as a union; each must match a discovered file in the chosen `--node`/`--jest` mode. `--list` previews without execution. Unknown options, missing option values and zero-match selectors fail. No runner downloads are added; server Jest resolution keeps the existing `npx jest` convention. CI reads its runtime range directly from package.json engines.node; use that same supported runtime and lockfile-conformant installed dependencies locally.

Every executed compact run saves `receipt.json`, `results.json`, `selection.log` and `raw.log` under `tmp/test-receipts/<run>/`. The receipt records command argv, cwd, selected paths, commit, dirty/untracked content fingerprint, runtime, dependency locations/install-lock fingerprints, environment hash, counts, duration, exit status, warnings and raw byte count. Full output remains in artifacts; failures print a bounded relevant excerpt. Missing/malformed reports, write failures, child failures/signals and timeouts stay nonzero. Warning counts are textual diagnostics, not deduplicated defects; inspect new warnings in the raw artifact.

A receipt is evidence of one run, not an automatic cache. Reuse it only with the same identity and command and an unchanged installation, fixtures and external services. Install-lock hashes do not prove that nobody edited a file inside `node_modules`; re-run if that is possible. Hashing the environment avoids printing environment values. Do not share logs without checking their contents.

## CI boundaries

`Tests` always starts on PRs and main pushes. A small scope job compares a PR merge-base to its head, or the push's `before` commit to its head. Full history supports multi-commit pushes. Rename detection is disabled so old and new paths are both classified, including deleted files. Missing commits, first pushes and classifier errors run everything. A failed scope job fails the final gate.

- Known presentation files select UI; its tests **and build** still run.
- Server agent/AI code, server tests and packages select Server. Server still discovers every server/script/package test and runs its boot check and offline harnesses.
- Extension inputs come from the packer's existing `FILES`, recursively resolved local imports, and the smoke test's UI theme file. Shared UI inputs also select UI. Server tests that refer to UI fixtures pull in those fixtures' local import graph. Unresolved imports fall back broadly.
- Authentication/privacy/persistence-related paths, UI APIs/shared models/context, unknown paths, workflows, manifests, locks, configuration and classifier changes run all three jobs. Root server/service changes currently fall back broadly: no optimistic API-contract inference.
- Documentation-only changes skip execution while the named component jobs conclude skipped. `Tests complete` succeeds only when scope succeeded and every selected job passed, with every unselected job skipped. Existing check names are retained. No repository protection settings are changed; repositories can choose the final gate as a required check separately.

Node selection derives from package.json rather than an independently maintained major-version string. The classifier regression matrix runs before every routing decision. It tests dependency inputs, safety fallbacks, multi-commit ranges, rename/deletion, and every Agent Eval trigger. Agent Eval keeps its distinct `agent:eval:check` and artifact upload. Its duplicated score/runEval unit tests live in Server on PR/push; manual eval dispatch still runs them itself. Read-only eval runs cancel only older runs of the same workflow/ref. Deployment/publishing workflows are unchanged.

## Scope and deferred work

No tests are removed and no assertions are weakened. Scoped local runs are not a substitute for broad regressions on risky paths. No elaborate dependency cache, new paid service, settings/grant changes or automatic pass cache is introduced. Actual model token usage is unavailable: runtime measures CPU/wall time; output volume measures text that might otherwise enter agent/reviewer context.

## Measurements (2026-10-26)

The independent pre-change audit reported 3,020 frontend tests / 45.364s, a 91s UI job, a 110s Server critical path, and 983,982 UI log characters / 9,165 lines. Its ArticleReader section contained 258 console-error markers, 59 act warnings and 63 XHR AggregateErrors. Agent Eval duplicated two Server test files for roughly 7s. These are historical audit observations, not forecasts for every run.

A same-head local ArticleReader comparison at base `b7cce047` kept all **51 tests** and every assertion. Both runs used the same installed dependencies and a CLI-only mapping for the existing case-sensitive `ReturnGreeting` component/helper filename collision on macOS.

| Metric | Before | After |
| --- | ---: | ---: |
| ArticleReader raw UTF-8 bytes | 761,821 | 493,455 |
| Raw characters | 761,443 | 493,017 |
| Raw lines | 7,741 | 3,843 |
| console.error markers | 258 | 168 |
| act warnings | 59 | 0 |
| XHR AggregateErrors | 63 | 0 |
| Tests passed | 51 | 51 |

The remaining 168 errors are the existing duplicate sibling-key warnings in product code; they stay visible in raw logs and receipt counts. Product-code fixes were deferred. This reused installation does not match the lockfile and cannot support cross-run reuse or an authoritative performance comparison. Only the same-install scoped log-volume comparison is used here. The after receipt took 2.068s excluding selection/fingerprinting; the before Jest run reported 2.665s. Different timing boundaries and warm caches prevent a reliable runtime speedup claim. Raw logs are retained locally in `tmp/lean-evidence/article-before-mapped.log` and `tmp/test-receipts/1793025887789-500d75/`, with the compact surfaced receipt in `tmp/lean-evidence/article-final-receipt.log`. No token-usage percentage is claimed.

Local global validation surfaced the existing dependency/runtime mismatch: root installs lack mongodb-memory-server and include older security dependencies; UI Axios is 1.11.0 while the lockfile pins 1.20.0. The full UI run recorded 3,029/3,030 passing, with the Axios security regression correctly failing. The full Server run recorded 319 node files + 63 Jest suites, with 35 failing entries (31 missing-dependency entries, plus security/upload/timezone fixtures); its Jest portion passed 803/806 cases. These are failed validation receipts, never treated as passes. Full local logs/results remain under `tmp/lean-evidence/` and `tmp/test-receipts/`. Final clean-install Linux CI is the authoritative full validation; no product assertions or security tests were relaxed to accommodate the local install.

Expected routing examples: README-only => no component execution; ArticleReader.test.jsx => UI tests+build; agentEval score => Server; popup.css => extension; manifest, deletion/rename, Work Notes, auth/API or unknown paths => all three. Before routing, all three jobs ran on each change. Scope/gate jobs add overhead, so skipped execution is not identical to critical-path savings. Exact new CI durations belong to the PR run, not these historical timings.
