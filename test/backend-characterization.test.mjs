import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { once } from 'node:events'
import { createRequire } from 'node:module'

// Resolve from the backend so both hoisted workspace and standalone installs
// intercept the same Express instance used by server.js.
const express = createRequire(new URL('../backend/package.json', import.meta.url))('express')

// Backend traces log entire requests/call objects. Keep TAP IPC small and never
// emit test-only caller details into the CI log.
const originalConsole = { log: console.log, warn: console.warn, error: console.error }
console.log = () => {}
console.warn = () => {}
console.error = () => {}

// Keep all Azure clients offline, including when the test runner inherits credentials.
for (const key of [
  'ACS_CONNECTION_STRING', 'ACS_PHONE_NUMBER', 'AZURE_STORAGE_CONNECTION_STRING',
  'AZURE_STORAGE_ACCOUNT_NAME', 'AZURE_TTS_ENDPOINT', 'COGNITIVE_SERVICES_ENDPOINT',
  'AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'
]) process.env[key] = ''
process.env.AZURE_TTS_KEY = 'test-only-not-a-credential'
process.env.AZURE_TTS_REGION = 'test-region'
process.env.CALLBACK_BASE_URL = 'https://example.invalid'

const { callService } = await import('../backend/services/call-service.js')
const { ttsService } = await import('../backend/services/tts-service.js')
const { storageService } = await import('../backend/services/storage-service.js')
const { webhookHandler } = await import('../backend/services/webhook-handler.js')

const effects = { calls: [], speech: [], files: [], media: [], recognitions: [], hangups: [] }
const info = new Map()
const connection = {
  getCallConnectionProperties: async () => ({ callConnectionState: 'Connected' }),
  hangUp: async (forEveryone) => { effects.hangups.push(forEveryone) },
  getCallMedia: () => ({
    cancelAllMediaOperations: async () => { effects.media.push({ cancel: true }) },
    playToAll: async (sources, options) => { effects.media.push({ sources, options }) },
    startRecognizing: async (target, options) => { effects.recognitions.push({ target, options }) }
  })
}
const originals = {
  listen: express.application.listen,
  initiateCall: callService.initiateCall,
  getCallConnection: callService.getCallConnection,
  getCallInfo: callService.getCallInfo,
  updateCallStatus: callService.updateCallStatus,
  synthesizeToAudio: ttsService.synthesizeToAudio,
  saveAudioFile: storageService.saveAudioFile
}

callService.initiateCall = async (request) => {
  effects.calls.push(request)
  if (request.transactionId === 'cloud-failure') throw new Error('stubbed ACS failure')
  const audioUrl = 'https://example.invalid/audio/verification.wav'
  info.set(`connection-${request.transactionId}`, { ...request, audioUrl, status: 'initiated' })
  return { callConnectionId: `connection-${request.transactionId}`, audioUrl }
}
callService.getCallConnection = () => connection
callService.getCallInfo = (id) => info.get(id)
callService.updateCallStatus = (id, status, data = {}) => {
  if (info.has(id)) info.set(id, { ...info.get(id), status, ...data })
}
ttsService.synthesizeToAudio = async (text) => {
  effects.speech.push(text)
  return Buffer.from('offline audio')
}
storageService.saveAudioFile = async (buffer, filename) => {
  effects.files.push({ contents: buffer.toString(), filename })
  return `https://example.invalid/audio/${filename}.wav`
}

// The production entry point listens on import. Redirect only its listen call to
// an ephemeral loopback port; do not change the application's routes or startup.
let server
express.application.listen = function (...args) {
  server = originals.listen.call(this, 0, '127.0.0.1', ...args.slice(1).filter((arg) => typeof arg === 'function'))
  return server
}
try {
  await import('../backend/server.js')
} finally {
  express.application.listen = originals.listen
}
if (!server.listening) await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
const originalSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (callback, delay, ...args) => {
  const timer = originalSetTimeout(callback, delay, ...args)
  // Webhook's delayed hangups and 60-second cleanup should not keep an
  // otherwise completed offline test process alive.
  if ([1000, 3000, 60000].includes(delay)) timer.unref()
  return timer
}
const request = async (path, body, method = 'POST') => {
  const response = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await response.text()
  return { code: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text }
}
const transaction = (id, more = {}) => ({
  transactionId: id, customerPhone: '+14155550199', customerName: 'Ada',
  amount: 1234.5, merchant: 'Café', ...more
})
const callback = (id, type, data) =>
  request(`/api/callbacks/${id}`, { type: `Microsoft.Communication.${type}`, data })
