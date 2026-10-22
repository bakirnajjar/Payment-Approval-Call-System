# Phase 1: Assessment

Assessed 2026-10-22 on branch `upgradeagent` at `cd54d7c`. Scope: whole repository. This is a read-only assessment of source files; no upgrade has been applied.

## Application inventory

- npm workspaces at `frontend/` and `backend/`; root `package.json` runs the frontend build and lint only. All three manifests specify Node.js >=22. A root `package-lock.json` and a separate `backend/package-lock.json` are tracked; the root lockfile governs root workspace installs.
- Frontend: React 19, TypeScript ~5.7.2, Vite ^6.3.5, Tailwind CSS 4, GitHub Spark KV/hooks, Radix UI components. `frontend/src/App.tsx` persists transactions in Spark KV and polls the backend through `frontend/src/lib/call-service.ts`.
- Backend: Express ^4.18.2 JavaScript service, Azure Communication Services Call Automation, Speech SDK, and optional Azure Blob storage. `backend/server.js` exposes call initiation/status/hangup and ACS callback routes; `backend/services/webhook-handler.js` processes call and DTMF events. Transactions and active calls reside in process-local maps.
- README describes a demonstration/simulation, whereas the frontend initiates requests to a backend that requires configured Azure services for real calling. Live Azure calling and callback delivery were not exercised.

## Baseline

| Command | Outcome |
| --- | --- |
| `npm ci --no-audit --no-fund` | Completed; npm reported four deprecated transitive packages. The locked install omitted `@rollup/rollup-linux-x64-gnu`, so the first build could not load Rollup. |
| `npm run build` | **Blocked**. After a local-only, no-save/no-lockfile installation of the missing Rollup package, Vite reached SWC but failed loading its native binding. SWC reports that `/workspace/.home/.cache` and `/tmp` have unsafe writable ancestors; `/home/tools` is a safe path but read-only in this environment. This is not evidence of a TypeScript compile failure. The local installation changed installed dependency versions, not tracked manifests or lockfiles. A reproducible bundling baseline still needs a safe writable SWC cache and a complete locked native dependency installation. |
| `./node_modules/.bin/tsc -p frontend/tsconfig.json --noEmit` | Passed after dependencies were installed. The normal build script uses `tsc -b --noCheck`, which does not perform this semantic check. |
| `npm run lint` | Exited 0 with **five warnings**: two React hook dependency warnings in `frontend/src/App.tsx` and three React Refresh export warnings in `frontend/src/components/ui/{badge,button,form}.tsx`. |
| `npm test --workspaces` | Failed because **both workspaces lack a `test` script**. No tracked `*.test.*` or `*.spec.*` files were found; there is no runnable full automated test suite to baseline. |
| `node --check backend/server.js` and `backend/services/*.js` | Passed syntax checks; this is not a backend build or functional test. |

## Upgrade considerations for planning

1. Establish repeatable verification before dependency migrations: add tests for transaction creation, DTMF decision/error handling and frontend/backend API contracts; make semantic TypeScript checking part of the build. Resolve the optional native-package lockfile gap and provide a safe writable SWC cache in the build environment before claiming a green bundle baseline.
2. Align workspace dependency and lockfile management. Confirm whether the separate backend lockfile is intended for standalone deployment or should be consolidated under the root workspace lockfile. Assess direct dependency usage and compatibility before selecting version updates; do not infer current upstream versions from these manifests alone.
3. Review Express/backend migration separately from frontend framework/toolchain upgrades. The webhook endpoint and call-initiation route in `backend/server.js` should be assessed for authentication/event validation, input validation, and safe state transitions before treating this demonstration as production-ready. Storage and state are process-local; persistence, idempotency and audit durability require an explicit architecture decision.
4. Reconcile demonstration wording and operating instructions with real backend behavior. `backend/README.md` says port 3000, while `backend/server.js` defaults to 3001. Frontend default backend URL is `http://localhost:3001`; verify deployment configuration and CORS needs as part of any modernization plan.

## Constraints and unknowns

- No target framework/package versions, deployment target, or production-readiness goal has been specified. Confirm scope and supported target versions during planning rather than silently selecting latest releases.
- Cloud calls, TTS, blob storage, and browser flows require configuration/services unavailable to this baseline. Build failure is environment-dependent; functional behavior remains unverified without a test suite.
