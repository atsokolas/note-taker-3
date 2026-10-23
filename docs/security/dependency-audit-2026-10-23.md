# Remaining dependency security review — 2026-10-23

Baseline: PR #589 / commit `2c885a200d896d85648d6e8eac39c86d96904701`. The prior Axios, Multer and Node fixes are retained.

## Priorities and implemented fixes

1. **Backend HTTP / authentication / persistence:** Express 4.22.3, Mongoose 8.24.6, MCP SDK 1.32.1, React Router 7.18.4, and compatible vulnerable transitives (including proxy-addr, qs, path-to-regexp, jws, lodash). The proxy-addr advisory needs a matching trusted proxy configuration; this app does not configure `trust proxy`, so its critical package rating is not a demonstrated NOEIS IP-spoofing exploit.
2. **Hosted MCP validation DoS:** SDK updates alone leave the new limit disabled. Enable 10,000 tool-input elements before schema validation and enforce a 1 MiB JSON request cap before the 50 MiB general API parser. Unsupported POST content types return 415 before another parser can consume them. The transport uses the same byte cap. Normal tool calls and SSE/JSON transport modes remain covered. Large source documents can still use the application's file-import path. No scopes or marketplace declarations changed.
3. **Browser / compatible tooling fixes:** React Router 7.18.4; patched ProseMirror view, Lodash/Lodash-ES, Markdown-It, Linkify-It and other affected library chains. Update compatible Babel, Webpack, parser, YAML, glob, proxy, compression and WebSocket dependencies. All four critical UI audit entries disappear.
4. **Developer watcher:** replace the sole nodemon invocation with supported Node 22 native watch mode, removing 29 packages and the unpatched braces watcher chain from the backend. No external watch configuration exists.
5. **Pinned tooling dependency:** JSONPath 1.3.0 pins vulnerable Underscore 1.13.6. Override only that dependency to vendor-patched 1.13.8 (same 1.x API). JSONPath queries, flatten/isEqual and BFJ JSON output were exercised successfully. No major dependency overrides applied.

## Migration decisions reported before undertaking them

- **Tiptap:** no patched 2.x release is published; the fix is 3.30.4+. A coordinated Tiptap 3 editor migration needs its own compatibility plan and acceptance tests. Keep it separate from this supported patch pass. Custom extensions in `note-taker-ui/src/components/wiki/extensions/Claim.js`, `WikiLink.js`, `think/editor/writingParts.jsx` and `think/notebook/NotebookEditor.jsx` pass schema-derived HTML attributes to mergeAttributes. A hostile own-__proto__ boundary has not been established in those paths; do not describe the dependency advisory as a confirmed NOEIS XSS exploit.
- **CRA tooling:** react-scripts 5.0.1 is still the published release. Some old transitive major versions (SVGO/nth-check, PostCSS 7, selector parser 6, serialization, UUID, HTTP agent/once, webpack-dev-server/middleware) cannot accept the patched major through their supported ranges. Braces and node-forge also have no applicable published patched release. Do not follow audit's suggested react-scripts 0.0.0 downgrade or nodemon downgrade. A supported toolchain migration and any targeted major overrides require a separate decision; no framework rewrite attempted.
- Remaining high/low entries are tooling chains; remaining browser-runtime findings are the Tiptap moderate chain. Static production assets do not run webpack-dev-server. This classification is an exposure triage, not proof that developer compromise is harmless.
- Updating a leaf can cause npm audit to newly enumerate inherited parent chains; the inventory includes these explicitly. It never treats a lower total as proof that every package is fixed.

## Validation and release gate

Use isolated Node 22.23.4. MCP regression reproductions failed before the guards and passed after them. Baseline Linux CI from PR #589: 309 server node-style files, 62 Jest suites / 800 tests, 331 UI suites / 2922 tests, build, boot and offline harnesses green. Known Mac UI case-resolution failures and oversized chunked-upload timeout remain baseline limitations; no tests are disabled. Linux CI, independent review, then normal main auto-deploy and GET-only production smoke are required for release.

