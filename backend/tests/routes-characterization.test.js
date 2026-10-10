import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { test } from 'node:test'

const azureKeys = [
  'ACS_CONNECTION_STRING', 'ACS_PHONE_NUMBER', 'CALLBACK_BASE_URL',
  'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_ACCOUNT_NAME',
  'AZURE_TTS_KEY', 'AZURE_SPEECH_KEY', 'AZURE_TTS_REGION',
  'AZURE_SPEECH_REGION', 'AZURE_TTS_ENDPOINT', 'COGNITIVE_SERVICES_ENDPOINT'
]

async function unusedPort() {
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const { port } = socket.address()
  socket.close()
  await once(socket, 'close')
  return port
}

test('unchanged HTTP routes: validation, health, state, webhooks and offline ACS errors', { timeout: 15000 }, async () => {
  const port = await unusedPort()
  const env = { ...process.env, PORT: String(port) }
  // Empty strings prevent dotenv from importing developer credentials from .env.
  for (const key of azureKeys) env[key] = ''
  env.AZURE_TTS_KEY = 'offline-test-only'
  env.AZURE_TTS_REGION = 'westus'
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const base = `http://127.0.0.1:${port}`
  const request = async (path, body, method = 'GET') => {
    const response = await fetch(base + path, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    })
    return { status: response.status, contentType: response.headers.get('content-type'), body: await response.text() }
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) break
      try {
        await request('/health')
        ready = true
        break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    assert.ok(ready, `backend failed to start: ${output}`)

    const health = await request('/health')
    assert.equal(health.status, 200)
    assert.match(health.contentType, /^application\/json/)
    const healthy = JSON.parse(health.body)
    assert.equal(healthy.status, 'healthy')
    assert.equal(healthy.service, 'ACS Backend')
    assert.match(healthy.timestamp, /^\d{4}-\d\d-\d\dT.*Z$/)
    assert.deepEqual(healthy.acs, {
      acsConfigured: false,
      clientInitialized: false,
      activeCalls: 0,
      configuration: {
        hasConnectionString: false, hasPhoneNumber: false, phoneNumber: null,
        callbackBaseUrl: `http://localhost:${port}`
      },
      connectivity: { success: false, error: 'ACS client not initialized' }
    })

    assert.deepEqual(JSON.parse((await request('/api/calls/absent/status')).body),
      { error: 'Transaction not found' })
    assert.equal((await request('/api/calls/absent/status')).status, 404)
    const invalid = await request('/api/calls/initiate', { transactionId: 'invalid' }, 'POST')
    assert.equal(invalid.status, 400)
    assert.deepEqual(JSON.parse(invalid.body), {
      error: 'Missing required fields',
      required: ['transactionId', 'customerPhone', 'customerName', 'amount', 'merchantName', 'currency']
    })
    assert.equal((await request('/api/calls/invalid/status')).status, 404)

    // amount and currency are listed as required in the error, but currently are
    // not validated. ACS is absent, so initiation records failure without a call.
    const failed = await request('/api/calls/initiate', {
      transactionId: 'offline-failure', customerPhone: '+14155550123',
      customerName: 'Ada', merchant: 'Corner Shop', amount: 0
    }, 'POST')
    assert.equal(failed.status, 500)
    assert.deepEqual(JSON.parse(failed.body), {
      error: 'Failed to initiate call',
      message: 'ACS Call Automation Client not initialized. Please check your ACS configuration.'
    })
    const status = await request('/api/calls/offline-failure/status')
    assert.equal(status.status, 200)
    const { transaction, found } = JSON.parse(status.body)
    assert.equal(found, true)
    assert.equal(transaction.id, 'offline-failure')
    assert.equal(transaction.merchantName, 'Corner Shop')
    assert.equal(transaction.merchant, 'Corner Shop')
    assert.equal(transaction.currency, 'USD')
    assert.equal(transaction.amount, 0)
    assert.equal(transaction.status, 'failed')
    assert.equal(transaction.error, 'ACS Call Automation Client not initialized. Please check your ACS configuration.')
    assert.match(transaction.callStartedAt, /^\d{4}-\d\d-\d\dT.*Z$/)
    assert.match(transaction.callEndedAt, /^\d{4}-\d\d-\d\dT.*Z$/)
    assert.match(transaction.lastUpdated, /^\d{4}-\d\d-\d\dT.*Z$/)
    assert.equal(transaction.auditLog.length, 1)
    assert.equal(transaction.auditLog[0].status, 'initiating')
    assert.equal(transaction.auditLog[0].message, 'Call initiation request received')

    // The handler records a playback failure before the unconfigured ACS
    // hangup throws; handleEvent swallows that downstream exception.
    const playbackFailure = await request('/api/callbacks/offline-failure', {
      type: 'Microsoft.Communication.PlayFailed',
      data: { callConnectionId: 'absent' }
    }, 'POST')
    assert.equal(playbackFailure.status, 200)
    assert.equal(playbackFailure.body, 'OK')
    const afterPlayback = JSON.parse((await request('/api/calls/offline-failure/status')).body).transaction
    assert.equal(afterPlayback.status, 'failed')
    assert.deepEqual(afterPlayback.auditLog.map(({ status, message }) => ({ status, message })), [
      { status: 'initiating', message: 'Call initiation request received' },
      { status: 'failed', message: 'Prompt playback failed' }
    ])
    assert.match(afterPlayback.auditLog[1].timestamp, /^\d{4}-\d\d-\d\dT.*Z$/)

    const events = await request('/api/callbacks/offline-failure', [
      { type: 'Microsoft.Communication.PlayStarted', data: { callConnectionId: 'absent', operationContext: 'confirmation_message' } },
      { type: 'Microsoft.Communication.ParticipantsUpdated', data: {} },
      { type: 'Unknown', data: {} }
    ], 'POST')
    assert.equal(events.status, 200)
    assert.equal(events.body, 'OK')
    assert.match(events.contentType, /^text\/html/)
    // An event handler error is logged/swallowed; a null event fails before
    // entering the handler's catch and produces a 500 instead.
    const badWebhook = await request('/api/callbacks/offline-failure', [null], 'POST')
    assert.equal(badWebhook.status, 500)
    assert.deepEqual(JSON.parse(badWebhook.body), { error: "Cannot read properties of null (reading 'type')" })
    const missingConnection = await request('/api/calls/connection/absent/status')
    assert.equal(missingConnection.status, 500)
    assert.deepEqual(JSON.parse(missingConnection.body), {
      error: "Cannot read properties of null (reading 'getCallConnection')"
    })
    const hangup = await request('/api/calls/absent/hangup', {}, 'POST')
    assert.equal(hangup.status, 500)
    assert.deepEqual(JSON.parse(hangup.body), {
      error: "Cannot read properties of null (reading 'getCallConnection')"
    })
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await once(child, 'exit')
    }
  }
})
