import assert from 'node:assert/strict'
import { after, before, mock, test } from 'node:test'

const calls = new Map()
const mediaOperations = []
const generatedMessages = []
let initiateError
let recognizeError
let playbackError
let statusError
let hangupError

const callService = {
  async initiateCall(details) {
    if (initiateError) throw initiateError
    const callConnectionId = `call-${details.transactionId}`
    calls.set(callConnectionId, { ...details, audioUrl: 'https://example.test/verification.wav', status: 'initiated' })
    return { callConnectionId, audioUrl: 'https://example.test/verification.wav' }
  },
  getCallInfo(id) { return calls.get(id) },
  getCallConnection(id) {
    return {
      getCallMedia() {
        return {
          async cancelAllMediaOperations() { mediaOperations.push({ id, kind: 'cancel' }) },
          async playToAll(sources, options) {
            if (playbackError) throw playbackError
            mediaOperations.push({ id, kind: 'play', sources, options })
          },
          async startRecognizing(target, options) {
            if (recognizeError) throw recognizeError
            mediaOperations.push({ id, kind: 'recognize', target, options })
          }
        }
      }
    }
  },
  updateCallStatus(id, status, data = {}) {
    const previous = calls.get(id)
    if (previous) calls.set(id, { ...previous, ...data, status })
  },
  async getCallStatus(id) {
    if (statusError) throw statusError
    return { callConnectionId: id, localInfo: calls.get(id) }
  },
  async hangupCall(id) {
    if (hangupError) throw hangupError
    mediaOperations.push({ id, kind: 'hangup' })
    this.updateCallStatus(id, 'ended')
  },
  removeCall(id) { calls.delete(id) },
  generateConfirmationMessage(tone) { return `Confirmation for ${tone}` },
  getHealthStatus() { return { acsConfigured: false } },
  async testConnectivity() { return { success: false } }
}

const ttsService = {
  async synthesizeToAudio(message) {
    generatedMessages.push(message)
    return new Uint8Array([1, 2])
  }
}
const storageService = {
  async saveAudioFile(_buffer, name) { return `https://example.test/${name}.wav` }
}

mock.module('../services/call-service.js', { namedExports: { callService } })
mock.module('../services/tts-service.js', { namedExports: { ttsService } })
mock.module('../services/storage-service.js', { namedExports: { storageService } })

const { app } = await import('../server.js')
const { webhookHandler } = await import('../services/webhook-handler.js')
let server
let baseUrl

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await response.text()
  return { status: response.status, body: text === 'OK' ? text : JSON.parse(text) }
}

const details = (id) => ({
  transactionId: id,
  customerPhone: '+14155550123',
  customerName: 'Sam',
  amount: 42,
  merchant: 'Example Shop'
})

async function initiate(id) {
  const result = await request('/api/calls/initiate', 'POST', details(id))
  assert.equal(result.status, 200)
  return `call-${id}`
}

async function status(id) {
  const result = await request(`/api/calls/${id}/status`)
  assert.equal(result.status, 200)
  return result.body.transaction
}

async function callback(id, type, data) {
  const result = await request(`/api/callbacks/${id}`, 'POST', {
    type: `Microsoft.Communication.${type}`,
    data: { callConnectionId: `call-${id}`, ...data }
  })
  assert.deepEqual(result, { status: 200, body: 'OK' })
}

test('initiation validates input, records dialing state and exposes transaction status', async () => {
  assert.equal((await request('/api/calls/initiate', 'POST', { customerName: 'Sam' })).status, 400)
  assert.deepEqual(await request('/api/calls/missing/status'), {
    status: 404, body: { error: 'Transaction not found' }
  })
  const id = 'initiation'
  await initiate(id)
  const transaction = await status(id)
  assert.equal(transaction.status, 'dialing')
  assert.equal(transaction.callConnectionId, `call-${id}`)
  assert.equal(transaction.audioUrl, 'https://example.test/verification.wav')
  assert.equal(transaction.currency, 'USD')
  assert.equal(transaction.merchantName, 'Example Shop')
  assert.equal(transaction.auditLog[0].status, 'initiating')
  assert.ok(transaction.callStartedAt)
  assert.ok(transaction.lastUpdated)
  assert.equal((await request(`/api/calls/connection/call-${id}/status`)).body.localInfo.customerPhone, details(id).customerPhone)
  assert.deepEqual(await request(`/api/calls/call-${id}/hangup`, 'POST'),
    { status: 200, body: { success: true, message: 'Call ended' } })
})

