# Modernization report: Upgrade Node.js to current LTS

Outcome: SUCCEEDED - 12 of 12 tasks completed; build GREEN; tests 37/37 passing (baseline 0/0 discovered, with `npm test` failing). Security scanning is complete but **not clean**: two unresolved high-severity advisory chains remain open, not accepted.

## Summary

- Goal: Upgrade the whole repository from the declared Node 22+ runtime to Node 24 LTS while retaining npm workspaces, backend ESM and characterized application behavior.
- Scenario: `node-upgrade v1`; path scope: whole repository. In-place upgrade, preceded by build stabilization and offline characterization ([assessment](assessment.md), approved run-state plan). The approved plan is stored in the session artifact, **not** as a repository `plan.md`; no repository-relative plan link exists.
- Branch: `modernize/node-upgrade-e665c80e` based on `main`; the first 11 checkpoint commits were present in `git log --oneline main..HEAD` when this report was assembled. The final checkpoint is recorded by the completion workflow in the run ledger. No CI workflow or application source was changed. Branch-wide CodeReviewer review of `main...HEAD` reported no blocking findings ([T012](progress/T012.md)).

## Versions

Versions below are installed/locked versions rather than merely manifest ranges. Baseline comes from [assessment](assessment.md) and `git show main:{package-lock.json,backend/package-lock.json}`; final versions from the two current lockfiles and [T005](progress/T005.md)–[T011](progress/T011.md). Only Node's **support status** has been verified against a lifecycle source; other library lifecycle status is unknown.

| Component | Before | After | Support / source |
|---|---|---|---|
| Node.js, declared engine / validated runner | `>=22.0.0`; v22.23.3 | `>=24.0.0 <25` in all three manifests, `.nvmrc` `24`; v24.21.0 | Node 22 maintenance LTS to 2027-04-30; Node 24 maintenance LTS to 2028-04-30; Node 26 is Current, with LTS scheduled 2026-10-28. [Node release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json), checked 2026-10-22 (also checked 2026-10-21 in [assessment](assessment.md)). |
| npm, validated runner | 10.9.9 | 11.19.0 | Tool versions in [assessment](assessment.md) and [final validation](progress/T012.md); no npm version pin or lifecycle claim. |
| Frontend React / TypeScript / Vite | 19.2.0 / 5.7.3 / 6.4.1 | 19.2.0 / 5.7.3 / 6.4.4 | Root lockfile; lifecycle unknown. Full `tsc -b` now replaces `tsc -b --noCheck` ([T004](progress/T004.md)). |
| Frontend Node types / Static Web Apps CLI | transitive `@types/node` 22.18.12 / CLI 2.0.7 | direct `@types/node` 24.19.2 / CLI 2.0.9 | Root lockfile; lifecycle unknown. |
| Backend Express / body-parser | 4.21.2 / 1.20.3 | 4.22.3 / 1.20.8 | Independent backend lockfile; retained Express 4, lifecycle unknown. |
| Shared Azure identity / Speech SDK | 4.13.0 / 1.46.0 | 4.13.2 / 1.52.0 | Both lockfiles; Azure service/API interoperability unverified; lifecycle unknown. |
| Azure Call Automation / React major | 1.5.0 / 19 | 1.5.0 / 19 | Both installed dependency graph and frontend lock; no major migration. |

## Tasks

Checkpoint IDs and statuses: run ledger and `git log --oneline main..HEAD`. Each note is linked for the full change/validation record.

