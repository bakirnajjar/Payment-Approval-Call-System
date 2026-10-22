# Goal and target

Upgrade the npm workspace repository to **Node.js 24 LTS**, pin it in `.nvmrc` and `engines.node` in all three `package.json` files, and make the full build, actual tests, and lint pass on Node 24. Add characterization tests before dependency changes and fix advisories where compatible without changing deployment or Azure Communication Services (ACS) behavior.

The assessed baseline is red: `npm ci` passes on Node 22, the build fails because the root lock lacks Rollup’s Linux native package, `npm test` has no script or tests, and lint passes with five warnings.

# Approach

Stabilize the build and establish a non-vacuous root test suite first. Characterize unchanged backend and frontend behavior next. Then pin and validate Node 24, remediate advisories by dependency family, and perform final whole-repository validation.

**Validation convention for every task:** Run the exact commands listed in its block from the repository root with `CI=true TZ=UTC LANG=C.UTF-8`. T001–T003 may establish the green baseline on the assessed Node 22; **T004 and every subsequent task must run them with `/opt/node/24/bin` first on `PATH`**, verifying `node --version` before validation. Each task must finish with all three full gates green. Audit scans may report findings assigned to later tasks; record them rather than treating an incomplete or vulnerable scan as clean.

# Decisions

- **Target Node 24, not 26:** Node 24 is the requested LTS and reaches end of life on 2028-04-30; Node 26 was not yet LTS on the assessment date. Source: `assessment.md`, “Version and support facts,” checked 2026-10-20 against the [Node release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json).
- **Pin the Node 24 major:** Use `.nvmrc` containing `24` and `engines.node: "^24.0.0"` in root, backend, and frontend manifests. The current three engine fields say `>=22.0.0`; source: the three `package.json` files and `assessment.md`, “Inventory.”
- **Retain npm workspaces and both locks:** The root `package-lock.json` and separate tracked `backend/package-lock.json` are distinct audit targets. Do not remove the backend lock without evidence about standalone installs. Source: `assessment.md`, “Inventory” and “Dependencies and vulnerabilities.”
- **Keep the existing framework and TypeScript majors unless a verified fix requires otherwise:** React 19 and TypeScript 5.7 need no blanket upgrade for this goal; the frontend build currently uses `--noCheck`. Source: `frontend/package.json`, `frontend/tsconfig.json`, and `assessment.md`, “Blockers and hotspots.” Run an explicit type-check diagnostic in final validation, but do not claim type correctness merely because the build passes.
- **Preserve observable behavior:** Backend routes, callback handling, ACS calls, frontend request JSON, and presentation must remain as characterized. Source: the behavior hotspots in `assessment.md`, “Coverage and characterization candidates.”

# Assumptions

- `/opt/node/24/bin` supplies Node 24 and its npm executable, as specified by the run tooling; Node 24 compatibility has **not** yet been demonstrated by the assessed baseline.
- Tests can use local fakes, mocked fetch and timers, and an isolated HTTP process. They must not contact live ACS, speech, or storage services.
- Lockfiles are changed only through npm. The five existing lint warnings are a baseline to compare against, not a reason to suppress rules.
- If an advisory needs an incompatible major change or an ACS/deployment behavior change, stop that remediation, record the finding and options for a decision, and add a narrowly scoped approved fix-up if appropriate. Do not use blanket overrides or `npm audit fix --force`.

# Out of scope

Deployment configuration, CI or container creation where none is tracked, live ACS integration, and intentional ACS or application wire-behavior changes.

# Tasks

### T001: Stabilize the build and establish real tests
- Depends on: -
- Skills: test-baseline-and-characterization, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
- Characterization: Add at least one passing backend `node:test` assertion against unchanged behavior, such as DTMF normalization; record discovered test counts.
- Risk: high (red build and zero test discovery); review the lock and harness diff after the task.
- Done when: a clean Linux install includes Rollup’s required native package, the full build passes, and root `npm test` executes and reports real backend assertions.

Repair the **root lock through npm**, not JSON editing, while avoiding unrelated version churn. Add backend and root test scripts so the root command cannot succeed without running tests. Keep raw results local and record the new green baseline.

### T002: Characterize backend HTTP and ACS adapter contracts
- Depends on: T001
- Skills: test-baseline-and-characterization, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
- Characterization: Pin `/health`, initiation validation and payloads, status and callback responses, DTMF variants, webhook transitions, and relevant call-service message/adapter arguments using isolated processes or fakes.
- Risk: high (side effects could place real calls or obscure current quirks); review test isolation and assertions after the task.
- Done when: backend contract tests run through root `npm test` against unchanged application behavior without live Azure access.