test('initiation and legacy API report service failures without cloud calls', async () => {
  initiateError = new Error('ACS unavailable')
  try {
    const result = await request('/api/calls/initiate', 'POST', details('init-failure'))
    assert.equal(result.status, 500)
    assert.equal(result.body.message, 'ACS unavailable')
    const transaction = await status('init-failure')
    assert.equal(transaction.status, 'failed')
    assert.equal(transaction.error, 'ACS unavailable')
    assert.ok(transaction.callEndedAt)
  } finally { initiateError = undefined }
  statusError = new Error('status unavailable')
  hangupError = new Error('hangup unavailable')
  try {
    assert.equal((await request('/api/calls/connection/bad/status')).status, 500)
    assert.equal((await request('/api/calls/bad/hangup', 'POST')).status, 500)
  } finally {
    statusError = undefined
    hangupError = undefined
  }
})

test('connected and playback callbacks start recognition with correct customer and state', async () => {
  const id = 'connected'
  await initiate(id)
  await callback(id, 'CallConnected')
  assert.equal((await status(id)).status, 'waiting-input')
  assert.equal(calls.get(`call-${id}`).status, 'playing_message')
  assert.ok(mediaOperations.some((op) => op.id === `call-${id}` && op.kind === 'play' &&
    op.options.operationContext === 'verification_message' && op.sources[0].url.endsWith('verification.wav')))
  assert.ok(mediaOperations.some((op) => op.id === `call-${id}` && op.kind === 'recognize' &&
    op.target.phoneNumber === details(id).customerPhone && op.options.maxTonesToCollect === 1 &&
    op.options.operationContext === `dtmf_menu_${id}_1`))
  await callback(id, 'PlayStarted', { operationContext: 'verification_message' })
  await callback(id, 'PlayCompleted', { operationContext: 'verification_message' })
  assert.equal(webhookHandler.recognitionAttempts.get(`call-${id}`), 1)
})

for (const [tone, expected] of [['Tone1', 'approved'], ['2', 'rejected'], [{ tone: 'tone0' }, 'escalated']]) {
  test(`DTMF ${JSON.stringify(tone)} sets ${expected} and plays confirmation`, async () => {
    const id = `decision-${expected}`
    await initiate(id)
    await callback(id, 'CallConnected')
    await callback(id, 'RecognizeCompleted', {
      recognitionType: 'dtmf', dtmfResult: { tones: [tone] }
    })
    const transaction = await status(id)
    assert.equal(transaction.status, expected)
    assert.equal(transaction.dtmfInput, expected === 'approved' ? '1' : expected === 'rejected' ? '2' : '0')
    assert.equal(transaction.auditLog.at(-1).message, `Customer selected option ${transaction.dtmfInput}`)
    assert.equal(calls.get(`call-${id}`).status, 'confirmed')
    assert.ok(generatedMessages.includes(`Confirmation for ${transaction.dtmfInput}`))
    assert.ok(mediaOperations.some((op) => op.id === `call-${id}` && op.options?.operationContext === 'confirmation_message'))
  })
}

