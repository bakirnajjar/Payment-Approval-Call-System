# Node.js modernization assessment — 2026-10-21

## Summary

**Observed:** Whole-repository Node.js upgrade, scenario `node-upgrade v1`. Overall risk **high**: the unmodified build fails reproducibly, there is no test script or tracked test suite, and the lockfile audits report critical vulnerabilities. Baseline: build **RED**; tests **0 passed / 0 failed / 0 skipped (not discoverable; `npm test` exits 1)**; lint **GREEN with 5 warnings**.

**Recommendation:** Stabilize the install/build and establish characterization tests before an in-place upgrade from declared Node >=22 to Node **24 LTS**. Node 26 is still Current on the assessment date; do not call it LTS before 2026-10-28. Preserve the actual npm workspace structure and ESM backend.

## Inventory

`git ls-files | wc -l`: **65** tracked files. Largest extension groups: 26 `.tsx`, 9 `.json`, 7 `.ts`, 7 `.js`, 7 `.md`, 3 `.css`. Linux runner; `node --version` = **v22.23.3**, `npm --version` = **10.9.9**. No package-manager pin, `.nvmrc`, `.node-version`, tracked CI workflow, Dockerfile, Compose file, alternate package manager, or private `.npmrc` found in tracked files. The untracked `.env` contents were not inspected.

| Unit | Path | Kind | Current stack and evidence | Candidate target |
|---|---|---|---|---|
| Root workspace | `package.json:1-20`, `package-lock.json` | npm workspace / orchestration | `engines.node >=22.0.0`; npm lockfile v3, 903 package records; build/lint delegate to frontend; **no test script** | Node 24 LTS, pin runtime consistently; retain npm and workspaces |
| Backend | `backend/package.json:1-28`, `backend/package-lock.json` | ESM Express/ACS application | `engines.node >=22.0.0`, Express `^4.18.2` (locked 4.21.2), Azure Call Automation `^1.5.0`; separate npm lockfile v3, 174 package records | Node 24 LTS; smallest safe SDK/dependency upgrades |
| Frontend | `frontend/package.json:1-70`, `frontend/tsconfig.json:4-25` | React/Vite/TypeScript application | `engines.node >=22.0.0`, React `^19.0.0` (locked 19.2.0), Vite `^6.3.5` (locked 6.4.1), TypeScript `~5.7.2` (locked 5.7.3); ES2020, ESNext, bundler resolution | Node 24 LTS; upgrade build stack only if compatibility or security requires |
| Local launcher | `scripts/start-all.sh:8-58` | developer start script | root npm workspaces; requires backend environment, starts backend and frontend | keep behavior; do not run live call integration without test resources |

Project graph: root `workspaces: ["frontend","backend"]` (`package.json:6-9`), links in root lockfile; backend and frontend do not declare each other as package dependencies. Frontend HTTP client targets backend API (`frontend/src/lib/call-service.ts:4,98,163`). Backend ACS/Speech integration and optional Blob storage (`backend/services/call-service.js:6,14-16`, `storage-service.js:10,17-18`); frontend uses Spark (`frontend/package.json:19`, `README.md:31`). No tracked tests.

## Version and support facts

| Fact | Value | Source URL | Checked on |
|---|---|---|---|
| Node 22 | Maintenance LTS; end of support **2027-04-30**; currently allowed by all three `engines.node` fields | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json ; https://nodejs.org/en/about/previous-releases | 2026-10-21 |
| Node 24 | **LTS**, maintenance from 2026-10-20; end of support **2028-04-30**; recommended target line | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json ; https://nodejs.org/en/about/previous-releases | 2026-10-21 |
| Node 26 | **Current**, scheduled LTS entry 2026-10-28, end of support scheduled 2029-04-30; **not yet LTS** | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json ; https://nodejs.org/en/about/previous-releases | 2026-10-21 |
| Vite 6.4.1 declared engine | `^18.0.0 \|\| ^20.0.0 \|\| >=22.0.0`, includes 24; this is a declared constraint, not a complete runtime-compatibility guarantee | `npm view vite@6.4.1 engines --json` (npm registry) and `package-lock.json` | 2026-10-21 |
| Azure Call Automation 1.5.0 / TypeScript 5.7.3 engine | Declared `>=20.0.0` / `>=14.17`, respectively, include 24; SDK/framework lifecycle and full compatibility **unverified** | `npm view @azure/communication-call-automation@1.5.0 engines --json`; `npm view typescript@5.7.3 engines --json` (npm registry) | 2026-10-21 |
| React, Express, Spark, Speech SDK, TypeScript lifecycle/EOL | **Unverified**; do not infer lifecycle dates from installed versions | local manifests and lockfiles only | 2026-10-21 |