const status = (id) => request(`/api/calls/${id}/status`, undefined, 'GET')

after(async () => {
  for (const [key, value] of Object.entries(originals)) {
    if (key === 'listen') continue
    const owner = ['synthesizeToAudio'].includes(key) ? ttsService
      : key === 'saveAudioFile' ? storageService : callService
    owner[key] = value
  }
  webhookHandler.recognitionAttempts.clear()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  globalThis.setTimeout = originalSetTimeout
  Object.assign(console, originalConsole)
})

test('health reports offline ACS configuration and connectivity without contacting Azure', async () => {
  const response = await request('/health', undefined, 'GET')
  assert.equal(response.code, 200)
  assert.equal(response.body.status, 'healthy')
  assert.equal(response.body.service, 'ACS Backend')
  assert.match(response.body.timestamp, /^\d{4}-\d\d-\d\dT/)
  assert.deepEqual(response.body.acs.connectivity, { success: false, error: 'ACS client not initialized' })
  assert.equal(response.body.acs.acsConfigured, false)
  assert.equal(response.body.acs.clientInitialized, false)
  assert.equal(response.body.acs.configuration.phoneNumber, null)
  assert.equal(response.body.acs.configuration.callbackBaseUrl, 'https://example.invalid')
})

test('health connectivity exception becomes an unhealthy 500 response', async () => {
  const original = callService.testConnectivity
  callService.testConnectivity = async () => { throw new Error('offline connectivity failure') }
  try {
    const response = await request('/health', undefined, 'GET')
    assert.equal(response.code, 500)
    assert.equal(response.body.status, 'unhealthy')
    assert.equal(response.body.error, 'offline connectivity failure')
    assert.match(response.body.timestamp, /^\d{4}-\d\d-\d\dT/)
  } finally {
    callService.testConnectivity = original
  }
})

test('call service preserves US currency formatting and rejects calls without configured ACS', async () => {
  assert.equal(callService.generateVerificationMessage({
    customerName: 'Ada', amount: 1234.5, merchantName: 'Café'
  }), "Hello Ada. This is an automated call from your bank's fraud prevention system. We detected a transaction of $1,234.50 at Café. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0. Please make your selection now.")
  assert.match(callService.generateVerificationMessage({
    customerName: 'Ada', amount: 12.5, currency: 'EUR'
  }), /€12\.50 at the merchant/)
  await assert.rejects(originals.initiateCall.call(callService, transaction('offline')),
    /ACS Call Automation Client not initialized/)
  assert.equal(effects.speech.length, 0)
})

test('initiation validates only identity/phone/name and returns the documented required list', async () => {
  const response = await request('/api/calls/initiate', { transactionId: 'incomplete' })
  assert.deepEqual(response, {
    code: 400,
    body: {
      error: 'Missing required fields',
      required: ['transactionId', 'customerPhone', 'customerName', 'amount', 'merchantName', 'currency']
    }
  })
  assert.equal(effects.calls.length, 0)
  assert.deepEqual(await status('incomplete'), { code: 404, body: { error: 'Transaction not found' } })
})

test('initiation defaults USD, accepts merchant alias, and stores dialing state and audit entry', async () => {
  const result = await request('/api/calls/initiate', transaction('approve'))
  assert.deepEqual(result, {
    code: 200, body: {
      success: true, callConnectionId: 'connection-approve', transactionId: 'approve', status: 'initiated'
    }
  })
  assert.deepEqual(effects.calls.at(-1), {
    transactionId: 'approve', customerPhone: '+14155550199', customerName: 'Ada',
    amount: 1234.5, merchantName: 'Café', currency: 'USD'
  })
  const state = (await status('approve')).body
  assert.equal(state.found, true)
  assert.equal(state.transaction.status, 'dialing')
  assert.equal(state.transaction.merchant, 'Café')
  assert.equal(state.transaction.audioUrl, 'https://example.invalid/audio/verification.wav')
  assert.match(state.transaction.callStartedAt, /^\d{4}-\d\d-\d\dT/)
  assert.deepEqual(state.transaction.auditLog.map(({ status, message }) => ({ status, message })),
    [{ status: 'initiating', message: 'Call initiation request received' }])
})

test('amount and merchant are listed as required but currently not validated; explicit currency and merchantName win', async () => {
  assert.equal((await request('/api/calls/initiate', transaction('missing-optional', { amount: undefined, merchant: undefined }))).code, 200)
  assert.equal(effects.calls.at(-1).amount, undefined)
  assert.equal(effects.calls.at(-1).merchantName, undefined)
  await request('/api/calls/initiate', transaction('override', { merchantName: 'New', currency: 'EUR' }))
  assert.equal(effects.calls.at(-1).merchantName, 'New')
  assert.equal(effects.calls.at(-1).currency, 'EUR')
})

