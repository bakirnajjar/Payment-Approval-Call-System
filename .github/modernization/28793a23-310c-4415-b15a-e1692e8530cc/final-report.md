# Modernization report: Upgrade Node.js to the current LTS

Outcome: PARTIAL - 8 of 9 tasks completed (T009 in progress, checkpoint pending); build GREEN; tests 35/35 passing (unmodified baseline 0/0 discovered). Node 24 gates pass, but the two-lock security scan is **not clean**, hosted runtime and live Azure behavior are unverified, and this report has not yet received its T009 checkpoint.

## Summary

- Goal: Move the root npm workspace, frontend and backend from the observed Node 22 environment to Node 24 LTS without changing application behavior. Scenario: `node-upgrade`; path scope: whole repository. [Assessment](assessment.md) and [approved plan](plan.md).
- Strategy: in-place, incremental repair and characterization before the runtime and dependency changes. Branch `modernization`, based on `main`; eight checkpoint commits as of this report (`git log --oneline main..HEAD`, 2026-10-20). No application implementation, route or wire-format files changed; the tests describe observed behavior, including existing oddities.
- **Security outcome is partial:** both lockfiles were scanned after the last dependency edit; 38 affected package entries in the root lock and six in the standalone backend lock remain. These are *per-lock package entries*, not 44 independent advisories. Neither outstanding finding acceptance nor proof of non-reachability exists.

## Versions