## Build, test and CI

Exact scenario commands were run non-interactively at repository root with `CI=true`, `TZ=UTC`, `LANG=C.UTF-8`, 300-second timeout; raw command logs and status JSON are ignored locally in `.modernization-scratch/baseline/` (local `.git/info/exclude` updated). `npm ci` runs against the unchanged root lockfile. Durations are wall time; warnings count distinguishes npm warning lines from ESLint diagnostic warnings.

| Command | Source | Exit | Duration | Result / warnings |
|---|---|---:|---:|---|
| `npm ci` | scenario | 0 | 133.53 s | Added 893 packages; 4 npm deprecation warnings (`sudo-prompt`, `inflight`, `glob@7`, `rimraf@2`); npm also reports 53 vulnerabilities |
| `npm run build --if-present` | scenario/root `package.json:18` | 1 | 7.74 s | Frontend `tsc -b --noCheck` proceeds; Vite/Rollup fails loading `@rollup/rollup-linux-x64-gnu`; 0 warning lines |
| `npm test` | scenario | 1 | 0.63 s | `npm error Missing script: "test"`; 0 discovered tests, not a passing zero-test suite; 0 warning lines |
| `npm run lint --if-present` | scenario/root `package.json:19` | 0 | 7.99 s | ESLint: 0 errors, **5** rule warnings (`react-hooks/exhaustive-deps`, `react-refresh/only-export-components`); 6 lines contain literal “warning” including summary |
| `npm run build --if-present` (rerun) | failed-baseline confirmation | 1 | 9.19 s | Same missing Rollup optional native package |
| `npm test` (rerun) | failed-baseline confirmation | 1 | 0.69 s | Same missing script; no test IDs or flaky test evidence |

**Classification:** build failure is installation/lockfile/environment defect, not established application code defect: `package-lock.json` omits `node_modules/@rollup/rollup-linux-x64-gnu` and that package is absent after `npm ci`. Test command fails from missing project test infrastructure, not an individual failing test. No test result XML/JSON exists to count; console does not enumerate cases. Do not silently substitute `--if-present` on `npm test`. No tracked `.github/workflows`, Azure Pipeline, Jenkins, or other CI validation definition; therefore no additional repository-specific CI job can be run. `scripts/start-all.sh` is interactive and requires live Azure configuration, not a CI test.

**Proposed post-stabilization gates:** root `npm ci`, `npm run build --if-present`, `npm test` (implement a real full-suite script first), `npm run lint --if-present`, plus frontend `npx tsc -b -p frontend/tsconfig.json` **without** `--noCheck` as an additional type-check gate if compatible; run documented health check on a non-production isolated setup. Preserve or increase test discovery after every task. Root build currently covers frontend only (`package.json:18`); consider backend syntax/health coverage without reducing the frontend gate.

## Dependencies

`bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .` exited **2** in 34.05 s on 2026-10-21. Native `npm audit --json` reports root **3 critical / 35 high / 12 moderate / 3 low = 53** and separate backend lockfile **2 critical / 10 high / 6 moderate / 0 low = 18**. These are findings **per lockfile**, not 71 unique packages: backend packages occur in both audits. Full advisory IDs, ranges and fix suggestions are in the ignored raw `npm-..json` and `npm-backend.json` files. Neither lockfile was changed. Scanner audited both detected npm lockfiles; no missing ecosystem scanner was reported.