| Key | Title | Status | Checkpoint | Result |
|---|---|---|---|---|
| [T001](progress/T001.md) | Stabilizing baseline and establishing npm test | Completed | `0acaacc` | Repaired missing native optional lock entries; added five real tests and `tsx` runner. |
| [T002](progress/T002.md) | Characterizing backend behavior | Completed | `e30760e` | Added 19 offline backend tests, bringing suite to 24. |
| [T003](progress/T003.md) | Characterizing frontend behavior | Completed | `960bd26` | Added frontend service/UI and utility tests, bringing TAP suite to 37. |
| [T004](progress/T004.md) | Establishing full frontend TypeScript checking | Completed | `4a3a6d8` | Removed `--noCheck`; full type check passes. |
| [T005](progress/T005.md) | Pinning and validating Node 24 LTS | Completed | `222f1f6` | Pinned Node 24 and Node 24 types; documented deployment prerequisite. |
| [T006](progress/T006.md) | Remediating root-lock critical dependency | Completed | `52fd34d` | Patched transitive `shell-quote` with root override. |
| [T007](progress/T007.md) | Remediating frontend build-tool dependencies | Completed | `a7a6ed4` | Updated Vite/CLI and build/CLI transitives without a tool major upgrade. |
| [T008](progress/T008.md) | Remediating backend HTTP dependencies | Completed | `13843fa` | Patched Express 4, body-parser and HTTP transitives in both locks. |
| [T009](progress/T009.md) | Remediating backend Azure SDK dependencies | Completed | `16f2d5e` | Pinned transitive parser 5.7.0 independently in both locks. |
| [T010](progress/T010.md) | Addressing remaining frontend findings | Completed | `096e4a8` | Patched compatible frontend families; documented open node-forge risk. |
| [T011](progress/T011.md) | Addressing remaining backend findings | Completed | `4a22b33` | Patched identity/MSAL, Speech/UUID and JWS; documented open watcher risk. |
| [T012](progress/T012.md) | Final validation and reporting | Completed | Recorded by completion workflow in run ledger | Final gates and both-lock scan recorded, branch reviewed, this report written. |

No task failed or was skipped; no approved test exclusions or scope amendments appear in the run state.

## Changes and validation

`git diff --name-status main...HEAD` shows changes to `.nvmrc`, `package.json`, `package-lock.json`, `backend/{package.json,package-lock.json,README.md}`, `frontend/package.json`, `README.md`, four `test/*.test.mjs` files, assessment and progress notes. T012 adds this report and its progress note, not application source. Root remains the frontend-build/lint/test workspace and backend keeps an independently installable lock; lockfiles were generated through npm ([T001](progress/T001.md), [T005](progress/T005.md), [T008](progress/T008.md), [T009](progress/T009.md), [T011](progress/T011.md)).

Final authoritative commands ran **after the last code/dependency edit** on Node v24.21.0 / npm 11.19.0: [T012](progress/T012.md) and `/tmp/e665c80e-0dd1-46fa-bb78-e6f89641d287/validation-summary.json` (local, not committed). Baseline: [assessment](assessment.md). Final test counts are Node TAP entries: a prior JUnit representation records 36 leaf cases because it omits a parent of four nested subtests ([T003](progress/T003.md), [T005](progress/T005.md)).

| Gate | Exact command | Baseline | Final |
|---|---|---|---|
| Install | `npm ci` | Pass, 4 deprecation warnings | Pass, 6 deprecation warnings |
| Build + full frontend type check | `npm run build --if-present` | **Fail**, absent Rollup Linux native optional package; `--noCheck` masked semantic checking | **Pass**, `tsc -b` then Vite; 3 generated-CSS optimizer warnings |
| Full suite | `npm test` | **Fail**, no script; 0 discovered (not a successful zero-test run) | **Pass**, 37 passed / 0 failed / 0 skipped |
| Lint | `npm run lint --if-present` | Pass, 0 errors / 5 warnings | Pass, 0 errors / 5 warnings |
| Standalone backend install | `npm ci --prefix backend --workspaces=false` | Not measured | Pass |

Tests added: `test/transaction-utils.test.mjs` (transaction parsing/formatting and audit), `test/backend-characterization.test.mjs` (HTTP routes, statuses, callbacks and call state), `test/backend-call-service-success.test.mjs` (mocked ACS initiation and local audio fallback), `test/frontend-characterization.test.mjs` (mocked request/polling and rendered UI). [T001](progress/T001.md)–[T003](progress/T003.md) document the progressive 5 → 24 → 37 passing TAP entries; all 37 remain discovered. **Approved test exclusions: none** (run state); no skipped tests. Warnings were not suppressed. This validates mocked/local execution only, **not** a real Azure call, Speech/Blob authentication, an externally reachable callback, CLI certificate generation, or browser integration.

