# ACS calling backend

This Express backend can initiate real Azure Communication Services (ACS) outbound calls, generate Azure AI Speech audio, serve that audio, and process ACS callbacks with DTMF responses. The frontend's “Demo Mode” banner does not mean that this server simulates calls. Live calls require working Azure credentials, a provisioned calling number, and publicly reachable callback and audio URLs.

## Setup

Use **Node.js 22+**. Install from the **repository root** with the shared workspace lockfile (there is no separate backend install/lockfile):

```bash
npm ci
cp backend/.env.example backend/.env
```

Edit `backend/.env` using the placeholders in `backend/.env.example`:

```env
PORT=3001
CALLBACK_BASE_URL=https://your-public-backend.example
ACS_CONNECTION_STRING=endpoint=https://<your-resource>.communication.azure.com/;accesskey=<your-key>
ACS_PHONE_NUMBER=+10000000000
AZURE_TTS_KEY=<your-speech-key>
AZURE_TTS_REGION=<your-region>
```

The server defaults to port **3001**. `CALLBACK_BASE_URL` must be the publicly reachable HTTPS **base URL** of this backend, without a callback path. `createCall` uses `${CALLBACK_BASE_URL}/api/callbacks/${transactionId}`; locally stored generated audio is served under `${CALLBACK_BASE_URL}/audio/:filename`. The sample's `http://localhost:3001` is only suitable for local access; ACS cannot call back to your localhost. During local live testing, expose port 3001 with a public HTTPS tunnel (for example, `ngrok http 3001`) and use its HTTPS origin for `CALLBACK_BASE_URL`. The Speech resource needs a key and region; `AZURE_TTS_ENDPOINT` is an optional alternative supported by the code. Optional Blob settings are `AZURE_STORAGE_CONNECTION_STRING` or `AZURE_STORAGE_ACCOUNT_NAME` (the latter uses Azure credentials); otherwise generated audio is saved locally. Keep secrets out of version control.

From the root, run:

```bash
npm run dev:backend    # nodemon
# or
npm run start:backend  # node
```

The frontend calls `http://localhost:3001` by default. If the backend is elsewhere, set `VITE_BACKEND_URL` in `frontend/.env.local` (see `frontend/.env.example`) to its base URL; never put Azure keys in frontend variables.

## Implemented endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/calls/initiate` | Start an outbound call with `transactionId`, `customerPhone`, `customerName`, `amount`, `merchantName` and `currency`; returns a call connection ID. |
| `POST` | `/api/callbacks/:transactionId` | Receive ACS events for the transaction (the callback URL passed to ACS). |
| `GET` | `/api/calls/:transactionId/status` | Get `{ transaction, found }` from the in-memory store; returns 404 if unknown. |
| `GET` | `/api/calls/connection/:callConnectionId/status` | Query call status by connection ID. |
| `POST` | `/api/calls/:callConnectionId/hangup` | Hang up the call. |
| `GET` | `/health` | Backend/ACS connectivity status. |
| `GET` | `/audio/:filename` | Serve locally generated Speech audio. |

The flow is: frontend posts an initiation request; backend synthesizes audio and calls ACS with a transaction-specific callback URL; ACS events trigger playback, DTMF recognition, response handling and hangup; frontend polls the transaction status endpoint. Keypad 1 approves, 2 rejects and 0 escalates the **demo transaction state**, not an actual bank payment.

The backend keeps transaction state and audit entries in a **process-local Map**, not a database. Restarting the server loses these records, and multiple instances cannot share them. Audio may be stored on the local filesystem or in configured Blob storage; that does not make transaction/audit state durable. The backend does not provide production authentication, webhook verification or compliance-grade audit retention.

## Tests and limits

From the repository root, after `npm ci`:

```bash
npm test
npm run build
npm run lint
```

`npm test` performs backend syntax checks and mocked backend and frontend tests; it needs no live Azure credentials. Build and lint target the frontend workspace. These offline checks cannot prove real ACS/Speech calling, public webhook delivery or PSTN behavior. For live testing, configure Azure resources and a reachable HTTPS callback/audio URL; do not use real customer numbers without authorization.
