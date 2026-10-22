# Phase 1 assessment — 598b144b-1531-4d8f-979d-be6555be2ebb

Checked 2026-10-20 UTC. Observations below concern the **unchanged** tracked source and lockfiles; baseline ran on Linux, Node v22.23.3, npm 10.9.9. Raw logs and scanner JSON are local-only under `.modernization-scratch/`.

## Summary

- **Goal:** Upgrade the application to Node.js 24 LTS, pin `.nvmrc` and `engines.node` in all manifests, obtain passing full build/tests/lint, add characterization tests, and fix compatible dependency advisories. Deployment and ACS behavior changes are outside scope.
- **Recommendation:** In-place upgrade of the npm workspaces, beginning with a **red baseline** and test harness stabilization; isolate advisory fixes by dependency family. Overall risk **high**: the clean install builds unsuccessfully, there are no repository tests, and the audit reports critical vulnerabilities.
- **Baseline:** build **RED** (missing Rollup Linux native optional package); tests **not configured**, `npm test` exits 1 before discovering any tests (0 passed / 0 failed / 0 skipped; **not** a green suite); lint **GREEN with five warnings**. No failures changed on one retry.

## Inventory / Stack inventory

`git ls-files | wc -l`: **65 tracked files**; extensions: 26 TSX, 9 JSON, 7 TS, 7 MD, 7 JS, 3 CSS, plus other files. The root workspace graph (`package.json:6-9`) is **root → backend, frontend**; no local cross-workspace dependencies. Upgrade/test backend and frontend independently before the root validation. The root npm v3 lock has 903 package entries; `backend/package-lock.json` is a **second** tracked v3 lock with 174 entries (JSON inspection). No tracked frontend lock. No `.nvmrc`, `.node-version`, packageManager pin, `@types/node` direct dependency, test runner, test/spec files, `.npmrc`, Dockerfile, compose files, or CI workflows were found by tracked-file inventory and targeted searches. `frontend/staticwebapp.config.json` and `frontend/swa-cli.config.json` are deployment configurations, not in upgrade scope.

| Unit | Path | Kind / stack | Current evidence | Candidate |
|---|---|---|---|---|
| Root | `package.json` | npm workspaces / orchestrator | `engines.node: >=22.0.0` (:10-12); `build` builds frontend and `lint` lints frontend (:18-20); no test script | Node 24 LTS `.nvmrc` + consistent engine |
| Backend | `backend/package.json`, `backend/server.js`, `backend/services/*.js` | ESM Express API and Azure SDKs | `>=22.0.0` (:6-9); `express ^4.18.2` (:22); installed 4.21.2 in backend lock; no build/lint/test scripts (:10-13) | Node 24; keep ESM and API/call behavior |
| Frontend | `frontend/package.json`, `frontend/src` | React / TypeScript / Vite SPA | `>=22.0.0` (:5-8), React `^19.0.0` (:42), TS `~5.7.2` (:67), Vite `^6.3.5` (:69); locked React 19.2.0, TS 5.7.3, Vite 6.4.1. `tsconfig.json:4,11,15` target ES2020/module ESNext/bundler | Node 24; preserve React/browser wire behavior |

No Python/.NET/Java build units are tracked; Python snippets in README are documentation, not a project. npm packages are fetched from public `registry.npmjs.org` per lock `resolved` entries; no private feed was found. `backend/.env.example` and `frontend/.env.example` were inspected for **setting names only**.

## Version and support facts / Support status

| Fact | Value | Official source URL | Checked on |
|---|---|---|---|
| Node 22 runtime presently used | v22.23.3 (`node --version`); maintenance from 2025-10-21, end 2027-04-30 | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | 2026-10-20 |
| Requested Node 24 target | LTS from 2025-10-28, maintenance from **2026-10-20**, end **2028-04-30** | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | 2026-10-20 |
| Node 26 is not yet LTS on assessment date | scheduled LTS 2026-10-28; Node 24 is appropriate requested LTS | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | 2026-10-20 |
| Vite candidate 6.4.4 runtime range | npm registry `npm view vite@6.4.4 engines --json` reports `^18.0.0 || ^20.0.0 || >=22.0.0`, includes Node 24 | https://www.npmjs.com/package/vite/v/6.4.4 | 2026-10-20 |
| Current Azure Call Automation SDK engine | `npm view @azure/communication-call-automation@1.5.0 engines --json`: `>=20.0.0`, includes Node 24 | https://www.npmjs.com/package/@azure/communication-call-automation/v/1.5.0 | 2026-10-20 |
| React 19, Express 4, Spark 0.39, TypeScript 5.7 lifecycle end dates | **Unverified**: npm registry metadata did not publish an applicable support end date; do not assume a Node-24 compatibility guarantee for the whole dependency graph | Registry manifests, `npm outdated --json --workspaces --include-workspace-root` | 2026-10-20 |