Add tests rather than changing ACS integration. If a minimal test seam is indispensable, demonstrate that it leaves production behavior unchanged and review it separately.

### T003: Characterize frontend transaction and call behavior
- Depends on: T002
- Skills: test-baseline-and-characterization, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
- Characterization: Pin transaction IDs and audit entries with controlled time/randomness; currency and timestamp formatting under the baseline locale; call request JSON, status merging, retry behavior, terminal polling, and cleanup with fake fetch and timers.
- Risk: medium (test-runner/Vite compatibility and timing-sensitive tests); choose a runner compatible with both Node 22 and 24 and compare discovery counts.
- Done when: root `npm test` runs **both** workspace suites and the new tests pass against unchanged frontend behavior.

Add only the frontend test tooling needed for these tests. Replace the temporary backend-only root orchestration from T001 with a full, non-vacuous two-workspace test command before completing this task.

### T004: Pin and validate Node.js 24
- Depends on: T003
- Skills: node-typescript-upgrade, build-fix-loop, test-baseline-and-characterization
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `node --version`; `npm --version`
- Characterization: Compare both suites and their discovered test counts with T003; no new behavior is intended.
- Risk: high (native packages and previously untested runtime compatibility); review the pin and any compatibility fixes after the task.
- Done when: `.nvmrc` and all three engine fields select Node 24, and a clean Node 24 install passes the full gates.

Switch to `/opt/node/24/bin` before installation and retain it for later tasks. Update either lock through npm only if installation requires it; investigate native, ESM, or engine failures at their source without relaxing tests or the target.

### T005: Patch the backend Express HTTP dependency family
- Depends on: T004
- Skills: dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `npm ci --prefix backend`; `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: Use T002’s route, validation, status, and callback contracts.
- Risk: high (middleware and routing changes can alter HTTP responses); review after the task.
- Done when: compatible Express 4/body-parser and related `proxy-addr`, `path-to-regexp`, and `qs` findings are cleared in the applicable locks without contract changes.

Verify current advisory ranges, prefer patched same-major parents, and regenerate both affected locks with npm. Do not move to Express 5 merely to satisfy an audit suggestion.

### T006: Patch the Azure identity and XML-parser chain
- Depends on: T005
- Skills: dependency-vulnerability-remediation, node-typescript-upgrade, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `npm ci --prefix backend`; `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: Recheck T002’s ACS-facing contracts and offline adapter assertions.
- Risk: high (Azure SDK transitive changes and critical XML findings); review after the task.
- Done when: compatible `@azure/identity`/MSAL and `fast-xml-parser` findings are patched in both applicable locks, or any incompatible finding is explicitly documented for decision.

Use `npm explain` to establish each owning chain and verify patched versions from current advisories. Do not alter ACS requests or callbacks to accommodate a package update.

### T007: Patch the speech SDK dependency family
- Depends on: T006
- Skills: dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `npm ci --prefix backend`; `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: Preserve characterized call-message and webhook behavior; use stubs rather than speech services.
- Risk: high (SDK updates can affect call audio integration); review after the task.
- Done when: compatible speech-SDK-owned findings, including applicable transitive packages, are patched in both locks without changing speech or ACS behavior.

Treat the speech client as a separate parent family from Azure identity. Document any finding that cannot be fixed within the existing behavior boundary.

### T008: Address the backend nodemon development chain
- Depends on: T007
- Skills: dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `npm ci --prefix backend`; `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: No production behavior change; retain all backend assertions.
- Risk: medium (audit’s proposed nodemon “fix” is an apparent major downgrade); verify the dependency graph and patched releases rather than applying it blindly.
- Done when: safe fixes for nodemon-owned `braces`, `chokidar`, and related findings are applied, or the remaining advisories and lack of a compatible fix are evidenced.

Change only this development-tool chain and npm-managed lock entries; do not force a downgrade or add a blanket override.

### T009: Patch the frontend Vite and Rollup build family
- Depends on: T008
- Skills: dependency-vulnerability-remediation, node-typescript-upgrade, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: Preserve T003’s frontend request and presentation assertions.
- Risk: high (bundler, native optional packages, and test-runner interoperability); review after the task.
- Done when: compatible Vite 6/Rollup fixes and their owned build-chain findings are applied, the Linux optional package remains present after `npm ci`, and full gates pass.