## Dependencies and security

Selected package changes (from npm-generated lockfiles, with reasons/advisory evidence in linked progress notes):

| Package / graph | Before → after | Type / rationale |
|---|---|---|
| `tsx` | absent → 4.20.6 | Added root development test loader; no application runtime change ([T001](progress/T001.md)). |
| `shell-quote` | 1.8.3 → 1.11.0 | Root dev transitive exact override; critical/high advisories fixed ([T006](progress/T006.md)). |
| `vite` / Static Web Apps CLI | 6.4.1 → 6.4.4 / 2.0.7 → 2.0.9 | Direct frontend development/build upgrades; patched build/CLI graph without major migration ([T007](progress/T007.md)). |
| `adm-zip` / `tmp` | 0.5.16 → 0.6.1 / 0.0.33 → 0.2.7 | Root transitive overrides where CLI parent ranges exclude patches ([T007](progress/T007.md)). |
| `rollup` / `postcss` | 4.52.5 → 4.64.12 / 8.5.6 → 8.5.31 | Root frontend build transitives, resolved by npm ([T007](progress/T007.md)). |
| `express` / `body-parser` / `proxy-addr` / `qs` | 4.21.2 → 4.22.3 / 1.20.3 → 1.20.8 / 2.0.7 → 2.0.8 / 6.13.0 → 6.16.1 | Backend direct and HTTP transitives, patched in both locks; no Express 5 ([T008](progress/T008.md)). |
| `fast-xml-parser` | 5.3.0 → 5.7.0 | Azure core-xml transitive, exact override in both package roots; critical and other parser advisories fixed ([T009](progress/T009.md)). |
| Speech SDK / `uuid` / `ws` | 1.46.0 → 1.52.0 / 11.1.0 → 11.1.1 / 8.18.3 → 8.22.0 | Compatible direct SDK and transitive patches; vulnerable nested UUID copies removed ([T010](progress/T010.md), [T011](progress/T011.md)). |
| `@azure/identity` / `@azure/msal-node` / `jws` | 4.13.0 → 4.13.2 / 3.8.0 → 5.6.0 / 3.2.2 → 4.0.1 | Backend direct identity patch and npm-resolved transitives; UUID/JWS findings fixed ([T011](progress/T011.md)). |
| ESLint / TypeScript-ESLint | 9.38.0 → 9.39.5 / 8.46.2 → 8.72.0 | Root frontend in-range lint-family patches ([T010](progress/T010.md)). |
| `node-forge` | 1.3.1 → 1.4.0 | CLI transitive update; **still vulnerable**, not a fix for GHSA-86w9-cpqp-85rv ([T010](progress/T010.md)). |

Additional in-range updates (including Babel/browser data, `axios`, `joi`, `picomatch`, `minimatch` and `brace-expansion`) and their before/after versions are in [T007](progress/T007.md) and [T010](progress/T010.md); backend dev transitive updates are in [T011](progress/T011.md). No direct application package was replaced, no audit suppression or allowlist was added, and no blanket forced audit fix was used. npm's incompatible downgrade suggestions are **not** verified fixes for the current tool chains.

Scanner: `bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .` (skill shell scanner invoking npm audit; final npm 11.19.0), run 2026-10-22; **complete, exit 2 = vulnerabilities present**, not exit 0. Local ignored raw evidence: `.modernization-scratch/scan/npm-..json` and `.modernization-scratch/scan/npm-backend.json`; summary: [T012](progress/T012.md). Initial scan 2026-10-21 in [assessment](assessment.md) used npm 10.9.9. Counts are npm **package findings per lock**, and backend packages overlap the root lock: never add them as unique vulnerabilities.

| Lock | Baseline critical / high / moderate / low | Final critical / high / moderate / low | Still open |
|---|---|---|---|
| `package-lock.json` | 3 / 35 / 12 / 3 = 53 | **0 / 6 / 0 / 0 = 6** | Two high advisory chains, three propagated package findings each |
| `backend/package-lock.json` | 2 / 10 / 6 / 0 = 18 | **0 / 3 / 0 / 0 = 3** | Same braces chain as root |