The Node 24 executable is **not available in this assessment**; all baseline checks used the installed Node 22 runtime. Do not claim that dependencies/build have passed on 24.

## Build, test and CI / Test baseline

Commands executed from repository root with `CI=true TZ=UTC LANG=C.UTF-8`; each has a 600-second subprocess timeout. First four raw logs are `.modernization-scratch/baseline/{npm-ci,build,test,lint}.log`; retries are `build-retry.log`, `test-retry.log`. No CI definition is tracked; README `README.md:263-269` documents `npm install` and dev/start rather than test/build/CI, so the scenario commands are the baseline source. npm installation used **`npm ci` rather than README's `npm install`** to preserve the tracked lockfiles.

| Exact command | Exit | Duration | Findings / warnings |
|---|---:|---:|---|
| `npm ci` | 0 | 128.78 s | 893 packages added, 896 audited, 4 `npm warn deprecated` lines (`sudo-prompt@8.2.5`, `inflight@1.0.6`, `glob@7.2.3`, `rimraf@2.7.1`); npm reported 53 root vulnerabilities |
| `npm run build --if-present` | 1 | 7.56 s | Frontend `tsc -b --noCheck` ran, then Vite exited: `Error: Cannot find module @rollup/rollup-linux-x64-gnu`; zero warning lines. Root lock has **no** entry for that Rollup optional Linux package and installation did not provide it. |
| `npm test` | 1 | 0.59 s | `npm error Missing script: "test"`; zero test cases discoverable, no result file, failing test IDs: **none** (test runner never launched), zero warning lines |
| `npm run lint --if-present` | 0 | 7.81 s | ESLint: 0 errors, **5 lint warnings** (`App.tsx:44` two; `badge.tsx:46`, `button.tsx:59`, `form.tsx:157` one each); runner captured six lines containing “warn” because the summary also says “5 warnings” |
| `npm run build --if-present` (retry) | 1 | 8.86 s | Same missing Rollup native module; deterministic in this environment |
| `npm test` (retry) | 1 | 0.58 s | Same missing test script; not flaky |

**Classification:** build failure is a genuine lock/install optional-dependency defect (environment-specific Linux manifestation), not a failing application test. `npm test` is a genuine missing validation infrastructure defect. No individual tests failed, no test result XML/JSON exists, and there is no basis for a flaky-test classification or test exclusion. The default build uses `--noCheck` (`frontend/package.json:11`), so it does **not** prove full TypeScript type correctness. Proposed post-stabilization gates: `npm ci`, `npm run build --if-present`, `npm test` (new complete root workspace suite), `npm run lint --if-present`; also validate frontend with `npm exec --workspace frontend -- tsc --noEmit -p tsconfig.json`, and run native scanner. Do not narrow gates or weaken the five existing lint rules.

## Dependencies and vulnerabilities

Mandated command `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .` exited **2** in 9.15 seconds. npm audit JSON is in `scan/npm-..json` (root) and `scan/npm-backend.json` (additional backend lock). **Root: 53 affected package names: 3 critical, 35 high, 12 moderate, 3 low. Backend: 18 affected names: 2 critical, 10 high, 6 moderate, 0 low.** Backend names overlap the root list; **do not sum the counts**. Scanner `fixAvailable` is a candidate, not evidence that its proposed upgrade preserves behavior. Actual advisory count may exceed affected-package count where one package has multiple advisories. Both lockfiles must be updated and rescanned as appropriate in implementation.

