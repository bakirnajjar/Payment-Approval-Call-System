# Node.js LTS modernization plan

## Goal and target

Upgrade the root npm workspace, frontend, and backend from the observed Node.js 22.23.3 environment to **Node.js 24 LTS** without changing application behavior. Keep clean installs, the frontend build and type check, all real tests, and lint green after every task. Preserve the separately committed backend lockfile as well as the root workspace lockfile.

The [Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) and [previous releases](https://nodejs.org/en/about/previous-releases), checked 2026-10-10, identify 24 as the newest LTS line (end of support 2028-04-30); 26 is still Current until 2026-10-28. The baseline and repository evidence are in [assessment.md](assessment.md).

## Approach

T001 is necessarily an atomic **red-baseline repair**: neither a build-only task nor a test-only task could pass the unchanged full gates. It corrects the Linux Rollup optional-binary lock resolution and makes `npm test` run a small, genuine test suite in *both* workspaces. T002 and T003 extend characterization coverage on unchanged application behavior before changing the runtime or dependency versions. Subsequent tasks pin and actually run Node 24, then make only advisory-driven, compatible dependency changes, in a serial order because tasks share the root lockfile. No lockfile is hand-edited. Keep root and backend lockfile resolution consistent; validate the standalone backend install separately when either lock changes.

For **every** task, run its exact validation lines from the repository root, in order, with the target task's runtime selected. `npm ci` remains a clean-install gate; `npm test` must discover nonzero tests in both workspaces and never be replaced by `--if-present`. Compare test totals to the first green baseline and record machine-readable test results in locally excluded `.modernization-scratch/` (Node's JUnit reporter for backend; Vitest's JUnit reporter for frontend), with only summaries under the run directory. Hold `TZ=UTC` and `LANG=C.UTF-8` constant when comparing time-sensitive results, without changing the listed gate commands. Do not weaken assertions, suppress lint warnings, ignore vulnerabilities, use `npm audit fix --force`, or make permanent use of `--legacy-peer-deps`. Investigate incompatible major upgrades as separate, reviewed fix-up tasks rather than folding them into a passing task.

## Decisions

- **Runtime:** Node 24 LTS, not Node 26 Current; the assessment's Support status section and the official Node schedule checked 2026-10-10 establish the target and 2028-04-30 end date. The assessment's Stack inventory identifies Node 22.23.3 and three `>=22.0.0` engines declarations. Pin major 24 through `.nvmrc` and all three manifests; prove the gates really run with `node --version` showing 24 (and record npm's actual bundled version).
- **Package manager and locks:** Keep npm and lockfileVersion 3; assessment Stack inventory identifies root `package-lock.json` **and** independent `backend/package-lock.json`. Retain both until the backend deployment install path is known; produce their changes with npm, and run the backend standalone install plus the root gates after changes affecting either graph.
- **Test infrastructure:** Use Node's built-in test runner for the ESM backend and a Vite-6-compatible Vitest version for the frontend TypeScript modules, with a root script that executes both workspace suites. Assessment Build and CI and Coverage sections show no existing test scripts or discovered tests, and repeatably failing `npm test`.
- **Deployment/CI:** No tracked CI workflow, Dockerfile, or deployment Node-version file exists (assessment Stack inventory and Build and CI). Document the Node 24 deployment prerequisite in existing documentation; do not fabricate a CI or container configuration or alter Azure configuration. If a real deployment configuration is found, plan a separate, minimal update and review.
- **Upgrade boundary:** The goal is Node LTS, not wholesale migration to TypeScript 7, Vite 8, Express 5, or every latest transitive package. The assessment Dependencies section says compatibility and fixes for those majors are unverified. Use patched versions in the current compatible major where possible; defer unrelated majors and clearly report remaining findings.

## Assumptions

- A trusted Node 24 binary can be provided for T004 and subsequent gates; the assessed environment itself has Node 22.23.3. If Node 24 cannot be installed or selected, report a blocker rather than claiming runtime validation.
- The existing frontend and backend npm workspaces are the complete deliverable. No available ACS, Speech, or Blob test credentials were identified; tests mock those boundaries and never place real calls or contact unknown endpoints.
- Findings from the 2026-10-10 audit must be rechecked for advisory IDs, fixed versions, reachability, and transitive parents before selecting package versions. Scan exit code 2 means documented residual findings, **not** a clean scan; exit code 1 means incomplete and must be resolved.

## Out of scope

New CI pipelines or containers without an existing deployment target; live Azure integration tests without an isolated sandbox; a backend rewrite; framework or compiler major migrations not required for Node 24 or a verified advisory; and suppression or blanket acceptance of audit findings. Record unresolved advisories and deployment questions in the final report rather than silently dropping them.

## Tasks

### T001: Stabilize clean build and establish both test suites
- Depends on: -
- Skills: test-baseline-and-characterization, build-fix-loop
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
- Characterization: Start with at least one deterministic assertion of existing backend DTMF normalization and one frontend transaction-formatting result; record the first successful test totals, not a placeholder/pass-only script.
- Risk: high (two reproducible failing gates and a platform-specific npm optional dependency); regenerate the root lock through npm on Linux, ensure Rollup's Linux package survives clean `npm ci`, then review the small baseline-repair diff.
- Done when: The root clean install resolves `@rollup/rollup-linux-x64-gnu`, `npm test` executes actual backend and frontend assertions, and every listed gate passes on the assessed Node 22 environment.

Repair the root Rollup optional dependency resolution without editing lock JSON by hand. Add a root `test` script that runs both workspace scripts, a backend Node test script, a frontend Vitest script and the smallest compatible test-runner dependency; capture the new, green baseline and check that the root lock accounts for the new dependency. The two red gates must be repaired together so this first checkpoint is green.

### T002: Characterize backend routes and Azure boundaries
- Depends on: T001
- Skills: test-baseline-and-characterization, build-fix-loop
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
- Characterization: Pin existing request validation, missing-transaction 404 payload, health response with mocked connectivity, webhook HTTP acknowledgement/error, DTMF/event interpretation, transaction/audit updates, and ACS/storage failure or fallback behavior without making real calls.
- Risk: medium (server startup and Azure SDK initialization may otherwise leak side effects); use controlled process/loopback or mock clients, unset Azure credentials, and verify processes exit.
- Done when: Offline backend HTTP and service-boundary tests cover the existing observable responses/state transitions, remain in the suite, and all full gates pass.

Add characterization tests against the existing ESM backend; exercise the public HTTP surface in a controlled local test process where needed, not an external service. Preserve current status codes, JSON/text bodies, and audit transitions, including oddities, before runtime or Express/Azure dependency upgrades.

### T003: Characterize frontend transaction and call state
- Depends on: T002
- Skills: test-baseline-and-characterization, build-fix-loop
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
- Characterization: Pin existing amount/currency/date and call-script formatting, transaction creation/audit entry transitions, call-service default fields, merge and polling/final-state behavior, and fetch success/error payload handling with controlled timers and mocked fetch.
- Risk: medium (locale/time and polling can make false regressions); use fixed time/locale and timers, and no real backend or Azure calls.
- Done when: These frontend behaviors are covered by persistent tests and the root full-suite test count increases without any regression or missing workspace.

Expand the frontend suite against unchanged TypeScript implementation, using a minimal Vitest test configuration if the app's Vite plugins interfere with tests. Record the actual observed outputs rather than rewriting behavior to fit intended specifications.

### T004: Pin and verify Node 24 across the workspaces
- Depends on: T003
- Skills: node-typescript-upgrade, build-fix-loop, test-baseline-and-characterization
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
- Characterization: T002 and T003 pin backend wire/state and frontend formatting/call state before the runtime changes.
- Risk: high (Node 24 changes npm, globals, and dependency execution, while deployment has no tracked pin); use a real Node 24 environment, compare against characterization results, inspect Node 23/24 notable changes and startup deprecations, and request code review.
- Done when: `.nvmrc` and all three `engines.node` fields consistently select the Node 24 line, the two locks are npm-consistent, `node --version` confirms 24 for clean root and standalone backend installs, all gates pass, and the deployment prerequisite is documented.

Introduce a single major-line version pin (for example `.nvmrc` containing `24` and engines restricting to 24.x); update both lockfiles through the selected npm when their package metadata changes. Record npm's bundled version, verify `npm ci --prefix backend` independently, and check the no-credential backend startup/health smoke via the offline tests. Only align `@types/node` if actually introduced; none is tracked today. Do not invent workflow/container files.

### T005: Repair backend HTTP dependency advisories
- Depends on: T004
- Skills: dependency-vulnerability-remediation, node-typescript-upgrade, build-fix-loop
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
  - standalone-install: `npm ci --prefix backend`
  - audit: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: T002 pins validation, webhook routes, status/errors, and transaction responses.
- Risk: high (Express/body-parser/proxy address handling is externally visible); verify patched same-major releases and `npm explain` parents, preserve route semantics, exercise backend route tests, and request code review.
- Done when: The verified backend HTTP-family critical/high fixes (including `proxy-addr` if still affected) are installed in **both** lock graphs, standalone install and all gates pass, and the audit shows these findings resolved without a new finding.

Treat Express 4 and its parser/proxy dependencies as one backend HTTP family. Prefer the smallest safe compatible direct-parent upgrade or a narrowly justified npm override; do not silently migrate to Express 5. Re-scan both locks and record precise fixed advisories and any remaining HTTP-family exceptions.

### T006: Repair Azure runtime dependency advisories
- Depends on: T005
- Skills: dependency-vulnerability-remediation, node-typescript-upgrade, build-fix-loop
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
  - standalone-install: `npm ci --prefix backend`
  - audit: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: T002 covers backend ACS/webhook/storage boundaries; T003 covers frontend call-service behavior.
- Risk: high (Azure SDK and speech/XML transitives might subtly alter call payloads or client initialization); choose only verified compatible fixes, keep both graphs synchronized, mock service boundaries, and request code review.
- Done when: The verified fixable critical/high Azure runtime findings (notably `fast-xml-parser` if still affected) and relevant directly affected SDKs are addressed in the backend and root locks, all gates and standalone install pass, and both-lock scan documents results.

Upgrade the shared ACS/Speech/Azure dependency family and any directly affected Azure packages only as necessary for verified fixes; prefer compatible parent upgrades, then narrowly scoped overrides if unavoidable. Check SDK peer/engine support for Node 24 and document any finding with no safe compatible fix instead of forcing a breaking major.

### T007: Repair frontend Vite build-tool advisories
- Depends on: T006
- Skills: dependency-vulnerability-remediation, node-typescript-upgrade, build-fix-loop
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
  - audit: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: T003 pins frontend formatting and call-service behavior; T001 pins clean Linux Rollup build.
- Risk: medium (bundler/test-runner peer mismatches and optional binaries); align Vite 6, plugins, and Vitest only where required, confirm optional packages via clean install, and inspect bundle and test totals.
- Done when: Verified fixable Vite/Rollup-family advisories are removed without a breaking framework jump, full gates pass on Node 24, and scan changes for both locks are recorded.

Keep the frontend bundler family in the smallest compatible patched releases; do not automatically install Vite 8 or TypeScript 7. If only a breaking major fixes a finding, record it as residual and propose a separate characterized migration rather than mixing it into this task.

### T008: Repair frontend delivery-tool advisory chain
- Depends on: T007
- Skills: dependency-vulnerability-remediation, node-typescript-upgrade, build-fix-loop
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
  - audit: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: T001/T003 protect frontend build and existing transaction behavior; verify the local SWA configuration still parses if the affected tool is updated.
- Risk: medium (the root critical `shell-quote` finding may require a delivery-tool parent update with unrelated transitive churn); establish the actual `npm explain` chain and fixed release first, review root-lock diff, and preserve build/test behavior.
- Done when: The root critical `shell-quote` advisory chain is fixed with a compatible parent/override if available, or the exact blocked fix and reachability are documented without claiming it clean; all gates pass and both-lock scan results are retained.

Investigate `shell-quote`'s actual parent before selecting a change; only touch the affected frontend tooling family and its npm-generated root lock. Do not accept npm's suggested `nodemon` major downgrade as an automatic audit fix; report that and other unresolved dev-only/lower-severity findings with advisory, reachability, and recommended follow-up.

### T009: Final validation and report
- Depends on: T001, T002, T003, T004, T005, T006, T007, T008
- Skills: modernization-report, test-baseline-and-characterization, dependency-vulnerability-remediation, build-fix-loop
- Validation:
  - build: `npm ci`
  - build: `npm run build --if-present`
  - test: `npm test`
  - lint: `npm run lint --if-present`
  - typecheck: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`
  - standalone-install: `npm ci --prefix backend`
  - audit: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .`
- Characterization: Compare final backend and frontend machine-readable test totals and results against the first green T001 baseline and T002/T003 additions; do not drop discovered tests.
- Risk: low (reporting can overstate partial security/deployment verification); obtain final branch code review, cite actual gate/audit outputs, and explicitly distinguish unverified live-Azure and deployment behavior.
- Done when: Node 24 clean root/standalone installs and all full gates are green after the last code change, both locks have a dated audit with all residual advisories listed, and `.github/modernization/28793a23-310c-4415-b15a-e1692e8530cc/final-report.md` records the ledger, before/after versions, validation counts, decisions, deployment prerequisites, and follow-ups.

Run the entire validation and scan again on the final tree, compare baseline counts and warnings, and review the branch diff for scope and behavior. Write the final report from assessment, task notes, run state, git changes, and fresh verification; report a partial outcome where an advisory or runtime/deployment verification remains unresolved rather than claiming a clean audit.

## Risks

- **Red baseline:** The existing Linux Rollup build and `npm test` both fail twice (assessment Build and CI). T001 fixes them atomically and is reviewed before allowing later tasks.
- **Untested integrations:** ACS, Speech, and Blob cannot be exercised against an isolated service in this environment (assessment Test services). T002/T003 characterize observable offline behavior; the final report flags live integration as unverified.
- **Audit breadth and overlapping locks:** The assessment scan has 53 root and 18 backend affected package entries, not 71 independent findings. T005-T008 focus on verified critical/high paths while every scan checks **both** locks; any remaining moderate/low or no-fix finding is listed with an owner decision or open follow-up, never silently suppressed.
- **Untracked deployment runtime:** There is no CI/container pin to update (assessment Stack inventory). T004 documents the prerequisite, and final review requests the actual deployment target for post-push confirmation.
