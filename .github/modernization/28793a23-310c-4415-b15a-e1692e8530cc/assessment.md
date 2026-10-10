# Node.js LTS modernization assessment — 2026-10-10

## Summary

**Observed:** This 65-tracked-file npm workspace runs on Node 22.23.3, declares `>=22.0.0` in all three manifests, and has no tests. The unmodified baseline is **RED**: install succeeds, build fails on an absent Rollup Linux binary, and `npm test` fails because there is no test script. Lint passes with five warnings. Both failed gates failed again on a second run. The two lockfile audits report 53 and 18 vulnerable package entries respectively; the counts overlap.

**Recommendation:** Incrementally move both workspaces to **Node 24 LTS**, after stabilizing the missing native optional dependency and establishing real tests; pin Node consistently and remediate dependency vulnerabilities in independently validated batches. Overall risk **high**, driven by the red build, zero automated tests, and critical dependency advisories.

## Stack inventory

| Unit | Path | Kind / current stack (evidence) | Candidate |
|---|---|---|---|
| Root workspace | `package.json:1-21` | npm workspaces `frontend`, `backend`; `engines.node >=22.0.0`; root build/lint delegate to frontend, **no test script** | npm with Node 24 |
| Backend | `backend/package.json:1-29`, `backend/server.js:1-35` | ESM Express 4 application, ACS/Azure Speech/Blob integrations; `engines.node >=22.0.0`; no build/test script | Node 24, preserve routes and webhook behavior |
| Frontend | `frontend/package.json:1-71`, `frontend/tsconfig.json:1-33` | React 19, Vite 6, TypeScript ~5.7.2 (locked 5.7.3), ESLint 9; ES2020 / ESNext / bundler resolution; `engines.node >=22.0.0` | Node 24; evaluate TS/tooling separately |
| Delivery | `frontend/staticwebapp.config.json`, `frontend/swa-cli.config.json`, `scripts/start-all.sh` | Azure Static Web Apps configuration and local launcher; no tracked Dockerfile, compose, CI workflow or runtime-version pin | Add consistent runtime pin where deployment actually uses one |

Graph: root npm workspaces → independent frontend and backend; frontend calls backend HTTP (`frontend/src/lib/call-service.ts:4,97`); backend calls Azure SDK services. There are no local workspace package dependencies between frontend and backend. `package-lock.json` and `backend/package-lock.json` are both npm lockfileVersion 3; the latter is a separate backend lock and can drift from the root workspace install. No tracked `.npmrc`, `.nvmrc`, `.node-version`, `packageManager`, `@types/node`, or CI definition was found (`git ls-files`, `find` inventory, 2026-10-10). npm registry reported `https://registry.npmjs.org/`; no private registry identified.

## Support status