| Package / path | Locked installed | Advisory and first patched candidate | Direct / transitive; recommendation |
|---|---|---|---|
| `fast-xml-parser` in backend lock | 5.3.0 | multiple findings including critical [GHSA-m7jm-9gc2-mpf2](https://github.com/advisories/GHSA-m7jm-9gc2-mpf2); aggregate vulnerable through 5.6.0; >=5.7.0 clears scanner range including [GHSA-gh4j-gqv2-49f6](https://github.com/advisories/GHSA-gh4j-gqv2-49f6) | transitive, inspect Azure SDK dependency chain and minimum compatible upgrade; actual XMLBuilder exploitability not established |
| `proxy-addr` in backend lock | 2.0.7 | critical [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), fixed 2.0.8 | Express transitive; advisory needs particular proxy trust configuration; check whether app config enables it |
| `shell-quote` in root lock | 1.8.3 | critical [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv), scanner affected <=1.8.4; >=1.8.5 candidate pending parent constraints | transitive developer/tool path; inspect actual call path |
| `rollup` in root lock | 4.52.5 | high [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc), fixed 4.59.0 | Vite transitive; upgrade alongside Vite; separately fix missing optional native binary |
| `vite` in root lock | 6.4.1 | high, multiple advisories through 6.4.3; 6.4.4 is in-range candidate ([GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)) | frontend direct; assess dev server exposure, keep Vite toolchain compatible |
| `express` in backend lock | 4.21.2 | high via `body-parser`/`path-to-regexp`/`qs`, scanner range through 4.22.2; 4.22.3 available from `npm outdated` | backend direct; prefer same-major patch, preserve HTTP surface |
| `uuid` in both workspaces | 11.1.0 | moderate [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq); fixed 11.1.1 | both direct and transitive through Azure MSAL / speech SDK; patch in both lock contexts |

Audit details and fixed ranges above derive from the saved npm audit JSON; the linked GHSA pages for Rollup, proxy-addr, shell-quote and fast-xml-parser were independently fetched on 2026-10-20. Other advisory ranges/versions should be independently verified during triage, not assumed from scanner summary alone. `npm outdated` additionally reports newer same-range Azure SDKs, React 19.3.1, TypeScript 5.7.3 (latest 7.0.2), `typescript-eslint` 8.72.0, Vite 6.4.4 (latest 8.3.4), and Express 4.22.3 (latest 5.3.0); these are **not** mandates for disruptive major upgrades. npm ci warns of deprecated `sudo-prompt`, `inflight`, `glob@7`, `rimraf@2`; identify the owning dev-tool chains before replacing them. `git grep` detected no tracked `binding.gyp`, `node-sass`, `tslint`, or `react-scripts`; native Rollup optional package remains the build blocker. Full Node-24 support for all transitive packages is **unverified** pending clean installation and gate runs on Node 24.

## Blockers and hotspots

| Pattern / issue | Affected area | Evidence and migration approach |
|---|---|---|
| Missing platform-specific optional dependency | 1 build chain | Root lock missing `@rollup/rollup-linux-x64-gnu`; build log's first error; repair via package manager in a later baseline-stabilization task, validate clean `npm ci` on Linux; never hand-edit lock |
| No automated tests | 0 tracked `*test*`/`*spec*` source files and 0 test scripts across 3 manifests | Add suite/runner and characterization tests before modifying behavior; ensure `npm test` discovers and executes tests |
| Backend HTTP and ACS paths | `backend/server.js:24-27,69-95`, `backend/services/webhook-handler.js:18-74`, `backend/services/call-service.js:14-41` | Mock SDK and test route contracts/DTMF normalization without live calls; avoid ACS behavior changes |
| Frontend transaction serialization and presentation | `frontend/src/lib/transaction-utils.ts:3-71,74-95`, `frontend/src/lib/call-service.ts:14-48,88-151` | Pin ID shape, monetary/string/date formatting, audit events, request/response fields and polling terminal states under stable TZ/locale |
| Untested TypeScript semantics | `frontend/package.json:11`, `frontend/tsconfig.json:4-28` | `--noCheck` bypasses type-checking; add explicit check gate if practical without weakening existing settings; do not force TS 7 until Vite/Spark/ESLint compatibility is verified |

## Test services

No test code, Testcontainers, Docker/compose service definitions, or integration test service exists. `docker version` returned server version **29.8.2**; `DOCKER_HOST` and `TESTCONTAINERS_HOST_OVERRIDE` are **set** (values withheld). If future tests start containers, connect to published ports through the **remote Docker host**, not localhost, using the override; no containers were started during assessment. For **real** backend operations, setting names include `ACS_CONNECTION_STRING`, `ACS_PHONE_NUMBER`, `CALLBACK_BASE_URL`, `AZURE_TTS_KEY`/`AZURE_SPEECH_KEY`, `AZURE_TTS_REGION`/`AZURE_SPEECH_REGION`, `AZURE_TTS_ENDPOINT`/`COGNITIVE_SERVICES_ENDPOINT`, `AZURE_STORAGE_CONNECTION_STRING`, and `AZURE_STORAGE_ACCOUNT_NAME` (`backend/services/*.js`; `.env.example`). Key-name-only environment inspection found the principal ACS/TTS/storage credentials unset. No external Azure endpoint was contacted; characterization tests should use local in-process mocks/fakes, with no real calls or storage. Frontend setting: `VITE_BACKEND_URL` (`frontend/src/lib/call-service.ts:4`).

## Coverage and characterization candidates

Observed coverage: **none recorded**; no test suite and no coverage collection. Prioritize (1) pure frontend `generateCallScript`, `createTransaction`, `formatTimestamp`, `formatCurrency` with frozen clock/TZ/locale (`transaction-utils.ts`); (2) backend `WebhookHandler.normalizeTone` and event transitions using stubbed ACS and TTS (`backend/services/webhook-handler.js`), pinning behavior **without altering ACS integration**; (3) backend HTTP `/health`, `/api/calls/initiate`, status and callback payload/status handling with local stubs and no live services (`backend/server.js`); (4) frontend `CallService` request JSON, status merge, retries and polling cleanup with fake timers/fetch (`frontend/src/lib/call-service.ts`). Add these tests against unchanged application behavior first; preserve observed quirks in assertions.

## Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Build cannot pass with clean locked install; untested on target Node 24 | **high** | High | Stabilize optional Rollup package/lock using npm, clean `npm ci` on Linux and Node 24, rerun full build |
| Zero test discovery means silent route/call/format regressions | **high** | High | Install test runner and characterization coverage before upgrades; establish root full-suite command |
| 53 root affected packages, including three critical; separate backend lock | **high** | High | Triage reachable paths, patch smallest compatible family, rerun both scanners and full gates |
| Azure services unavailable locally; accidental real calls or secret leakage | **medium** | Medium | Mock SDK/service boundaries; no live ACS integration required for in-scope changes; log names only |
| npm deprecation and Vite/Spark/TS toolchain interoperability on Node 24 | **medium** | Medium | Upgrade in small families, test with Node 24; keep TS 5.x unless toolchain needs change |
| ESLint baseline five warnings and `--noCheck` hide quality regressions | **medium** | Medium | Preserve lint baseline, add explicit type gate, do not suppress warnings or narrow validation |
| CI and runtime pin do not exist yet | **low** | Medium | `.nvmrc`/three engines in scope; do not create deployment or CI changes without scope approval |

## Recommended approach / Candidate tasks

**Recommendations (not baseline facts):**
1. **Baseline stabilization:** repair missing Rollup native optional artifact through npm-managed lock update; define a root test command and test runner without masking failures; verify clean `npm ci`/build/test/lint on Linux. Skills: `test-baseline-and-characterization`, `build-fix-loop`.
2. **Characterization tests:** pin unchanged backend request/event/DTMF behavior and frontend transaction formatting/polling before relevant dependency changes; all external SDK calls mocked. Skill: `test-baseline-and-characterization`.
3. **Node pin:** install/test Node 24, add `.nvmrc`, align `engines.node` in root/backend/frontend; update any relevant type annotations only if toolchain compatible. Skills: `node-typescript-upgrade`, `build-fix-loop`.
4. **Advisory fixes in small families:** fix backend Express/HTTP transitive packages and Azure/Speech XML chain, then frontend Vite/Rollup/toolchain, then other compatible vulnerable dependency chains; reconcile both npm locks through npm and audit again. Skills: `dependency-vulnerability-remediation`, `node-typescript-upgrade`, `build-fix-loop`.
5. **Final validation/report:** clean install on Node 24, full build, full test suite with same-or-higher discovery count, lint, explicit type check, and both-target scanner; review untouched deployment/ACS behavior. Skills: `test-baseline-and-characterization`, `modernization-report`.

## Open questions

- If a high/critical advisory requires an incompatible **major** SDK/framework upgrade or ACS wire behavior change, should it be deferred with documented mitigation or separately approved? **Recommendation:** preserve current major and ACS behavior in this run; escalate only when same-major mitigation cannot clear it.
- Should a preexisting second `backend/package-lock.json` remain authoritative for backend standalone installs, or should the repository standardize exclusively on the root workspace lock? **Recommendation:** investigate backend standalone install expectations before removing or changing either lock; validate both scanner targets meanwhile.
- Does the owner require a TypeScript full type-check gate beyond the existing build's `--noCheck`? **Recommendation:** add it after measuring existing diagnostics, without weakening the current build.

No source files, manifests, lockfiles, configuration, or deployment files were intentionally changed during this assessment. `git status --short` was empty after baseline and scan. `.git/info/exclude` was locally updated to ignore `.modernization-scratch/`.
