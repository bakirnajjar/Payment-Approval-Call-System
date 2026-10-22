import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { after, before, test } from 'node:test'

let child
let base

async function unusedPort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

before(async () => {
  const port = await unusedPort()
  base = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, [new URL('fixtures/offline-server.js', import.meta.url).pathname], {
    env: { PATH: process.env.PATH, TZ: 'UTC', LANG: 'C.UTF-8', PORT: String(port) },
    stdio: 'ignore'
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Offline server exited: ${child.exitCode}`)
    try {
      const response = await fetch(`${base}/health`)
      if (response.ok) return
    } catch { /* server still starting */ }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('Offline server did not start')
})

after(() => {
  if (child && child.exitCode === null) child.kill()
})

async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const text = await response.text()
  return { response, body: text.startsWith('{') ? JSON.parse(text) : text }
}

test('health reports offline ACS connectivity and JSON with a UTC timestamp', async () => {
  const response = await fetch(`${base}/health`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^application\/json/)
  const body = await response.json()
  assert.deepEqual(Object.keys(body), ['status', 'service', 'timestamp', 'acs'])
  assert.equal(body.status, 'healthy')
  assert.equal(body.service, 'ACS Backend')
  assert.match(body.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
  assert.deepEqual(body.acs, {
    acsConfigured: false, clientInitialized: false, activeCalls: 0,
    connectivity: { success: false, error: 'ACS client not initialized' }
  })
})

test('initiation rejects missing required identity fields but accepts omitted amount, merchant and currency', async () => {
  for (const body of [{}, { transactionId: 'invalid', customerName: 'A' }, { transactionId: 'invalid', customerPhone: '+123' }]) {
    const result = await request('/api/calls/initiate', body)
    assert.equal(result.response.status, 400)
    assert.deepEqual(result.body, {
      error: 'Missing required fields',
      required: ['transactionId', 'customerPhone', 'customerName', 'amount', 'merchantName', 'currency']
    })
  }
  assert.deepEqual((await fetch(`${base}/api/calls/invalid/status`)).status, 404)

  const { response, body } = await request('/api/calls/initiate', {
    transactionId: 'defaults', customerPhone: '+123', customerName: 'A'
  })
  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    success: true, callConnectionId: 'offline-connection', transactionId: 'defaults', status: 'initiated'
  })
  const status = await (await fetch(`${base}/api/calls/defaults/status`)).json()
  assert.equal(status.found, true)
  assert.equal(status.transaction.currency, 'USD')
  assert.equal(status.transaction.status, 'dialing')
  assert.equal(status.transaction.audioUrl, 'https://example.invalid/audio.wav')
  assert.equal(status.transaction.merchant, undefined)
  assert.equal(status.transaction.auditLog[0].message, 'Call initiation request received')
})

test('merchant alias and explicit currency survive status serialization, while initiation failures remain queryable', async () => {
  const payload = {
    transactionId: 'alias', customerPhone: '+1999', customerName: 'Zoë',
    amount: 123.45, merchant: 'Old label', currency: 'EUR'
  }
  assert.equal((await request('/api/calls/initiate', payload)).response.status, 200)
  const status = await (await fetch(`${base}/api/calls/alias/status`)).json()
  assert.deepEqual({ ...status.transaction, callStartedAt: undefined, lastUpdated: undefined,
    auditLog: undefined }, {
    id: 'alias', customerPhone: '+1999', customerName: 'Zoë', amount: 123.45,
    merchantName: 'Old label', merchant: 'Old label', currency: 'EUR', status: 'dialing',
    callConnectionId: 'offline-connection', audioUrl: 'https://example.invalid/audio.wav',
    callStartedAt: undefined, lastUpdated: undefined, auditLog: undefined
  })
  assert.match(status.transaction.callStartedAt, /Z$/)
  assert.equal(status.transaction.auditLog.length, 1)

  const failed = await request('/api/calls/initiate', { ...payload, transactionId: 'failure' })
  assert.equal(failed.response.status, 500)
  assert.deepEqual(failed.body, { error: 'Failed to initiate call', message: 'offline call failure' })
  const failedStatus = await (await fetch(`${base}/api/calls/failure/status`)).json()
  assert.equal(failedStatus.transaction.status, 'failed')
  assert.equal(failedStatus.transaction.error, 'offline call failure')
  assert.match(failedStatus.transaction.callEndedAt, /Z$/)
})

test('status, legacy connection lookup, callback and hangup preserve response shapes', async () => {
  const missing = await fetch(`${base}/api/calls/unknown/status`)
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { error: 'Transaction not found' })
  const legacy = await fetch(`${base}/api/calls/connection/c-1/status`)
  assert.deepEqual(await legacy.json(), { callConnectionId: 'c-1', callState: 'offline' })
  assert.deepEqual((await request('/api/calls/c-1/hangup', {})).body, { success: true, message: 'Call ended' })
  const callback = await request('/api/callbacks/unseen', { type: 'Unknown.Event' })
  assert.equal(callback.response.status, 200)
  assert.equal(callback.body, 'OK')
  assert.equal((await fetch(`${base}/api/calls/unseen/status`)).status, 404)
})

test('callback batches transition an initiated transaction through connected, DTMF approval and disconnect', async () => {
  await request('/api/calls/initiate', {
    transactionId: 'events', customerPhone: '+123', customerName: 'A', amount: 9, merchantName: 'Shop'
  })
  const callback = await request('/api/callbacks/events', [
    { type: 'Microsoft.Communication.CallConnected', data: { callConnectionId: 'offline-connection' } },
    { type: 'Microsoft.Communication.RecognizeCompleted', data: {
      callConnectionId: 'offline-connection', recognitionType: 'dtmf', dtmfResult: { tones: [{ tone: 'Tone1' }] }
    } },
    { type: 'Microsoft.Communication.CallDisconnected', data: { callConnectionId: 'offline-connection' } }
  ])
  assert.equal(callback.response.status, 200)
  assert.equal(callback.body, 'OK')
  const { transaction } = await (await fetch(`${base}/api/calls/events/status`)).json()
  assert.equal(transaction.status, 'approved')
  assert.equal(transaction.dtmfInput, '1')
  assert.match(transaction.callEndedAt, /Z$/)
  assert.deepEqual(transaction.auditLog.map(entry => [entry.status, entry.message]), [
    ['initiating', 'Call initiation request received'],
    ['connected', 'Call connected - customer answered'],
    ['playing-message', 'Playing TTS verification message'],
    ['waiting-input', 'Waiting for customer DTMF input'],
    ['approved', 'Customer selected option 1'],
    ['approved', 'Call disconnected']
  ])
})

test('recognition aliases map to rejected and escalated responses, without altering disconnected status', async () => {
  for (const [id, tone, expected, digit] of [
    ['reject', 'TWO', 'rejected', '2'],
    ['escalate', { tone: 'ToneO' }, 'escalated', '0']
  ]) {
    await request('/api/calls/initiate', {
      transactionId: id, customerPhone: '+123', customerName: 'A'
    })
    const callback = await request(`/api/callbacks/${id}`, {
      type: 'Microsoft.Communication.RecognizeCompleted',
      data: { callConnectionId: 'offline-connection', recognitionType: 'dtmf', dtmfResult: { tones: [tone] } }
    })
    assert.equal(callback.response.status, 200)
    assert.equal(callback.body, 'OK')
    const { transaction } = await (await fetch(`${base}/api/calls/${id}/status`)).json()
    assert.equal(transaction.status, expected)
    assert.equal(transaction.dtmfInput, digit)
    assert.deepEqual(transaction.auditLog.at(-1).message, `Customer selected option ${digit}`)
  }
})

test('unsupported star prompts a retry; missing tones and initial-silence recognition failures time out', async () => {
  for (const id of ['invalid-tone', 'no-tone', 'silence']) {
    await request('/api/calls/initiate', { transactionId: id, customerPhone: '+123', customerName: 'A' })
  }
  const event = (tones) => ({
    type: 'Microsoft.Communication.RecognizeCompleted',
    data: { callConnectionId: 'offline-connection', recognitionType: 'dtmf', dtmfResult: { tones } }
  })
  assert.equal((await request('/api/callbacks/invalid-tone', event(['*']))).body, 'OK')
  const invalid = (await (await fetch(`${base}/api/calls/invalid-tone/status`)).json()).transaction
  assert.equal(invalid.status, 'waiting-input')
  assert.match(invalid.auditLog.at(-1).message, /Invalid input received - re-prompting \(1\/3\)/)
  assert.equal((await request('/api/callbacks/no-tone', event([]))).body, 'OK')
  const empty = (await (await fetch(`${base}/api/calls/no-tone/status`)).json()).transaction
  assert.equal(empty.status, 'timeout')
  assert.equal(empty.auditLog.at(-1).message, 'No DTMF input received')
  assert.equal((await request('/api/callbacks/silence', {
    type: 'Microsoft.Communication.RecognizeFailed',
    data: { callConnectionId: 'offline-connection', resultInformation: { subCode: '8512' } }
  })).body, 'OK')
  assert.equal((await (await fetch(`${base}/api/calls/silence/status`)).json()).transaction.status, 'timeout')
})