test('failed cloud initiation returns 500 and retains failed transaction and error', async () => {
  const response = await request('/api/calls/initiate', transaction('cloud-failure'))
  assert.deepEqual(response, { code: 500, body: { error: 'Failed to initiate call', message: 'stubbed ACS failure' } })
  const record = (await status('cloud-failure')).body.transaction
  assert.equal(record.status, 'failed')
  assert.equal(record.error, 'stubbed ACS failure')
  assert.match(record.callEndedAt, /^\d{4}-\d\d-\d\dT/)
})

test('connected callback plays stored audio, starts one-tone recognition, and updates audit/status', async () => {
  const id = 'connected-alone'
  const callId = `connection-${id}`
  const mediaStart = effects.media.length
  const recognitionStart = effects.recognitions.length
  assert.equal((await request('/api/calls/initiate', transaction(id))).code, 200)
  try {
    assert.deepEqual(await callback(id, 'CallConnected', { callConnectionId: callId }), { code: 200, body: 'OK' })
    assert.deepEqual(effects.media.slice(mediaStart).at(-1), {
      sources: [{ kind: 'fileSource', url: 'https://example.invalid/audio/verification.wav' }],
      options: { operationContext: 'verification_message' }
    })
    assert.deepEqual(effects.recognitions.slice(recognitionStart).at(-1), {
      target: { phoneNumber: '+14155550199' },
      options: {
        kind: 'callMediaRecognizeDtmfOptions', maxTonesToCollect: 1,
        interToneTimeoutInSeconds: 8, initialSilenceTimeoutInSeconds: 30,
        interruptPrompt: false, operationContext: `dtmf_menu_${id}_1`
      }
    })
    const record = (await status(id)).body.transaction
    assert.equal(record.status, 'waiting-input')
    assert.deepEqual(record.auditLog.slice(-3).map(({ message }) => message), [
      'Call connected - customer answered', 'Playing TTS verification message', 'Waiting for customer DTMF input'
    ])
  } finally {
    info.delete(callId)
    webhookHandler.recognitionAttempts.delete(callId)
    effects.media.splice(mediaStart)
    effects.recognitions.splice(recognitionStart)
  }
})

for (const [tone, expected, confirmation] of [
  ['tone1', 'approved', 'Your transaction has been approved'],
  [{ tone: 'two' }, 'rejected', 'Your transaction has been blocked'],
  ['ToneO', 'escalated', 'this call was not for you']
]) {
  test(`DTMF ${JSON.stringify(tone)} decides ${expected} and plays confirmation`, async () => {
    const id = `decision-${expected}`
    await request('/api/calls/initiate', transaction(id))
    assert.deepEqual(await callback(id, 'RecognizeCompleted', {
      callConnectionId: `connection-${id}`, recognitionType: 'dtmf', dtmfResult: { tones: [tone] }
    }), { code: 200, body: 'OK' })
    const record = (await status(id)).body.transaction
    assert.equal(record.status, expected)
    assert.equal(record.dtmfInput, expected === 'approved' ? '1' : expected === 'rejected' ? '2' : '0')
    assert.match(effects.speech.at(-1), new RegExp(confirmation))
    assert.equal(effects.media.at(-1).options.operationContext, 'confirmation_message')
    assert.equal(info.get(`connection-${id}`).status, 'confirmed')
  })
}

test('invalid DTMF re-prompts, then completion starts the second recognition attempt', async () => {
  const id = 'invalid-tone'
  await request('/api/calls/initiate', transaction(id))
  await callback(id, 'CallConnected', { callConnectionId: `connection-${id}` })
  await callback(id, 'RecognizeCompleted', {
    callConnectionId: `connection-${id}`, recognitionType: 'dtmf', dtmfResult: { tones: ['tone3'] }
  })
  assert.equal((await status(id)).body.transaction.status, 'waiting-input')
  assert.match(effects.speech.at(-1), /You pressed the 3 key, which is not a valid option/)
  assert.equal(effects.media.at(-1).options.operationContext, 'invalid_prompt_1')
  await callback(id, 'PlayCompleted', { callConnectionId: `connection-${id}`, operationContext: 'invalid_prompt_1' })
  assert.equal(effects.recognitions.at(-1).options.operationContext, 'dtmf_menu_invalid-tone_2')
})