| Advisory | Severity | Package: from → to | Direct/transitive and current path | Status / owner decision |
|---|---|---|---|---|
| [GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p), [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv) | Critical / high | `shell-quote`: 1.8.3 → 1.11.0 | Frontend dev CLI → concurrently; root lock | **Fixed**, absent in final scan; [T006](progress/T006.md). |
| [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | Critical | `proxy-addr`: 2.0.7 → 2.0.8 | Backend Express transitive; both locks | **Fixed**, absent; [T008](progress/T008.md). |
| [GHSA-m7jm-9gc2-mpf2](https://github.com/advisories/GHSA-m7jm-9gc2-mpf2) and six other parser advisories | Critical/high/moderate/low | `fast-xml-parser`: 5.3.0 → 5.7.0 | Backend Blob SDK → Azure core-xml; both locks | **Fixed**, absent; advisory IDs and ranges in [T009](progress/T009.md). |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [GHSA-869p-cjfg-cm3x](https://github.com/advisories/GHSA-869p-cjfg-cm3x) | Moderate / high | vulnerable nested UUID copies removed; `jws`: 3.2.2 → 4.0.1 | Backend Azure identity/MSAL/Speech graph; both locks | **Fixed**, absent; [T011](progress/T011.md). |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | **High** | `braces`: 3.0.3 → unchanged | Backend direct **dev** watcher nodemon → chokidar → braces; three propagated package findings in **each** lock | **OPEN, not accepted**; no patched braces release established on 2026-10-22. Backend dev-tool/dependency owner: revisit at next security/dependency review; check patched chain or characterize alternative watcher/glob handling. Avoid untrusted deeply nested development glob patterns meanwhile ([T011](progress/T011.md)). |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | **High** | `node-forge`: 1.3.1 → 1.4.0, still affected | Frontend **dev** Static Web Apps CLI → selfsigned → node-forge; three propagated package findings in root lock only | **OPEN, not accepted**. User explicitly chose on 2026-10-22 to **leave open and report**; no patched node-forge release established. Frontend CLI/dependency owner: reassess at next security/dependency review for patched path or characterized selfsigned/CLI migration with certificate integration coverage ([T010](progress/T010.md)). |

Development-only provenance does **not** prove the vulnerable paths unreachable. Scanner counts and advisory details can change with the registry feed; no future clean-scan claim is made.

## Behavior, compatibility and recorded decisions

| Decision / change | Observable impact or rationale | Evidence / coverage |
|---|---|---|
| Require Node 24 major rather than moving automatically to scheduled Node 26 LTS | Existing Node 22 hosts/images must upgrade; Node 26 was not yet LTS on the check date. Keep npm workspaces and ESM backend. | `.nvmrc`, three manifests, [assessment](assessment.md), approved plan and [T005](progress/T005.md); offline backend/frontend tests pass on Node 24. |
| Keep TypeScript 5.7, Vite 6, React 19, bundler resolution and Express 4 | Avoid unrelated compiler/framework major changes; replace `--noCheck` with full semantic checking. | [T004](progress/T004.md), [T007](progress/T007.md), [T008](progress/T008.md); build and 37 offline tests. |
| Keep independent backend lock; use npm-generated locks and narrowly scoped transitive overrides | Standalone `npm ci` still works; root overrides alone do not affect independent backend installation. | [T005](progress/T005.md), [T009](progress/T009.md), [T011](progress/T011.md); standalone install passes. |
| Keep characterized application contracts; no production source edit | Existing `/health`, initiation/callback/status/hangup, frontend request/polling, formatting and rendered UI behavior is pinned, including existing quirks; no intentional route, payload, port, encoding or configuration-key migration. | `git diff --name-status main...HEAD` and [T002](progress/T002.md), [T003](progress/T003.md). Offline tests cannot establish production parity. |
| Leave CI untouched at user's request; no speculative deployment workflow | Deployment/runner runtime must be set manually to Node 24; no tracked CI/Dockerfile was changed. | Approved plan decision, [assessment](assessment.md), [T005](progress/T005.md), `git diff --name-status main...HEAD`. |
| Defer node-forge certificate migration without accepting its risk; keep braces watcher issue open | Avoid an uncharacterized selfsigned 5.x major replacement or incompatible nodemon downgrade. Both advisories stay visible for owner review. | User decision in [T010](progress/T010.md); [T011](progress/T011.md), [T012](progress/T012.md), final audit. |

## CI, deployment and configuration

- Workflow files changed: **none**; none tracked at baseline ([assessment](assessment.md), branch diff). If a future task adds/changes `.github/workflows`, Futuristic requires additional workflow-change confirmation before pushing.
- Hosts, build images and local environments need Node **24.x** and a compatible npm install; `.nvmrc` and all three engines specify the major. `backend/README.md` updates its **illustrative** Docker base to `node:24-alpine`; no actual Dockerfile or image was changed or built ([T005](progress/T005.md)).
- Added/renamed configuration keys: **none** in the branch diff. Existing Azure and frontend setting names are documented in [assessment](assessment.md) and `backend/README.md`; actual deployment settings, service connections, ports and publicly reachable callbacks were not validated. No CI secrets or values belong in this report.

## Risks and follow-ups

| Item | Severity | Recommendation / owner |
|---|---|---|
| Two **open** high dependency chains; both-lock scanner exits 2 | High | Frontend CLI/dependency owner and backend dev-tool/dependency owner: reassess patched releases at the **next security/dependency review** and plan characterized replacements if still unresolved; do not represent either as accepted or scan-clean. |
| No live ACS, Speech, Blob, callback or CLI certificate validation | Unknown operational severity | Deployment/integration owner: arrange separately authorized isolated sandbox checks before production rollout; do not use production calls/credentials for tests. |
| Node runtime change and install/build warnings | Medium operational risk | Deployment owner: update host/CI runtime manually; validate target OS/architecture and review 6 npm deprecations, 3 generated-CSS warnings and 5 ESLint warnings without suppressing them ([T012](progress/T012.md)). |

## Open questions

- Who owns the isolated Azure test resources and reachable callback endpoint for a non-production smoke check? [Assessment](assessment.md) records that availability as unverified; request explicit authorization before testing.
- Which team will update the deployment/CI Node version and own the next security/dependency review? The plan intentionally left workflow changes out of scope; the two advisory owners are identified above, but a named person is unknown.

## How to verify locally

From the repository root, select Node 24 (`nvm use` if using nvm) and run the exact final gates:

```sh
node --version
npm --version
npm ci
npm run build --if-present
npm test
npm run lint --if-present
npm ci --prefix backend --workspaces=false
bash /shared/skills/dependency-vulnerability-remediation/scripts/scan-dependencies.sh --output-dir .modernization-scratch/scan .
```

The final scan is expected to exit **2** until both open chains are resolved; do not interpret green build/test/lint as a clean audit. The scanner script path is the run's skill installation path; use an equivalent complete both-lock `npm audit` process if that skill is unavailable elsewhere. For local app execution, after configuring **non-production** backend settings documented in `backend/README.md`, use `npm run start:backend` and `npm run dev:frontend` in separate terminals. A locally accessible `/health` is not proof of live Azure connectivity. No automated live smoke command was validated.

## Artifacts and next steps

- [Assessment](assessment.md); approved plan in run state/session artifact (no repository copy); all progress notes [T001](progress/T001.md), [T002](progress/T002.md), [T003](progress/T003.md), [T004](progress/T004.md), [T005](progress/T005.md), [T006](progress/T006.md), [T007](progress/T007.md), [T008](progress/T008.md), [T009](progress/T009.md), [T010](progress/T010.md), [T011](progress/T011.md), [T012](progress/T012.md).
- Local-only validation record: `/tmp/e665c80e-0dd1-46fa-bb78-e6f89641d287/validation-summary.json`; locally excluded scanner output: `.modernization-scratch/scan/`. These are evidence locations, **not** committed report links.
- Review the branch and open risks, then **review and push from Futuristic** after the appropriate human approvals; this report did not commit or push.
