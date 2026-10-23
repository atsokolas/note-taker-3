# October 2026 security dependency plan

> Execute in this isolated NOEIS checkout under the user's explicit patch, test, and deploy authorization.

**Goal:** Remove the confirmed vulnerable Multer and Node versions and update both Axios installations to the current vendor security release.

**Architecture:** Keep authenticated import routes, memory storage, and existing file limits. Move the existing upload instance into one import module so real multipart behavior can be tested without a database. Use the established GitHub main → Render/Vercel deployment workflow.

**Constraints:** NOEIS only; no user-content smoke writes, EPUB decompression changes, plugin changes, security-check bypasses, credentials, or infrastructure changes.

- [ ] Capture baseline server/UI test results and dependency audit.
- [ ] Test real multipart upload success, multiple files, authentication before parsing, file-size and unexpected-file limits, malformed bodies, and bounded array-index rejection. Demonstrate the rejection test fails on the old implementation.
- [ ] Upgrade Multer to 2.5.0 and Axios to 1.20.0 in root and UI; keep unrelated versions fixed. Set Node engines to >=22.23.4 <23 and expose the actual process version with the existing commit endpoint.
- [ ] Run boot check, server and UI suites, offline harnesses, frontend build, and targeted security regressions using an isolated patched Node binary. Investigate differences from baseline.
- [ ] Review focused diff, commit, open PR, require available checks, merge without bypasses, and observe the normal deployments.
- [ ] Verify production commit, actual backend Node patch and Vercel build Node patch; smoke public pages and authentication guards without writing content. Report unresolved baseline issues and residual vulnerabilities accurately.

## Execution evidence

- Dedicated clone and branch from `2f9fc3063dc5a95f64dbed2eab39bb0031f8bcec`; no existing checkout altered.
- Vendor sources: [Multer array-index DoS](https://github.com/expressjs/multer/security/advisories/GHSA-535w-7cp7-47q4), [Multer async filter teardown](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m), [Axios current advisories](https://github.com/axios/axios/security/advisories), [Node October 21 security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
- Backend deployment log confirms old Node 22.12.0. Vercel project selects 22.x; verify rebuilt patch after release.
- Old parser accepts bounded `items[10001]`; patched production parser rejects it with `LIMIT_FIELD_ARRAY_INDEX`. Old Axios copies ignore a four-byte data-URL cap; both patched copies reject it.
- Eight backend regression tests and one frontend regression pass on isolated Node 22.23.4. Upload module replaces the inline server upload instance; no duplicate configuration retained. Existing memory storage, 15 MB cap, multi-file support, and auth ordering stay covered.
- Boot and offline harnesses pass. Mac full server: 307/309 node files and 62/62 Jest suites (800/800 tests); baseline 305/307 node files and 61/62 Jest suites. Persistent failures predate changes: oversized chunked-upload timeout and timezone-sensitive Kindle timestamp (the timestamp passes with TZ=UTC). The baseline readingTrail Jest failure did not recur.
- Mac full UI: baseline 326/330 suites, 2858/2921 tests; patched 327/331 suites, 2859/2922 tests. Same 63 failures in ArticleReader, readerDelights, BookDesk, and Books. Mac build fails because extensionless PascalCase component imports resolve to lower-case `.js` helpers on the case-insensitive filesystem. No source workaround or disabled test added; Linux CI remains the release gate.
- Ruling: continue within explicit autonomous execution/deployment authorization; do not add a plan-approval pause, unrelated fixes, destructive cleanup, or security-check bypass.

- Independent read-only review found no blocking code issues and reran all nine targeted regressions. UI also declares the patched Node floor and prints its actual build version so Vercel verification is direct. The existing Mongo integration fixture now consumes the production upload instance instead of duplicating its configuration.