Prefer verified patches in the existing majors over a Vite major upgrade. Inspect the resulting lock for the Linux Rollup optional entry.

### T010: Patch the frontend ESLint dependency family
- Depends on: T009
- Skills: dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: No application behavior change; compare lint diagnostics with the five-warning baseline.
- Risk: medium (lint-stack changes may alter diagnostics); retain rules and review any warning-count change.
- Done when: compatible ESLint/`typescript-eslint` and owned transitive findings are patched without suppressions or new lint errors.

Keep the established configuration and TypeScript major unless a verified compatible patch demands a narrower, separately reviewable change.

### T011: Patch the Static Web Apps CLI development chain
- Depends on: T010
- Skills: dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: Retain both workspace suites; deployment behavior is not exercised or changed.
- Risk: high (many transitive findings belong to a deployment-related CLI); review scope and lock diff after the task.
- Done when: compatible `@azure/static-web-apps-cli` development-chain advisories—including its `shell-quote` finding—are fixed where possible, with any deployment-affecting fix deferred for a decision.

Triage parent paths before changing packages. Do not edit Static Web Apps configurations or claim a deployment test occurred.

### T012: Patch shared UUID dependencies
- Depends on: T011
- Skills: dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `npm ci --prefix backend`; `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: Compare transaction-ID and request-contract tests with T002–T003.
- Risk: medium (IDs cross frontend/backend boundaries); retain ID-shape assertions.
- Done when: the compatible UUID patch is represented in both applicable lock contexts and the existing contracts pass.

Update direct declarations only where needed, accounting separately for transitive UUID copies brought in by SDKs.

### T013: Reconcile remaining compatible advisory findings
- Depends on: T012
- Skills: dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `npm ci --prefix backend`; `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: Both characterized suites must retain at least their prior discovered counts.
- Risk: medium (a residual finding may reveal an unplanned parent family); split a newly identified multi-package or behavior-changing fix into narrowly scoped fix-up tasks before making it.
- Done when: every finding in **both** audit targets is classified as fixed, incompatible with an evidenced decision pending, or without a verified compatible fix; no known compatible fix is silently left undone.

Compare current scans with the assessed **53 affected root package names and 18 backend names**, without summing overlapping counts or equating package names with advisory IDs. Record advisory, parent, severity, patched version, reachability, and disposition. This task is audit closeout and a place for a *single* safe residual leaf-family fix—not permission for a blanket upgrade.

### T014: Final validation and report
- Depends on: T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013
- Skills: modernization-report, test-baseline-and-characterization, dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`; `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - additional: `node --version`; `npm ci --prefix backend`; `npm exec --workspace frontend -- tsc --noEmit -p tsconfig.json`; `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`; `git --no-pager diff --check`; `git --no-pager diff --stat`
- Characterization: Confirm no test-count decrease; list added backend and frontend assertions and any observed quirks.
- Risk: medium (an earlier green result may not represent the final tree); rerun every gate and review the complete diff after the last dependency edit.
- Done when: Node 24 full gates are green, both audit targets and explicit type-check results are truthfully reported, final branch diff has been reviewed for scope and behavior, and `.github/modernization/598b144b-1531-4d8f-979d-be6555be2ebb/final-report.md` is written.

Report verified before/after versions, test counts, lint warnings, audit findings and decisions, any type-check diagnostics, and the absence of deployment/CI changes if confirmed. Do not describe an unresolved scan or red type-check as green.

# Risks

- **High — clean-install and Node 24 compatibility:** T001 repairs the lock; T004 repeats a clean install under Node 24; later bundler work must retain the Linux native entry.
- **High — behavioral regression without live services:** T002–T003 pin current contracts with offline tests before package upgrades; high-risk dependency tasks receive code review.
- **High — critical findings across two locks:** Scan and reconcile both independently after remediation; never infer that repairing the root lock also repairs backend standalone installs.
- **Medium — uncovered TypeScript errors:** The current build uses `--noCheck`. Final explicit type-check results must be disclosed; fixing broad pre-existing diagnostics requires a separately scoped task, not weakened compiler settings.
- **Medium — incompatible advisory fixes:** Preserve ACS and deployment boundaries, record unresolved advisory evidence and seek a decision rather than forcing a breaking major or hiding the finding.
