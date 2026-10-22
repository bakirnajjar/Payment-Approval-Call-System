# Payment Transaction Approval via Phone Call

This is a demonstration UI backed by an Express service that can initiate **real** Azure Communication Services (ACS) outbound calls and use Azure AI Speech for audio prompts. The UI's “Demo Mode” label describes the prototype, **not** an offline call simulator: submitting a transaction calls the backend. Without a running backend and configured Azure resources, calls fail; opening the UI alone does not place calls or simulate successful DTMF responses.

## What is implemented

- The React/Vite frontend creates transactions, shows status and audit entries, and polls the backend for call updates. It uses Spark `useKV` for its transaction list; this is not a shared banking database.
- The Node/Express backend synthesizes speech, initiates an ACS call, serves generated audio (or uses configured Blob storage), handles ACS callback events and DTMF input (1 = approve, 2 = reject, 0 = escalate), and exposes status and hangup endpoints.
- Backend transactions and their audit logs are held in a **process-local in-memory Map**. They disappear on restart and are not shared across server instances. Neither this log nor the frontend's Spark KV data is a durable compliance audit trail or a core-banking approval integration. Authentication, webhook validation, durable persistence and compliance controls are not supplied here.

## Install and run

Use **Node.js 22 or newer**. From the repository root, install both npm workspaces using the root lockfile:

```bash
npm ci
```

For real calls, copy `backend/.env.example` to `backend/.env` and set `ACS_CONNECTION_STRING`, a provisioned `ACS_PHONE_NUMBER`, `AZURE_TTS_KEY` and `AZURE_TTS_REGION`. ACS must be able to reach the backend callback and audio URLs: set `CALLBACK_BASE_URL` to the **public HTTPS base URL** of this server (for local development, expose port **3001** through a tunnel, e.g. `ngrok http 3001`). The backend creates each callback URL as `${CALLBACK_BASE_URL}/api/callbacks/:transactionId`. The default `http://localhost:3001` in the env example is only local and cannot receive ACS callbacks. See [backend setup](backend/README.md) for optional storage settings.

The frontend defaults to `http://localhost:3001` for its backend. To use another host, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_BACKEND_URL` to the backend **base URL**, for example `VITE_BACKEND_URL=http://localhost:3001`. Do not put ACS or Speech secrets in `VITE_` variables: Vite exposes them to the browser.

Start each process in a separate terminal from the repository root:

```bash
npm run dev:backend
npm run dev:frontend
```

`npm run start:backend` starts the backend without nodemon. The backend listens on `PORT` (default **3001**); Vite prints its frontend URL when started. Open that URL to use the UI. The frontend posts to `/api/calls/initiate` and polls `/api/calls/:transactionId/status`; actual calls require Azure credentials, an eligible phone number and a reachable webhook/audio URL.

## Offline validation

From the repository root, after `npm ci`:

```bash
npm test
npm run build
npm run lint
```

`npm test` runs backend syntax checks, mocked backend Node tests and frontend Vitest tests. Build and lint run on the frontend workspace. These checks do **not** make real ACS calls, synthesize live Speech audio, or verify delivery of public webhooks; live end-to-end calling requires provisioned cloud resources and a reachable callback endpoint.

This is a prototype, not a production payment approval system. See [backend/README.md](backend/README.md) for the implemented API and call flow.