test('invalid DTMF re-prompts and retries; repeated invalid input fails and times out', async () => {
  const id = 'invalid'
  await initiate(id)
  await callback(id, 'CallConnected')
  await callback(id, 'RecognizeCompleted', { recognitionType: 'dtmf', dtmfResult: { tones: ['Tone3'] } })
  assert.equal((await status(id)).status, 'waiting-input')
  assert.ok(generatedMessages.some((message) => message.includes('the 3 key')))
  await callback(id, 'PlayCompleted', { operationContext: 'invalid_prompt_1' })
  assert.equal(webhookHandler.recognitionAttempts.get(`call-${id}`), 2)
  await callback(id, 'RecognizeCompleted', { recognitionType: 'dtmf', dtmfResult: { tones: ['*'] } })
  await callback(id, 'PlayCompleted', { operationContext: 'invalid_prompt_2' })
  await callback(id, 'RecognizeCompleted', { recognitionType: 'dtmf', dtmfResult: { tones: ['#'] } })
  assert.equal((await status(id)).status, 'timeout')
  assert.ok((await status(id)).auditLog.some((entry) => entry.message === 'Maximum invalid DTMF inputs received'))
  assert.equal(webhookHandler.recognitionAttempts.has(`call-${id}`), false)
})

test('empty recognition and ACS initial-silence failure take no-input timeout path', async () => {
  for (const [id, type, data] of [
    ['empty-input', 'RecognizeCompleted', { recognitionType: 'dtmf', dtmfResult: { tones: [] } }],
    ['silence', 'RecognizeFailed', { resultInformation: { subCode: 8512, message: 'Initial silence' } }]
  ]) {
    await initiate(id)
    await callback(id, 'CallConnected')
    await callback(id, type, data)
    assert.equal((await status(id)).status, 'timeout')
    assert.ok(mediaOperations.some((op) => op.id === `call-${id}` && op.options?.operationContext === 'timeout_message'))
  }
})

test('recognition and playback failures mark transaction failed and hang up', async () => {
  await initiate('recognize-error')
  recognizeError = new Error('recognition unavailable')
  try {
    await callback('recognize-error', 'CallConnected')
    assert.equal((await status('recognize-error')).status, 'failed')
    assert.equal((await status('recognize-error')).error, 'recognition unavailable')
    assert.ok(mediaOperations.some((op) => op.id === 'call-recognize-error' && op.kind === 'hangup'))
  } finally { recognizeError = undefined }

  await initiate('acs-error')
  await callback('acs-error', 'RecognizeFailed', { resultInformation: { code: 9999, message: 'Media error' } })
  assert.equal((await status('acs-error')).status, 'failed')
  assert.ok(mediaOperations.some((op) => op.id === 'call-acs-error' && op.kind === 'hangup'))

  await initiate('play-error')
  await callback('play-error', 'PlayFailed')
  assert.equal((await status('play-error')).status, 'failed')
  assert.ok(mediaOperations.some((op) => op.id === 'call-play-error' && op.kind === 'hangup'))

  await initiate('connect-play-error')
  playbackError = new Error('play unavailable')
  try {
    await callback('connect-play-error', 'CallConnected')
    assert.ok(mediaOperations.some((op) => op.id === 'call-connect-play-error' && op.kind === 'hangup'))
  } finally { playbackError = undefined }
})

test('batched callbacks preserve decision and disconnect timestamps', async () => {
  const id = 'batch'
  await initiate(id)
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const response = await request(`/api/callbacks/${id}`, 'POST', [
      { type: 'Microsoft.Communication.CallConnected', data: { callConnectionId: `call-${id}` } },
      { type: 'Microsoft.Communication.RecognizeCompleted', data: {
        callConnectionId: `call-${id}`, recognitionType: 'dtmf', dtmfResult: { tones: ['1'] }
      } },
      { type: 'Microsoft.Communication.CallDisconnected', data: { callConnectionId: `call-${id}` } }
    ])
    assert.deepEqual(response, { status: 200, body: 'OK' })
    const transaction = await status(id)
    assert.equal(transaction.status, 'approved')
    assert.ok(transaction.callEndedAt)
    assert.equal(webhookHandler.recognitionAttempts.has(`call-${id}`), false)
    mock.timers.tick(60000)
    assert.equal(calls.has(`call-${id}`), false)
  } finally {
    mock.timers.reset()
  }
})