Versions are installed environment values or resolved versions from `package-lock.json` and `backend/package-lock.json`, compared with `main` locks; manifest ranges are not mistaken for installed versions. Support claims below were checked against the [official Node release page](https://nodejs.org/en/about/previous-releases) and [release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) on **2026-10-20**; support dates for the libraries and npm are unknown.

| Component | Before | After | Support / source |
|---|---|---|---|
| Node.js; root/frontend/backend engines | Host 22.23.3; `>=22.0.0` | Explicit gates 24.21.0; `>=24.0.0 <25.0.0`, `.nvmrc` `24` | Node 22 LTS through 2027-04-30; Node 24 LTS through 2028-04-30. Node 26 still Current on check date (official links above); **the default runner PATH still selects Node 22**. |
| npm / both lock formats | 10.9.9; lockfileVersion 3 | 11.19.0 under explicit Node 24; lockfileVersion 3 | [Assessment](assessment.md), [T004](progress/T004.md), [T009](progress/T009.md); npm support date unknown. |
| Backend framework Express / parser | 4.21.2 / body-parser 1.20.3 | 4.22.3 / 1.20.8 | [T005](progress/T005.md); library support dates unknown. |
| Frontend React / Vite / TypeScript / ESLint | 19.2.0 / 6.4.1 / 5.7.3 / 9.38.0 | 19.2.0 / 6.4.3 / 5.7.3 / 9.38.0 | Locks, [T007](progress/T007.md); library support dates unknown. |
| Vitest (frontend test framework) | absent | 3.2.7 | [T001](progress/T001.md); outstanding critical derived audit entry, not a security-safe version. |
| Azure Identity / ACS Call Automation / Speech SDK | 4.13.0 / 1.5.0 / 1.46.0 | 4.13.1 / 1.5.0 / 1.51.0 | Locks, [T006](progress/T006.md); live Azure compatibility unverified. |
| Azure Static Web Apps CLI | 2.0.7 | 2.0.7 | Locks, [T008](progress/T008.md); deployment unverified. |

## Tasks

| Key | Title | Status | Checkpoint | Result / progress |
|---|---|---|---|---|
| T001 | Stabilize clean build and establish both test suites | completed | `7245777` | Linux optional binary resolution and 7-test green baseline; [note](progress/T001.md). |
| T002 | Characterize backend routes and Azure boundaries | completed | `fa609ac` | Offline backend route/service characterization, 15 total tests; [note](progress/T002.md). |
| T003 | Characterize frontend transaction and call state | completed | `0b62043` | Offline formatting/call-state characterization, 35 total tests; [note](progress/T003.md). |
| T004 | Pin and verify Node 24 across the workspaces | completed | `adf6a63` | Engines, locks, `.nvmrc`, documentation; explicit Node 24 checks; default host still Node 22; [note](progress/T004.md). |
| T005 | Repair backend HTTP dependency advisories | completed | `6aae8c8` | Same-major Express/parser and transitive HTTP fixes in both locks; [note](progress/T005.md). |
| T006 | Repair Azure runtime dependency advisories | completed | `0002189` | Identity, Speech, XML, WebSocket, JWT/UUID chain fixes; [note](progress/T006.md). |
| T007 | Repair frontend Vite build-tool advisories | completed | `56e106a` | Compatible Vite/Rollup/CSS chain fixes; [note](progress/T007.md). |
| T008 | Repair frontend delivery-tool advisory chain | completed | `96fda59` | In-range `shell-quote` fix; other findings remain; [note](progress/T008.md). |
| T009 | Final validation and report | **in progress** | **pending** | Post-change validation recorded; report now written; completion gate/review and checkpoint still pending; [note](progress/T009.md). |

No task is failed or skipped. This report is the only new tracked-path edit for T009; it is **not committed or pushed**.

## Validation

All final commands below were run **after** the T008 lockfile edit under `PATH=/opt/node/24/bin:$PATH`, Node 24.21.0/npm 11.19.0, per [T009 validator note](progress/T009.md) and ignored `.modernization-scratch/logs/t009-*.log`. The default host Node 22 must not be confused with that explicit runtime. The unmodified baseline is [assessment.md](assessment.md); the first runnable green baseline is [T001](progress/T001.md).

| Gate | Exact command | Unmodified baseline | Final (2026-10-20) |
|---|---|---|---|
| Root clean install | `npm ci` | Passed on Node 22 | Passed on Node 24; 901 packages; install deprecation/deferred-script notices |
| Standalone backend clean install | `npm ci --prefix backend` | Not recorded | Passed on Node 24; 181 packages |
| Build | `npm run build --if-present` | Failed twice: missing Linux Rollup optional binary | Passed, 6,244 modules; **3 CSS optimizer warnings** |
| Full tests | `npm test` | Failed twice: no root script; **0 discovered**, not a passing suite | **35 passed / 0 failed / 0 skipped** (backend 10, frontend 25) |
| Lint | `npm run lint --if-present` | Passed, 0 errors / **5 warnings** | Passed, 0 errors / **5 warnings** |
| Typecheck | `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json` | Passed | Passed; build's own `tsc -b --noCheck` is not a substitute |
| Native two-lock scan | `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .` | Exit 2, root 53 / backend 18 affected entries | **Exit 2, findings**: root 38 / backend 6; both targets completed |

Test progression: T001 7/7 (backend 2, frontend 5), T002 15/15 (10 + 5), T003 and final 35/35 (10 + 25); zero failed or skipped throughout the runnable suites. Test files added: `backend/tests/dtmf-normalization.test.js`, `backend/tests/routes-characterization.test.js`, `backend/tests/azure-boundaries-characterization.test.js`, `frontend/tests/transaction-formatting.test.ts`, `frontend/tests/call-service.test.ts`; `frontend/vitest.config.ts` isolates the test runner. **Approved test exclusions: none.** No test was removed to obtain the final count. Three CSS optimizer warnings appeared by the first green T001 build; the five lint warnings existed at the original baseline. Warnings remain; no evidence they are harmless in every environment.

## Dependencies and security

Changed files: root, backend and frontend `package.json`; root and standalone `backend/package-lock.json` (npm-generated); `.npmrc`, `.nvmrc`, `README.md`; the five test files and Vitest config above; assessment, plan and progress artifacts. `git diff --stat main...HEAD` and `git diff --name-status main...HEAD` enumerate the checkpointed changes; no tracked workflow, Dockerfile, application implementation or Azure configuration changed.

| Package or family | Before → after | Change / reason |
|---|---|---|
| Linux optional binaries | missing root lock entries → explicit root optional dependencies for Rollup 4.64.12, esbuild 0.25.11, SWC 1.13.21, Tailwind Oxide 4.1.16, Lightning CSS 1.30.2 | Added platform-specific install entries to repair reproducible Linux build; revisit pins with parent upgrades ([T001](progress/T001.md), [T007](progress/T007.md)). |
| Vitest | absent → 3.2.7 | Added frontend test runner, **not** a vulnerability fix ([T001](progress/T001.md)). |
| Express / body-parser / proxy-addr / path-to-regexp / qs | 4.21.2 → 4.22.3 / 1.20.3 → 1.20.8 / 2.0.7 → 2.0.8 / 0.1.12 → 0.1.13 / 6.13.0 → 6.16.1 | Same-major backend HTTP remediation in both graphs ([T005](progress/T005.md)); no Express 5 migration. |
| Azure Identity / MSAL / Speech / fast-xml-parser / ws / jws / uuid | 4.13.0 → 4.13.1 / 3.8.0 → 5.6.0 / 1.46.0 → 1.51.0 / 5.3.0 → 5.11.2 / 8.18.3 → 8.22.0 / 3.2.2 → 4.0.1 / mixed old versions → 11.1.1 | Direct Azure/Speech updates and npm-resolved transitive patches in both locks ([T006](progress/T006.md)); MSAL/jws transitive major changes are parent-driven. |
| Vite / Rollup / PostCSS / nanoid / source-map-js | 6.4.1 → 6.4.3 / 4.52.5 → 4.64.12 / 8.5.6 → 8.5.31 / 3.3.11 → 3.3.20 / 1.2.1 → 1.2.2 | Frontend build-time fixes ([T007](progress/T007.md)). |
| shell-quote | 1.8.3 → 1.12.0 | SWA CLI → concurrently transitive in-range refresh, fixes critical GHSA-w7jw-789q-3m8p and high GHSA-395f-4hp3-45gv; CLI unchanged ([T008](progress/T008.md)). |

Verified examples of **fixed** advisories and sources: proxy-addr [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), fast-xml-parser [GHSA-m7jm-9gc2-mpf2](https://github.com/advisories/GHSA-m7jm-9gc2-mpf2), Vite [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), Rollup [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc), and shell-quote above; patched-version/parent evidence and other resolved IDs are in [T005](progress/T005.md)–[T008](progress/T008.md). **Do not equate falling affected-package counts with a number of unique advisories fixed.** Initial [assessment](assessment.md): root **3 critical / 35 high / 12 moderate / 3 low = 53**, backend **2 / 10 / 6 / 0 = 18**. Final [T009](progress/T009.md) and `.modernization-scratch/scan/npm-..json`, `.modernization-scratch/scan/npm-backend.json`: root **2 / 26 / 7 / 3 = 38**, backend **0 / 6 / 0 / 0 = 6**. The two locks overlap. `.modernization-scratch/scan/scanner.log` can reflect an earlier scan; the final raw JSON and dated T009 validator log/note are authoritative for the final counts.

### Every remaining affected package entry (open, not accepted)

Versions and severity below are the affected node versions/severities in the **final** npm audit JSON and the corresponding lock files, 2026-10-20. `→` denotes a derived parent entry: its severity aggregates descendant advisories; it is **not** another independent advisory. Sources below identify the lock and known parent chain; when the immediate parent has not been independently established, the lock node is the evidence rather than a guessed import chain. **Every row's status is open; owner: dependency/security maintainer to triage, characterize, patch and request explicit disposition.** Reachability labels are hypotheses, not claims of safety. The raw JSON contains *all* advisory IDs and ranges, including multiple IDs for a single package; representative IDs and constraints appear in [T007](progress/T007.md), [T008](progress/T008.md) and [T009](progress/T009.md).

| Lock / severity | Affected package and installed version | Source / plausible reachability and owner follow-up |
|---|---|---|
| Root critical | `tinypool` 1.1.1 | Frontend Vitest 3 transitive, [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) and [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr); test-process prototype-pollution path unverified. Owner: characterize a patched Vitest major migration, not a forced change. |
| Root critical | `vitest` 3.2.7 | Direct frontend dev dependency → `tinypool`, `@vitest/mocker`; derived critical, including [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9). Owner: migrate test runner with tests; do not expose dev sockets meanwhile. |
| Root high | `@azure/static-web-apps-cli` 2.0.7 | Frontend delivery CLI → `adm-zip`, `cookie`, `devcert` (derived); local/deployment inputs unverified. Owner: characterize ZIP/config/deployment workflows and update parent or targeted transitives. |
| Root high | `@typescript-eslint/eslint-plugin` 8.46.2 | Frontend lint tooling → `type-utils`/`utils` (derived); linting untrusted input not assessed. Owner: upgrade lint chain with lint gate. |
| Root high | `@typescript-eslint/parser` 8.46.2 | Frontend lint tooling → `typescript-estree` (derived); same owner/action. |
| Root high | `@typescript-eslint/type-utils` 8.46.2 | ESLint plugin → `typescript-estree`/`utils` (derived); same owner/action. |
| Root high | `@typescript-eslint/typescript-estree` 8.46.2 | ESLint chain → `fast-glob` (derived); same owner/action. |
| Root high | `@typescript-eslint/utils` 8.46.2 | ESLint chain → `typescript-estree` (derived); same owner/action. |
| Root high | `adm-zip` 0.5.16 | SWA CLI archive handling; [GHSA-8238-w5pm-2374](https://github.com/advisories/GHSA-8238-w5pm-2374) and additional advisories; malicious ZIP input possible in delivery tooling. Owner: test patched archive path; CLI range `^0.5.14` does not admit indicated >=0.6.1. |
| Root high | `axios` 1.12.2 | Root frontend/tooling lock node; immediate consuming parent and exposure unverified, network input plausible. Owner: trace with `npm explain axios`, upgrade parent or compatible package and test. |
| Root high | `brace-expansion` 1.1.12, 2.0.2 | Root and nested tooling lock nodes (including TypeScript-ESLint/rimraf); input-controlled patterns unverified. Owner: update compatible glob/tool parents. |
| Root high | `braces` 3.0.3 | Tooling → `chokidar`/`micromatch`; [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm); untrusted glob input unverified. Owner: update tooling chain. |
| Root high | `browserslist` 4.27.0 | Frontend build/tooling graph; build-input reachability unverified. Owner: patch compatible build tooling. |
| Root high | `chokidar` 3.6.0 | Dev watcher → `braces` (derived), also nodemon chain; untrusted filename/pattern exposure unverified. Owner: patch watcher parent. |
| Root high | `fast-glob` 3.3.3 | TypeScript-ESLint → `micromatch` (derived); untrusted glob input unverified. Owner: lint-tool update. |
| Root high | `flatted` 3.3.3 | Root tooling lock node; parser input/parent unverified. Owner: trace parent and patch. |
| Root high | `form-data` 4.0.4 | Root tooling lock node; multipart input/parent unverified. Owner: trace parent and patch. |
| Root high | `glob` 10.4.5 | Nested `rimraf` lock node; untrusted pattern input unverified. Owner: patch compatible cleanup/tool chain. |
| Root high | `joi` 17.13.3 | Root tooling lock node; schema/input path and parent unverified. Owner: trace parent and patch. |
| Root high | `js-yaml` 4.1.0 | Root tooling lock node; untrusted YAML input/parent unverified. Owner: trace parent and patch. |
| Root high | `lodash` 4.17.21 | Root tooling lock node; affected API and parent unverified. Owner: trace affected call chain, patch parent. |
| Root high | `micromatch` 4.0.8 | Fast-glob → `braces` (derived); untrusted glob input unverified. Owner: lint/build-tool update. |
| Root high | `minimatch` 3.1.2, 9.0.5 | Root and nested TypeScript-ESLint/rimraf nodes; glob input unverified. Owner: update compatible parents. |
| Root high | `node-forge` 1.3.1 | Root tooling lock node; certificate/crypto input and immediate parent unverified. Owner: trace parent and patch, especially dev TLS use. |
| Root high | `nodemon` 3.1.10 | Backend dev tool → `chokidar` (derived); watcher input unverified. Owner: find tested compatible fixes, **not** audit-suggested major downgrade to 1.14.10. |
| Root high | `picomatch` 2.3.1, 4.0.3 | Root and nested tinyglobby/Vite nodes; pattern input unverified. Owner: patch parent glob chain. |
| Root high | `tmp` 0.0.33 | SWA CLI → `devcert` → `tmp`; local temporary-file exposure unverified. Owner: patch devcert/delivery chain. |
| Root high | `typescript-eslint` 8.46.2 | Frontend direct lint tooling → plugin/parser (derived); same lint-chain owner. |
| Root moderate | `@humanfs/node` 0.16.7 | Root lint/tooling lock node; file input/parent unverified. Owner: trace and patch. |
| Root moderate | `@vitest/mocker` 3.2.7 | Vitest transitive, [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9); reachable third-party mocker plugin/dev socket not established. Owner: characterized Vitest major upgrade, restrict dev socket. |
| Root moderate | `ajv` 6.12.6 | Root tooling lock node; untrusted schemas/parent unverified. Owner: trace and patch. |
| Root moderate | `baseline-browser-mapping` 2.8.20 | Frontend build/tooling graph; build-input exposure unverified. Owner: update compatible tooling. |
| Root moderate | `fast-copy` 3.0.2 | Root tooling lock node; copying attacker objects/parent unverified. Owner: trace and patch. |
| Root moderate | `follow-redirects` 1.15.11 | Root network/tooling lock node; remote redirect exposure/parent unverified. Owner: trace and patch. |
| Root moderate | `yaml` 2.8.1 | Root tooling lock node; untrusted YAML input/parent unverified. Owner: trace and patch. |
| Root low | `@babel/core` 7.28.5 | Frontend build/tooling graph; untrusted transform input unverified. Owner: compatible tooling update. |
| Root low | `cookie` 0.5.0 | **SWA CLI copy**, not the patched Express cookie copy; untrusted cookie use unverified. Owner: characterize delivery-tool upgrade (CLI range `^0.5.0` does not admit >=0.7.0). |
| Root low | `devcert` 1.2.2 | SWA CLI → `tmp` (derived); developer TLS/tempfile path unverified. Owner: patch delivery tooling. |
| Backend high | `brace-expansion` 1.1.12 | Standalone backend lock → dev glob tool chain; input-controlled patterns unverified. Owner: patch tool parent. |
| Backend high | `braces` 3.0.3 | Dev watcher → `chokidar`/`micromatch` chain; same owner/action. |
| Backend high | `chokidar` 3.6.0 | `nodemon` → `braces` (derived); same owner/action. |
| Backend high | `minimatch` 3.1.2 | Dev glob chain; same owner/action. |
| Backend high | `nodemon` 3.1.10 | Direct dev dependency → `chokidar` (derived); same owner/action, avoid untested 1.14.10 downgrade. |
| Backend high | `picomatch` 2.3.1 | Dev glob chain; same owner/action. |

The six backend names also occur in the root graph; one package name may have several advisory IDs or affected installed copies. No allowlist, audit suppression, forced major upgrade, or security acceptance was made. Suggested `fixAvailable` values in npm audit are **not** evidence of an in-range safe patch. Vendor advisory details were checked for the explicitly linked remediation chains in T005–T008; full independent verification of every residual advisory's patched version and exploitability remains an owner task.

## Behavior and compatibility changes

| Change | Impact / decision | Test evidence |
|---|---|---|
| Runtime, installs | Node engines now require 24.x; `.nvmrc` does not switch PATH automatically. `.npmrc` `include=dev` ensures build/test/lint dev dependencies are installed even under production-mode clean install; a deployment intending production-only modules needs a separate install/prune policy. [T001](progress/T001.md), [T004](progress/T004.md). | T001 production-mode reproduction; T009 clean installs and gates. |
| Backend HTTP and Azure dependency resolution | No intentional change to routes, webhook acknowledgements, status codes, JSON/text responses or transaction/audit semantics. Same-major Express parser upgrade and Azure client patch may still alter behavior not exercised offline; [T002](progress/T002.md), [T005](progress/T005.md), [T006](progress/T006.md). | Backend route, DTMF and Azure-boundary tests (10). |
| Frontend build and call state | Vite 6 patch; no intentional URL, amount/date, call/polling, retry, or serialization change; [T003](progress/T003.md), [T007](progress/T007.md). | Frontend formatting and call-service tests (25), build and typecheck. |

No tracked application route, port, config key, log format, container definition or public API implementation was edited (`git diff --name-status main...HEAD`); this does **not** prove hosted behavior identical. Characterization preserves existing oddities, including backend partial validation/swallowed downstream webhook errors and frontend sparse-poll defaults; see T002/T003 rather than interpreting these as new features.

## CI, deployment and configuration

- Workflow files changed: **none**; no tracked CI workflow or Dockerfile exists ([assessment](assessment.md), git diff). If a workflow is subsequently changed, pushing it requires Futuristic's additional workflow-change confirmation. No container image, port, or health endpoint was changed.
- Runtime prerequisite: explicitly select Node **24.x** / npm **11** in actual frontend build, standalone backend install and server hosting; confirm `node --version` there. The host's default remains Node 22; `.nvmrc`/engines and README document the target but do not enforce remote runtime selection. The offline `/health` check in [T004](progress/T004.md) returned 200 using test-only TTS placeholders and ACS unconfigured; it is **not** live Azure or deployed SWA verification.
- No application configuration keys or environment variables were renamed or added. Existing configuration names include `ACS_CONNECTION_STRING`, `ACS_PHONE_NUMBER`, `CALLBACK_BASE_URL`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_TTS_KEY`/`AZURE_SPEECH_KEY`, `AZURE_TTS_REGION`/`AZURE_SPEECH_REGION`, `AZURE_TTS_ENDPOINT`/`COGNITIVE_SERVICES_ENDPOINT`, and `VITE_BACKEND_URL` ([assessment](assessment.md)); supply values securely in the real host, not this repository. No CI secrets or hosted runtime settings were inspected.

## Risks and follow-ups

| Item | Severity | Recommendation / human owner |
|---|---|---|
| Root Vitest/tinypool **2 critical affected entries**, 26 high, 7 moderate, 3 low; backend 6 high | Critical / high | Dependency/security owner: triage every open entry in the table, characterize Vitest major, SWA archive/CLI, lint/glob and nodemon chains, patch both locks and rescan; record explicit decisions rather than assuming dev-only is safe. |
| Hosting and integration not exercised | High | Deployment owner: establish the real Azure Static Web Apps/backend runtime, select Node 24/npm 11, and test ACS/Speech/Blob in an isolated sandbox before rollout. Verify existing config names and secret provisioning without exposing values. |
| Existing CSS and lint warnings, dev-script policy notices | Medium | Build owner: investigate three CSS optimizer and five lint warnings; determine whether deferred optional install scripts affect deployed targets. Do not suppress warnings to make gates green. |
| T009 checkpoint pending; default runner Node 22 | Medium | Reviewer/orchestrator: complete final review and Node-24-aware checkpoint gate. Explicit T009 validator passes do not establish that a default PATH checkpoint ran on Node 24. |

## Open questions

- What hosting/CI settings actually select the frontend build and backend server runtimes? Recommend pinning and verifying Node 24 there before deployment; no tracked workflow/container setting exists.
- Is there an isolated Azure ACS/Speech/Blob sandbox for smoke/integration tests? Recommend testing there; no live calls were made.
- Should the standalone backend lock remain a deployable input? It was preserved and scanned independently; confirm the actual deployment install path before consolidating locks.

## How to verify locally

From the repository root on Linux, explicitly select Node 24, **not the host's default Node 22**:

```bash
export PATH=/opt/node/24/bin:$PATH
node --version
npm --version
npm ci
npm run build --if-present
npm test
npm run lint --if-present
./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json
npm ci --prefix backend
bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .
```

The scan's exit code **2** is expected for the documented unresolved findings, not a successful clean audit. For a local application run, use `npm run start:backend` and `npm run dev --workspace frontend` with securely configured Azure prerequisites; backend offline `/health` was characterized with test-only TTS placeholders, but no live health URL or deployed port is asserted here. See `README.md` for application setup. The `/shared/skills/` scanner path is a run-environment prerequisite, not part of the repository.

## Artifacts and next steps

- [Assessment](assessment.md), [plan](plan.md), and [T001](progress/T001.md), [T002](progress/T002.md), [T003](progress/T003.md), [T004](progress/T004.md), [T005](progress/T005.md), [T006](progress/T006.md), [T007](progress/T007.md), [T008](progress/T008.md), [T009](progress/T009.md) progress notes. Raw logs/audit JSON are intentionally local-only under `.modernization-scratch/`.
- Review the branch diff, the open security dispositions and the Node 24 runtime selection; finish T009 validation/checkpoint, then **review and push from Futuristic**. This report does not commit or push.