Primary references: [MCP input validation advisory](https://github.com/advisories/GHSA-46jr-4wx8-v453), [Tiptap advisory](https://github.com/advisories/GHSA-cp6q-959q-f8rh), [braces unpatched advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h). Each affected package below links to its direct advisory when one exists; other rows inherit findings from their dependency chains.

## Backend inventory

Audit package entries: 21 → 0. These are affected dependency entries, including inherited chains, not counts of confirmed application exploits.

| Package | Severity before/after | Locked versions before → after | Exposure / dependency owner | Result |
|---|---|---|---|---|
| [@modelcontextprotocol/sdk](https://github.com/advisories/GHSA-6qxp-vccf-f47h) | high / clear | 1.29.0 → 1.32.1 | runtime candidate: @modelcontextprotocol/sdk | removed from audit |
| [body-parser](https://github.com/advisories/GHSA-v422-hmwv-36x6) | moderate / clear | 1.20.3, 2.3.0 → 1.20.9, 2.4.0 | runtime candidate: @modelcontextprotocol/sdk, express | removed from audit |
| [brace-expansion](https://github.com/advisories/GHSA-f886-m6hf-6m8v) | high / clear | 1.1.12, 2.0.2 → 2.1.7 | runtime candidate: archiver, nodemon | removed from audit |
| [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | high / clear | 3.0.3 → removed | removed dev watcher chain: nodemon | removed from audit |
| `chokidar` | high / clear | 3.6.0 → removed | removed dev watcher chain: nodemon | removed from audit |
| `express` | high / clear | 4.21.2, 5.2.1 → 4.22.3, 5.3.0 | runtime candidate: @modelcontextprotocol/sdk, express | removed from audit |
| [hono](https://github.com/advisories/GHSA-5r4p-p66f-jhc7) | moderate / clear | 4.13.8 → 4.13.13 | runtime candidate: @modelcontextprotocol/sdk | removed from audit |
| [ip-address](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5) | moderate / clear | 10.7.2 → 10.7.4 | runtime candidate: @modelcontextprotocol/sdk | removed from audit |
| [jws](https://github.com/advisories/GHSA-869p-cjfg-cm3x) | high / clear | 3.2.2 → 3.2.3 | runtime candidate: jsonwebtoken | removed from audit |
| [lodash](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) | high / clear | 4.17.23 → 4.18.1 | runtime candidate: archiver | removed from audit |
| [minimatch](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | high / clear | 3.1.2, 5.1.9, 9.0.9 → 5.1.9, 9.0.9 | runtime candidate: archiver, nodemon | removed from audit |
| [mongoose](https://github.com/advisories/GHSA-wpg9-53fq-2r8h) | high / clear | 8.9.5 → 8.24.6 | runtime candidate: mongoose | removed from audit |
| `nodemon` | high / clear | 2.0.22 → removed | removed dev watcher chain: nodemon | removed from audit |
| [path-to-regexp](https://github.com/advisories/GHSA-37ch-88jc-xwx2) | high / clear | 0.1.12, 8.4.2 → 0.1.13, 8.4.2 | runtime candidate: @modelcontextprotocol/sdk, express | removed from audit |
| [picomatch](https://github.com/advisories/GHSA-3v7f-55p6-f55p) | high / clear | 2.3.1 → removed | build/dev/test: nodemon | removed from audit |
| [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | critical / clear | 2.0.7 → 2.0.8 | runtime candidate: @modelcontextprotocol/sdk, express | removed from audit |
| [qs](https://github.com/advisories/GHSA-w7fw-mjwx-w883) | moderate / clear | 6.13.0, 6.16.0 → 6.16.1 | runtime candidate: @modelcontextprotocol/sdk, express | removed from audit |
| [react-router](https://github.com/advisories/GHSA-2w69-qvjg-hvjx) | high / clear | 7.6.2 → 7.18.4 | runtime candidate: react-router-dom | removed from audit |
| `react-router-dom` | high / clear | 7.6.2 → 7.18.4 | runtime candidate: react-router-dom | removed from audit |
| [semver](https://github.com/advisories/GHSA-c2qf-rxjj-qqgw) | high / clear | 5.7.2, 6.3.1, 7.0.0, 7.7.2, 7.8.5 → 6.3.1, 7.8.5 | patched runtime + removed dev chain: jsonwebtoken, mongodb-memory-server, nodemon | removed from audit |
| `simple-update-notifier` | high / clear | 1.1.0 → removed | removed dev watcher chain: nodemon | removed from audit |

## Frontend inventory

Audit package entries: 134 → 119. These are affected dependency entries, including inherited chains, not counts of confirmed application exploits.

| Package | Severity before/after | Locked versions before → after | Exposure / dependency owner | Result |
|---|---|---|---|---|
| [@babel/core](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | low / clear | 7.26.10 → 7.29.7 | build/dev/test: react-scripts | removed from audit |
| [@babel/plugin-transform-modules-systemjs](https://github.com/advisories/GHSA-fv7c-fp4j-7gwp) | high / clear | 7.25.9 → 7.29.8 | build/dev/test: react-scripts | removed from audit |
| `@csstools/postcss-cascade-layers` | — / moderate | 1.1.1 → 1.1.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `@csstools/postcss-is-pseudo-class` | — / moderate | 2.0.7 → 2.0.7 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `@csstools/selector-specificity` | — / moderate | 2.2.0 → 2.2.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `@jest/console` | high / high | 27.5.1, 28.1.3 → 27.5.1, 28.1.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@jest/core` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@jest/environment` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@jest/fake-timers` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@jest/globals` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@jest/reporters` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@jest/test-result` | high / high | 27.5.1, 28.1.3 → 27.5.1, 28.1.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@jest/test-sequencer` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@jest/transform` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@svgr/plugin-svgo` | high / high | 5.5.0 → 5.5.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@svgr/webpack` | high / high | 5.5.0 → 5.5.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [@tiptap/core](https://github.com/advisories/GHSA-cp6q-959q-f8rh) | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/core, @tiptap/extension-placeholder, @tiptap/react, @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-blockquote` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-bold` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-bubble-menu` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/react | remaining; migration/no compatible fix |
| `@tiptap/extension-bullet-list` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-code` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-code-block` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-document` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-dropcursor` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-floating-menu` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/react | remaining; migration/no compatible fix |
| `@tiptap/extension-gapcursor` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-hard-break` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-heading` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-history` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-horizontal-rule` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-italic` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-list-item` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-ordered-list` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-paragraph` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-placeholder` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/extension-placeholder | remaining; migration/no compatible fix |
| `@tiptap/extension-strike` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-text` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/extension-text-style` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| `@tiptap/react` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/react | remaining; migration/no compatible fix |
| `@tiptap/starter-kit` | moderate / moderate | 2.27.2 → 2.27.2 | runtime candidate: @tiptap/starter-kit | remaining; migration/no compatible fix |
| [@tootallnate/once](https://github.com/advisories/GHSA-vpq2-c234-7xj6) | low / low | 1.1.2 → 1.1.2 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@typescript-eslint/eslint-plugin` | high / high | 5.62.0 → 5.62.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@typescript-eslint/experimental-utils` | high / high | 5.62.0 → 5.62.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@typescript-eslint/parser` | high / high | 5.62.0 → 5.62.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@typescript-eslint/type-utils` | high / high | 5.62.0 → 5.62.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@typescript-eslint/typescript-estree` | high / high | 5.62.0 → 5.62.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `@typescript-eslint/utils` | high / high | 5.62.0 → 5.62.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [ajv](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) | moderate / clear | 6.12.6, 8.17.1 → 6.15.0, 8.20.0 | build/dev/test: react-scripts | removed from audit |
| `babel-jest` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [body-parser](https://github.com/advisories/GHSA-v422-hmwv-36x6) | moderate / clear | 1.20.3 → 1.20.9 | build/dev/test: react-scripts | removed from audit |
| [brace-expansion](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw) | high / clear | 1.1.11, 2.0.1 → 1.1.21, 2.1.7 | build/dev/test: react-scripts | removed from audit |
| [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | high / high | 3.0.3 → 3.0.3 | build/dev/test: patch-package, react-scripts | remaining; migration/no compatible fix |
| [browserslist](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | high / clear | 4.24.4 → 4.29.4 | build/dev/test: react-scripts | removed from audit |
| `chokidar` | high / high | 3.6.0 → 3.6.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [colord](https://github.com/advisories/GHSA-2wm5-q62r-hmrv) | moderate / clear | 2.9.3 → 2.10.0 | build/dev/test: react-scripts | removed from audit |
| [compression](https://github.com/advisories/GHSA-vc2v-76pw-4v95) | high / clear | 1.8.0 → 1.8.2 | build/dev/test: react-scripts | removed from audit |
| `css-blank-pseudo` | — / moderate | 3.0.3 → 3.0.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `css-has-pseudo` | — / moderate | 3.0.4 → 3.0.4 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `css-minimizer-webpack-plugin` | moderate / moderate | 3.4.1 → 3.4.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `css-select` | high / high | 2.1.0, 4.3.0 → 2.1.0, 4.3.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `cssnano` | — / moderate | 5.1.15 → 5.1.15 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `cssnano-preset-default` | — / moderate | 5.2.14 → 5.2.14 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `eslint-config-react-app` | high / high | 7.0.1 → 7.0.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `eslint-plugin-testing-library` | high / high | 5.11.1 → 5.11.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `eslint-webpack-plugin` | high / high | 3.2.0 → 3.2.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `expect` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `express` | high / clear | 4.21.2 → 4.22.3 | build/dev/test: react-scripts | removed from audit |
| `fast-glob` | high / high | 3.3.3 → 3.3.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [fast-uri](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | high / clear | 3.0.6 → 3.1.9 | build/dev/test: react-scripts | removed from audit |
| `find-yarn-workspace-root` | high / high | 2.0.0 → 2.0.0 | build/dev/test: patch-package | remaining; migration/no compatible fix |
| [flatted](https://github.com/advisories/GHSA-25h7-pfq9-p65f) | high / clear | 3.3.3 → 3.4.4 | build/dev/test: react-scripts | removed from audit |
| `fork-ts-checker-webpack-plugin` | high / high | 6.5.3 → 6.5.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [form-data](https://github.com/advisories/GHSA-fjxv-7rqg-78g4) | critical / clear | 3.0.3, 4.0.6 → 3.0.5, 4.0.6 | runtime candidate: axios, react-scripts | removed from audit |
| [glob](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) | high / clear | 10.4.5, 7.2.3 → 10.5.0, 7.2.3 | build/dev/test: react-scripts | removed from audit |
| `globby` | high / high | 11.1.0 → 11.1.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `http-proxy-agent` | low / low | 4.0.1 → 4.0.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `http-proxy-middleware` | high / high | 2.0.7 → 2.0.10 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-circus` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-cli` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-config` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-environment-jsdom` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-environment-node` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-haste-map` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-jasmine2` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-message-util` | high / high | 27.5.1, 28.1.3 → 27.5.1, 28.1.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-resolve` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-resolve-dependencies` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-runner` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-runtime` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-snapshot` | high / high | 27.5.1 → 27.5.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-watch-typeahead` | high / high | 1.1.0 → 1.1.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `jest-watcher` | high / high | 27.5.1, 28.1.3 → 27.5.1, 28.1.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [js-yaml](https://github.com/advisories/GHSA-mh29-5h37-fv8m) | high / clear | 3.14.1, 4.1.0 → 3.15.2, 4.3.2 | build/dev/test: react-scripts | removed from audit |
| `jsdom` | low / low | 16.7.0 → 16.7.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [jsonpath](https://github.com/advisories/GHSA-6c59-mwgh-r2x6) | high / clear | 1.1.1 → 1.3.0 | build/dev/test: react-scripts | removed from audit |
| [launch-editor](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | high / clear | 2.10.0 → 2.14.2 | build/dev/test: react-scripts | removed from audit |
| [linkify-it](https://github.com/advisories/GHSA-22p9-wv53-3rq4) | high / clear | 5.0.0 → 5.0.2 | runtime candidate: @tiptap/core | removed from audit |
| [lodash](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) | high / clear | 4.17.21 → 4.18.1 | build/dev/test: @testing-library/jest-dom, react-scripts | removed from audit |
| [lodash-es](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) | high / clear | 4.17.23 → 4.18.1 | runtime candidate: react-force-graph-2d | removed from audit |
| [markdown-it](https://github.com/advisories/GHSA-6v5v-wf23-fmfq) | high / clear | 14.1.1 → 14.3.3 | runtime candidate: @tiptap/core | removed from audit |
| `micromatch` | high / high | 4.0.8 → 4.0.8 | build/dev/test: patch-package, react-scripts | remaining; migration/no compatible fix |
| [minimatch](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | high / clear | 3.1.2, 5.1.6, 9.0.5 → 3.1.5, 5.1.9, 9.0.9 | build/dev/test: react-scripts | removed from audit |
| [nanoid](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | high / clear | 3.3.11 → 3.3.20 | build/dev/test: react-scripts | removed from audit |
| [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | high / high | 1.3.1 → 1.4.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [nth-check](https://github.com/advisories/GHSA-rp65-9cf3-cjxr) | high / high | 1.0.2, 2.1.1 → 1.0.2, 2.1.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [on-headers](https://github.com/advisories/GHSA-76c9-3jph-rj3q) | low / clear | 1.0.2 → 1.1.0 | build/dev/test: react-scripts | removed from audit |
| `patch-package` | high / high | 8.0.1 → 8.0.1 | build/dev/test: patch-package | remaining; migration/no compatible fix |
| [path-to-regexp](https://github.com/advisories/GHSA-37ch-88jc-xwx2) | high / clear | 0.1.12 → 0.1.13 | build/dev/test: react-scripts | removed from audit |
| [picomatch](https://github.com/advisories/GHSA-3v7f-55p6-f55p) | high / clear | 2.3.1 → 2.3.2 | build/dev/test: patch-package, react-scripts | removed from audit |
| [postcss](https://github.com/advisories/GHSA-7fh5-64p2-3v2j) | high / high | 7.0.39, 8.5.3 → 7.0.39, 8.5.31 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `postcss-attribute-case-insensitive` | — / moderate | 5.0.2 → 5.0.2 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-calc` | — / moderate | 8.2.4 → 8.2.4 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-custom-selectors` | — / moderate | 6.0.3 → 6.0.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-dir-pseudo-class` | — / moderate | 6.0.5 → 6.0.5 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-focus-visible` | — / moderate | 6.0.4 → 6.0.4 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-focus-within` | — / moderate | 5.0.4 → 5.0.4 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-merge-longhand` | — / moderate | 5.1.7 → 5.1.7 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-merge-rules` | — / moderate | 5.1.4 → 5.1.4 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-minify-selectors` | — / moderate | 5.2.1 → 5.2.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-nested` | — / moderate | 6.2.0 → 6.2.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-nesting` | — / moderate | 10.2.0 → 10.2.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-preset-env` | — / moderate | 7.8.3 → 7.8.3 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-pseudo-class-any-link` | — / moderate | 7.1.6 → 7.1.6 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| `postcss-selector-not` | — / moderate | 6.0.1 → 6.0.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| [postcss-selector-parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | moderate / moderate | 6.1.2, 7.1.0 → 6.1.5, 7.1.7 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `postcss-unique-selectors` | — / moderate | 5.1.1 → 5.1.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| [prosemirror-view](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w) | high / clear | 1.41.6 → 1.42.7 | runtime candidate: @tiptap/core | removed from audit |
| [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | critical / clear | 2.0.7 → 2.0.8 | build/dev/test: react-scripts | removed from audit |
| [qs](https://github.com/advisories/GHSA-w7fw-mjwx-w883) | moderate / clear | 6.13.0 → 6.16.1 | build/dev/test: react-scripts | removed from audit |
| `react-dev-utils` | high / high | 12.0.1 → 12.0.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [react-router](https://github.com/advisories/GHSA-2w69-qvjg-hvjx) | high / clear | 7.6.2 → 7.18.4 | runtime candidate: react-router-dom | removed from audit |
| `react-router-dom` | high / clear | 7.6.2 → 7.18.4 | runtime candidate: react-router-dom | removed from audit |
| `react-scripts` | high / high | 5.0.1 → 5.0.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `resolve-url-loader` | moderate / moderate | 4.0.0 → 4.0.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [rollup](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) | high / clear | 2.79.2 → 2.80.0 | build/dev/test: react-scripts | removed from audit |
| `rollup-plugin-terser` | high / high | 7.0.2 → 7.0.2 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `selfsigned` | — / high | 2.4.1 → 2.4.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| [serialize-javascript](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) | high / high | 4.0.0, 6.0.2 → 4.0.0, 6.0.2 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [shell-quote](https://github.com/advisories/GHSA-w7jw-789q-3m8p) | critical / clear | 1.8.2 → 1.12.0 | build/dev/test: react-scripts | removed from audit |
| `sockjs` | moderate / moderate | 0.3.24 → 0.3.24 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | high / clear | 1.2.1 → 1.2.2 | build/dev/test: react-scripts | removed from audit |
| `stylehacks` | — / moderate | 5.1.1 → 5.1.1 | build/dev/test: react-scripts | remaining; migration/no compatible fix; newly listed inherited chain |
| [svgo](https://github.com/advisories/GHSA-2p49-hgcm-8545) | high / high | 1.3.2, 2.8.0 → 1.3.2, 2.8.4 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `tailwindcss` | high / high | 3.4.17 → 3.4.17 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `terser-webpack-plugin` | moderate / moderate | 5.3.14 → 5.3.14 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [tmp](https://github.com/advisories/GHSA-ph9p-34f9-6g65) | high / clear | 0.2.5 → 0.2.7 | build/dev/test: patch-package | removed from audit |
| [underscore](https://github.com/advisories/GHSA-qpx9-hpmf-5gmw) | high / clear | 1.12.1 → 1.13.8 | build/dev/test: react-scripts | removed from audit |
| [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | moderate / moderate | 8.3.2 → 8.3.2 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [webpack](https://github.com/advisories/GHSA-8fgc-7cc6-rx7x) | low / clear | 5.98.0 → 5.112.2 | build/dev/test: react-scripts | removed from audit |
| [webpack-dev-middleware](https://github.com/advisories/GHSA-g84c-rxfj-3j2c) | high / high | 5.3.4 → 5.3.4 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [webpack-dev-server](https://github.com/advisories/GHSA-9jgg-88mc-972h) | high / high | 4.15.2 → 4.15.2 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [websocket-driver](https://github.com/advisories/GHSA-mp7j-qc5w-4988) | critical / clear | 0.7.4 → 0.7.5 | build/dev/test: react-scripts | removed from audit |
| `workbox-build` | high / high | 6.6.0 → 6.6.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| `workbox-webpack-plugin` | high / high | 6.6.0 → 6.6.0 | build/dev/test: react-scripts | remaining; migration/no compatible fix |
| [ws](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | high / clear | 7.5.10, 8.18.1 → 7.5.13, 8.22.0 | build/dev/test: react-scripts | removed from audit |
| [yaml](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) | moderate / clear | 1.10.2, 2.7.1, 2.8.1 → 1.10.3, 2.9.1 | build/dev/test: patch-package, react-scripts | removed from audit |

## Local verification record

- New bounded MCP element, byte-size, chunked-body and unsupported-content-type tests passed after failing before their respective guards. The real SDK hosted MCP suite, boot check and offline harnesses pass.
- Native Node watch restarts a fixture when an imported file changes. JSONPath / patched Underscore / BFJ compatibility smoke passes.
- Full Mac UI remains 327/331 suites and 2859/2922 tests, with the same 63 baseline case-resolution failures; build retains the baseline ReturnGreeting import resolution failure.
- Full Mac server: 309/311 node files, 61/62 Jest suites. One node failure is the known chunked-upload timeout. Archive and agent-eval suites hit temporary Mongo port collisions; both pass when rerun alone. No assertion or test gate changed.

Independent review found no blocking source issue. It identified a separate standalone MCP lockfile that could restore seven vulnerable dependency entries; compatible nested HTTP/parser updates remove all seven (standalone MCP audit 7 → 0), and the complete MCP package suite passes again. No package was published.