test('recognition failure records error and hangs up; webhook acknowledges even handled errors', async () => {
  const id = 'recognition-error'
  await request('/api/calls/initiate', transaction(id))
  const beforeHangups = effects.hangups.length
  assert.equal((await callback(id, 'RecognizeFailed', {
    callConnectionId: `connection-${id}`, resultInformation: { code: 999, message: 'stubbed recognition error' }
  })).code, 200)
  const record = (await status(id)).body.transaction
  assert.equal(record.status, 'failed')
  assert.equal(record.error, '{"code":999,"message":"stubbed recognition error"}')
  assert.deepEqual(effects.hangups.slice(beforeHangups), [true])
})

test('silence recognition failure plays timeout prompt and preserves timeout status', async () => {
  const id = 'silence'
  await request('/api/calls/initiate', transaction(id))
  assert.deepEqual(await callback(id, 'RecognizeFailed', {
    callConnectionId: `connection-${id}`, resultInformation: { subCode: '8512', message: 'Initial silence' }
  }), { code: 200, body: 'OK' })
  assert.equal((await status(id)).body.transaction.status, 'timeout')
  assert.equal(effects.speech.at(-1), 'We did not receive your response. Please call us back if you have any questions. Goodbye.')
  assert.equal(effects.media.at(-1).options.operationContext, 'timeout_message')
})

test('webhook handler swallows event failures and callback still acknowledges OK', async () => {
  const original = callService.getCallConnection
  callService.getCallConnection = () => { throw new Error('stubbed media failure') }
  try {
    const id = 'play-error'
    await request('/api/calls/initiate', transaction(id))
    assert.deepEqual(await callback(id, 'PlayFailed', { callConnectionId: `connection-${id}` }),
      { code: 200, body: 'OK' })
    assert.equal((await status(id)).body.transaction.status, 'failed')
    assert.equal((await status(id)).body.transaction.auditLog.at(-1).message, 'Prompt playback failed')
  } finally {
    callService.getCallConnection = original
  }
})

test('malformed callback array member returns a 500 JSON error', async () => {
  assert.deepEqual(await request('/api/callbacks/bad-payload', [null]), {
    code: 500,
    body: { error: "Cannot read properties of null (reading 'type')" }
  })
})

test('callback array processes events in order; disconnected preserves decision and adds end time', async () => {
  const id = 'batch'
  await request('/api/calls/initiate', transaction(id))
  const result = await request(`/api/callbacks/${id}`, [
    { type: 'Microsoft.Communication.RecognizeCompleted', data: {
      callConnectionId: `connection-${id}`, recognitionType: 'dtmf', dtmfResult: { tones: ['1'] }
    } },
    { type: 'Microsoft.Communication.CallDisconnected', data: { callConnectionId: `connection-${id}` } }
  ])
  assert.deepEqual(result, { code: 200, body: 'OK' })
  const record = (await status(id)).body.transaction
  assert.equal(record.status, 'approved')
  assert.match(record.callEndedAt, /^\d{4}-\d\d-\d\dT/)
  assert.equal(record.auditLog.at(-1).message, 'Call disconnected')
})

test('legacy connection status and hangup expose cloud properties and errors', async () => {
  const id = 'legacy-alone'
  const callId = `connection-${id}`
  const hangupStart = effects.hangups.length
  assert.equal((await request('/api/calls/initiate', transaction(id))).code, 200)
  try {
    const response = await request(`/api/calls/connection/${callId}/status`, undefined, 'GET')
    assert.equal(response.code, 200)
    assert.equal(response.body.callState, 'Connected')
    assert.deepEqual(response.body.properties, { callConnectionState: 'Connected' })
    assert.deepEqual(await request(`/api/calls/${callId}/hangup`), {
      code: 200, body: { success: true, message: 'Call ended' }
    })
    assert.deepEqual(effects.hangups.slice(hangupStart), [true])
    assert.equal(info.get(callId).status, 'ended')
    callService.getCallConnection = () => { throw new Error('stubbed connection failure') }
    try {
      assert.deepEqual(await request('/api/calls/connection/bad/status', undefined, 'GET'), {
        code: 500, body: { error: 'stubbed connection failure' }
      })
      assert.deepEqual(await request('/api/calls/bad/hangup'), {
        code: 500, body: { error: 'stubbed connection failure' }
      })
    } finally {
      callService.getCallConnection = () => connection
    }
  } finally {
    info.delete(callId)
    effects.hangups.splice(hangupStart)
  }
})