| Package | Current / source | Compatibility and status | Vulnerability evidence / candidate action |
|---|---|---|---|
| `fast-xml-parser` | 5.3.0, nested backend in both locks | transitive via Azure SDK graph; direct version owner to verify with `npm explain` | **Critical**, multiple advisories incl. [GHSA-37qj-frw5-hhjh](https://github.com/advisories/GHSA-37qj-frw5-hhjh), affected through <=5.6.0 per audit; updated safe minimum for *all* advisories to confirm before choosing |
| `proxy-addr` | 2.0.7, nested backend in both locks | Express-related transitive | **Critical**, [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), fixed 2.0.8; exploitability depends on trust proxy configuration, not established |
| `shell-quote` | 1.8.3, root lock | transitive; parent and reachability unverified | **Critical**, [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv) and GHSA-w7jw-789q-3m8p; audit reports fix available, exact patched version needs confirmation |
| `express` | 4.21.2 locked; `backend/package.json:22` | npm outdated: wanted 4.22.3, latest 5.3.0; avoid involuntary major upgrade | **High** per both audits; test routes before any major change |
| `vite` | 6.4.1 locked; `frontend/package.json:69` | npm outdated: wanted 6.4.5, latest 8.3.5; declared engine accepts 24 | **High** per root audit; repair optional native lock entry and vet safe patched release |
| `@azure/identity`, Speech SDK, Static Web Apps CLI | locked 4.13.0, 1.46.0, 2.0.7; manifests `backend/package.json:17,23`, `frontend/package.json:40,54` | npm outdated: wanted 4.14.0, 1.52.0, 2.1.0 respectively | Moderate, moderate, high respectively; verify compatibility with Node 24 and native assets before upgrading |
| TypeScript / `@types/node` | 5.7.3 / 22.18.12 in root lock; `frontend/package.json:67` | runtime 24 type major mismatch; npm outdated reports TypeScript 7.0.2 latest, toolchain compatibility unverified | Do not jump compiler major incidentally; check TypeScript 6/7 support of Vite and ESLint first |
| Deprecated npm install graph | `sudo-prompt@8.2.5`, `inflight@1.0.6`, `glob@7.2.3`, `rimraf@2.7.1` | npm explicitly warns these are unsupported; parents unverified | Upgrade owning direct dependency, re-audit; no silent override |

`npm outdated --json --workspaces --include-workspace-root` reported **53** outdated keys (exit 1); full output in ignored `.modernization-scratch/scan/outdated.json`. No tracked private registry configuration found. All package lifecycle/maintenance claims not directly supported by npm warnings or registry metadata remain **unverified**.

## Blockers and hotspots

| Pattern | Files affected / evidence | Migration approach |
|---|---|---|
| Native Rollup optional package absent | Root `package-lock.json` lacks Linux x64 GNU Rollup entry; `npm ci` succeeds but `npm run build --if-present` consistently fails | Reproduce on pinned target; repair lock via npm **in a future task**, review diff, ensure clean `npm ci` installs native artifact |
| Missing tests/root script | 0 tracked `*.test.*` / `*.spec.*`; root, backend and frontend manifests have no test script (`package.json:13-20`, `backend/package.json:10-13`, `frontend/package.json:9-15`) | Introduce framework and characterization suite before behavior changes; retain strict `npm test` gate |
| Backend ESM and cloud SDKs | `backend/package.json:6`, `backend/services/call-service.js:6`, `tts-service.js:13-15`; frontend bundler config `frontend/tsconfig.json:11,15` | Keep module formats; exercise backend API and frontend fetch contracts under Node 24 |
| Native-addon/old toolchain signatures | No tracked `binding.gyp`, `node-sass`, `tslint`, `react-scripts`, or webpack manifest dependency; Rollup native optional artifact is the observed native concern | Validate clean install on target, investigate transitive native packages as needed |

## Test services

There are **no tests to provision services for** at baseline. Backend live call and speech flows require named settings `ACS_CONNECTION_STRING`, `ACS_PHONE_NUMBER`, `CALLBACK_BASE_URL`, `AZURE_TTS_KEY`/`AZURE_SPEECH_KEY`, `AZURE_TTS_REGION`/`AZURE_SPEECH_REGION`, and optional `AZURE_TTS_ENDPOINT`, `AZURE_STORAGE_CONNECTION_STRING`/`AZURE_STORAGE_ACCOUNT_NAME` (`backend/services/call-service.js:14-16`, `tts-service.js:13-15`, `storage-service.js:16-18`). Frontend uses `VITE_BACKEND_URL` (`frontend/src/lib/call-service.ts:4`). `backend/README.md:14-29` documents ACS/Speech and publicly reachable callbacks. No database, broker, Testcontainers, or tracked Compose file identified. Service availability and safe isolated Azure test resources **unverified**; never use production credentials for tests. `docker version` succeeded (client/server 29.8.2); `DOCKER_HOST` and `TESTCONTAINERS_HOST_OVERRIDE` are set by **name**. Containers launched on the remote engine must expose ports on that engine host, not localhost; no containers were started and no connection values were read.

## Coverage and characterization candidates

No tracked automated tests or coverage reports. Before touching runtime integration, pin backend `/health`, `/api/calls/initiate`, callback DTMF decisions, status and hangup routes (`backend/server.js:70,95,173,193,212,224`) with mocked ACS/Speech calls; frontend `call-service.ts` request/status polling, `transaction-utils.ts` audit/status serialization and React loading/error flows. Exercise status codes, callback payload/JSON, retry and error cases, dates, formatting, and mocked storage fallback. No live phone calls or external network calls in unit tests.

## Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Build already red due to absent platform-specific optional binary | High | Observed | First stabilization task fixes clean lockfile installation, verifies on Linux Node 22 and 24 |
| No full test suite exists; runtime changes have no regression proof | High | Observed | Establish `npm test`, characterization tests and machine-readable results before implementation |
| 53 root and 18 overlapping backend audit findings, including three root critical | High | Observed | Triage advisory/reachability per lockfile, update minimal parents/patches, rescan both locks and validate |
| ACS/Speech/Spark integration cannot be exercised locally without isolated service fixtures | Medium | Likely | Mock external APIs; arrange safe test-only resources for smoke validation |
| TypeScript build uses `--noCheck`; runtime and type major changes could mask errors | Medium | Observed | Add separate full type-check, upgrade toolchain by compatible family, preserve lint rules |
| No committed CI/runtime pin; local Node 22 may differ from deployments | Medium | Observed | Decide deployment runtime; add consistent version pin and CI checks in approved task |

## Recommended approach

**Recommendations, not baseline changes:** (1) stabilize clean npm installation and introduce real tests; (2) capture existing HTTP/call state behavior; (3) pin Node 24 LTS across root/backend/frontend, installation and eventual delivery configuration; (4) remediate advisories in small dependency-family tasks; (5) rerun unchanged full build/test/lint gates and both-lockfile scan. In-place upgrade is suitable for two independent npm workspace apps with no known native source addon or legacy framework migration, subject to actual Node 24 compatibility validation. Retain root and backend lockfiles until their ownership/synchronization is decided. Follow Node release notes and inspect deprecations on target before claiming runtime parity.

## Open questions

1. Is Node 24 LTS approved for all deployment hosts, or is staying on supported Node 22 required temporarily? Recommend Node 24, not Node 26 until its LTS transition has happened.
2. Who owns integration-test Azure ACS/Speech accounts and publicly reachable test callback, and may a sandbox smoke test be run without real customer calls? Recommend mocked CI and a separately authorized sandbox smoke check.
3. Should backend's second lockfile remain independently installable or be consolidated with the root workspace lock? Recommend keep existing semantics until installation and deployment usage are confirmed.
4. Is a new CI workflow/deployment runtime pin in scope, given none is tracked? Recommend explicit version pin and build/test/lint gates after baseline stabilization.

## Candidate tasks

1. **Baseline stabilization** (test-baseline-and-characterization, build-fix-loop): repair Rollup optional dependency lock entry via npm; clean `npm ci` + full build; establish `npm test` with machine-readable test results; keep all existing lint rules. Depends on nothing.
2. **Characterization tests** (test-baseline-and-characterization): add backend/API and frontend state/HTTP behavior tests, mock Azure services; run against unchanged runtime. Depends on 1.
3. **Runtime pin** (node-typescript-upgrade, build-fix-loop): align root/workspace engines, runtime pin and `@types/node` to verified Node 24; validate clean install/build/test/lint and full type-check. Depends on 2.
4. **Dependency security batches** (dependency-vulnerability-remediation, build-fix-loop): triage critical/high transitive roots and direct packages; update with npm, rescan both lockfiles, validate each small family. Depends on 3.
5. **Delivery validation and final report** (ci-workflow-modernization if workflow is approved, modernization-report): align any approved CI/deployment, perform full gates, advisory scan and sandbox smoke if available; report residual risks. Depends on 4.