| Stack / fact | Observed or verified target | End of support / source, checked 2026-10-10 |
|---|---|---|
| Node.js 22 | Current installed 22.23.3 (`node --version`); project permits 22+ (`package.json:10-12`, `backend/package.json:7-9`, `frontend/package.json:6-8`). **Maintenance LTS** | **2027-04-30**; [Node.js Release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) and [Node.js previous releases](https://nodejs.org/en/about/previous-releases). |
| Node.js 24 | **Recommended current LTS** as of today; do not use 26 yet (still Current). | **2028-04-30**; same official schedule and Node.js previous releases, checked 2026-10-10. Node 26 scheduled to enter LTS 2026-10-28. |
| npm | Installed 10.9.9 (`npm --version`); lock format 3 (`package-lock.json`, `backend/package-lock.json`). | npm major support end date **unverified**; verify package-manager version bundled with selected Node 24 release. |
| Express / React / Vite / TypeScript / Azure SDKs | Locked: Express 4.21.2; React 19.2.0; Vite 6.4.1; TypeScript 5.7.3; `@azure/identity` 4.13.0 and ACS Call Automation 1.5.0 (`package-lock.json`, `backend/package-lock.json`). | Published end-of-support dates **unverified**; do not claim they are out of support. Vite 6.4.1's locked `engines.node` permits `>=22`, TS 5.7.3 requires `>=14.17`, Azure SDK entries require `>=20` (lockfile metadata): none explicitly blocks Node 24, but runtime compatibility remains **unverified** until tested on Node 24. |

## Dependencies and vulnerabilities

**Observed:** Required scan `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .` exited **2**, taking 33.4 seconds. Root lock: **3 critical, 35 high, 12 moderate, 3 low** (53 affected package names). Separate backend lock: **2 critical, 10 high, 6 moderate, 0 low** (18); overlapping packages must not be added as unique findings. Raw machine-readable outputs: `.modernization-scratch/scan/npm-..json`, `.modernization-scratch/scan/npm-backend.json`. These files are local-only, not committed. The scanner's `fixAvailable: true` does not prove an in-range safe fix.

| Package / locked version | Severity / advisory | Fixed version or finding detail | Directness / preliminary reachability |
|---|---|---|---|
| `proxy-addr` 2.0.7 (backend) | Critical, [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | **2.0.8** according to advisory checked today | Transitive via Express proxy processing; exploit needs a specific trusted-proxy subnet configuration; verify deployment settings before declaring reachable. |
| `fast-xml-parser` 5.3.0 (backend) | Critical aggregate, e.g. [GHSA-jp2q-39xq-3w4g](https://github.com/advisories/GHSA-jp2q-39xq-3w4g) | Scanner flags versions below **5.7.0** among multiple advisories; verify each advisory's fixed version before remediation | Transitive through Azure SDK dependencies; exploit requires attacker-controlled XML and affected parser configuration; reachability unverified. |
| `shell-quote` 1.8.3 (root) | Critical aggregate, GHSA-w7jw-789q-3m8p / GHSA-395f-4hp3-45gv (scanner) | Scanner affected range through 1.8.4; first jointly patched version **unverified** | Transitive tooling; path/reachability unverified. |
| `express` 4.21.2 (backend) | High aggregate (scanner) | Scanner reports fix available; precise safe version/advisory **unverified** | Direct server dependency. |
| `vite` 6.4.1 (root) | High, four GHSA IDs in npm audit report | Scanner affected through 6.4.2; verify target release before selecting upgrade | Direct frontend build/dev tooling. |
| `@azure/identity` 4.13.0; `microsoft-cognitiveservices-speech-sdk` 1.46.0 | Moderate aggregates (scanner) | Scanner reports fixes available; first fixed releases **unverified** | Direct runtime dependencies in both frontend/backend manifests. |
| `nodemon` 3.1.10 / `braces` transitive | High aggregate (scanner) | npm audit's suggested `nodemon` 1.14.10 is a **major downgrade**, not a safe automatic fix; investigate | Direct dev tooling; not normally production-reachable. |

All other packages, per-package advisory IDs, affected ranges, suggested fixes and severity are retained in the raw JSON reports. Advisory details and fixed releases beyond the two linked examples are **not independently verified** and require explicit triage; no `npm audit fix --force` or suppression during assessment. `npm outdated --all --json` exited 1 (outdated packages present), finding 558 keys / 1,363 entries including nested copies; current advertised latest include Vite 8.3.4, TypeScript 7.0.2, Express 5.3.0, React 19.3.0 (registry query, 2026-10-10). Latest majors are **not** proposed blindly: retain TypeScript 5 until its compiler ecosystem and TypeScript 6 transition are verified, and migrate framework families with behavior tests. No source references to `node-sass`, `node-gyp`, `tslint`, `react-scripts` or `binding.gyp` found outside locks; prose occurrences of “request” are not evidence of the deprecated `request` package.

## Build and CI

Environment: Linux; Node 22.23.3; npm 10.9.9; Docker remote server 29.8.2 (`docker version`). `DOCKER_HOST` and `TESTCONTAINERS_HOST_OVERRIDE` are present (values deliberately not printed). No tracked CI workflows, Dockerfiles, compose files or version-file pin (`git ls-files`); the documented local runner `scripts/start-all.sh` requires Azure configuration and starts both services.

| Command, from scenario defaults / package scripts | Exit | Duration | Result |
|---|---:|---:|---|
| `npm ci` | 0 | 132.7s | Installs; 4 warning lines in raw log, no source/lock edits observed. |
| `npm run build --if-present` | 1 | 9.1s | `vite build` fails: `Cannot find module @rollup/rollup-linux-x64-gnu`; root lock lacks Linux Rollup optional binary entry while retaining Windows variants. Repeat: exit 1, 7.5s. Environment/lock-platform incompatibility, not a failing test. |
| `npm test` | 1 | 0.5s | npm: `Missing script: "test"` at root; no `*.test.*` / `*.spec.*` files outside dependencies. Repeat: exit 1, 0.5s. Genuine missing test infrastructure; **0 passed / 0 failed / 0 skipped discovered**, not a successful suite. |
| `npm run lint --if-present` | 0 | 6.3s | 0 errors, **5 warnings** (2 React hooks, 3 refresh). |
| `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json` | 0 | 7.3s | Type check succeeds; `frontend/package.json:11` build itself uses `tsc -b --noCheck`, so type-check separately. |

Raw logs are under ignored `.modernization-scratch/baseline/`; `.git/info/exclude` was updated locally to exclude the scratch directory. No JUnit/Jest/Vitest result file exists because no suite is configured. Proposed unchanged full gates after stabilization: root `npm ci`, `npm run build --if-present`, `npm test`, `npm run lint --if-present`, plus `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`; scan both lockfiles with the same skill script. Record machine-readable results and compare discovered test counts.

## Test services

**Observed:** There are no tests and no declared database/broker/cache services. Backend stores demo transactions in a `Map` (`backend/server.js:35-38`); frontend uses HTTP and Spark KV (`frontend/src/lib/call-service.ts`, `README.md:29-33`). Actual call flows require Azure services; application configuration keys referenced in source include `ACS_CONNECTION_STRING`, `ACS_PHONE_NUMBER`, `CALLBACK_BASE_URL`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_TTS_KEY`/`AZURE_SPEECH_KEY`, `AZURE_TTS_REGION`/`AZURE_SPEECH_REGION`, `AZURE_TTS_ENDPOINT`/`COGNITIVE_SERVICES_ENDPOINT`, and `VITE_BACKEND_URL`. None of those keys is present in this process environment; do not invoke live call flows. Docker engine is available but no test container is required by existing tests. If tests later use a containerized service on the remote `DOCKER_HOST` engine, reach published ports through `TESTCONTAINERS_HOST_OVERRIDE`, **not localhost**.

## Coverage and characterization candidates

**Observed:** Zero repository test/spec files and no `test` scripts (`package.json:13-21`, workspaces' scripts). Characterize unchanged behavior before changing dependencies: `backend/server.js:24-95` JSON/text middleware, health and HTTP transaction routes; `backend/services/webhook-handler.js` event/DTMF interpretation; `backend/services/call-service.js` retry and ACS adapter using mocked clients; `backend/services/storage-service.js` state; `frontend/src/lib/transaction-utils.ts` status/audit serialization; `frontend/src/lib/call-service.ts:11-125` merge/polling/API errors using mocked fetch. Avoid real Azure credentials; pin routes/statuses/error payloads, input validation and transaction/audit transitions.

## Risks

| Risk, evidence | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Reproducibly broken frontend build; missing platform-specific Rollup package in root lock (`npm run build` twice, lock inspection) | High | Certain | Stabilize optional-dependency lock resolution via npm in a separately reviewed task; validate on Linux with clean `npm ci`. |
| No runnable tests, and `npm test` fails twice (root `package.json`, command output) | High | Certain | Add test runner and characterization tests against current behavior before upgrading; keep original full-suite gate. |
| Critical/high scanner findings across two drifting locks (scan output and lockfiles) | High | Certain findings; exploitability unknown | Triage each advisory and transitive parent, prioritize exposed runtime packages, upgrade minimally and rescan both locks. |
| No pinned CI/deployment Node version; broad `>=22.0.0` allows Current majors (`package.json:10-12` and workspace engines) | Medium | Likely | Pin 24 consistently after identifying actual deployment environment. |
| Backend depends on live Azure ACS/Speech/Blob but service keys are unavailable (`backend/services/*`) | Medium | Likely for integration tests | Mock boundary for unit tests; request isolated sandbox only if actual integration validation is needed. |

## Recommended approach

Keep both applications in place (no rewrite or strangler required: separate npm workspaces and HTTP integration). First repair the red baseline and add an actual suite without deleting or skipping checks. Then pin the LTS runtime in root/workspaces and delivery settings, test clean install/build on Node 24, address npm advisory families and preserve backend HTTP/ACS behavior. Lockfiles must only be regenerated by npm. Do not assume TypeScript 7, Vite 8 or Express 5 is necessary for the Node runtime change.

## Open questions

1. Which deployed runtime/CI platform executes the app? No CI or Dockerfile exists in the tracked tree; recommend supplying deployment configuration before changing a deployment pin.
2. Is there an isolated Azure ACS/Speech/Blob sandbox for optional integration tests? Recommend offline mocks as the required baseline; never target production or unknown internal endpoints.
3. Should the separate `backend/package-lock.json` continue to support standalone backend installs, or should the root workspace lock become canonical? Recommend explicitly retaining and scanning both until deployment behavior is established.

## Candidate tasks

1. **Stabilize baseline:** resolve Rollup optional-binary lock failure and introduce a legitimate root `npm test` full-suite command (skills: `test-baseline-and-characterization`, `build-fix-loop`); gates: clean install/build/test/lint/typecheck.
2. **Characterize current behavior:** isolated backend API/webhook and frontend transaction/merge tests; no live Azure calls (skill: `test-baseline-and-characterization`); same gates and machine-readable test totals.
3. **Pin Node 24 LTS:** root and both workspace engines, runtime file and verified deployment configuration; validate with Node 24 clean `npm ci` and complete gates (skills: `node-typescript-upgrade`, `build-fix-loop`).
4. **Remediate production dependencies:** prioritize verified critical/high advisories via minimal compatible upgrades in both locks (skill: `dependency-vulnerability-remediation`); full gates plus both-lock scan.
5. **Update tooling families separately if needed:** Vite/Rollup, TypeScript/types, ESLint and nodemon, only when Node 24 compatibility or advisory fixes require it; preserve tests and lint rules (skills: `node-typescript-upgrade`, `build-fix-loop`).
6. **Final validation/report:** repeat all gates, compare test totals and outstanding vulnerabilities, review deployment impacts (skills: `test-baseline-and-characterization`, `modernization-report`).
