import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { test } from 'node:test'

// All SDK-backed singletons initialize at import time. Never read local .env
// credentials or let a test create a real Azure client.
const azureKeys = [
  'ACS_CONNECTION_STRING', 'ACS_PHONE_NUMBER', 'CALLBACK_BASE_URL',
  'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_ACCOUNT_NAME',
  'AZURE_TTS_KEY', 'AZURE_SPEECH_KEY', 'AZURE_TTS_REGION',
  'AZURE_SPEECH_REGION', 'AZURE_TTS_ENDPOINT', 'COGNITIVE_SERVICES_ENDPOINT'
]
const previous = new Map(azureKeys.map(key => [key, process.env[key]]))
for (const key of azureKeys) process.env[key] = ''
process.env.AZURE_TTS_KEY = 'offline-test-only'
process.env.AZURE_TTS_REGION = 'westus'
let callService, storageService, ttsService, webhookHandler
try {
  ;({ callService } = await import('../services/call-service.js'))
  ;({ storageService } = await import('../services/storage-service.js'))
  ;({ ttsService } = await import('../services/tts-service.js'))
  ;({ webhookHandler } = await import('../services/webhook-handler.js'))
} finally {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test('unconfigured ACS fails before synthesis or a phone call and reports offline health', async () => {
  assert.equal(callService.getHealthStatus().acsConfigured, false)
  assert.equal(callService.getHealthStatus().clientInitialized, false)
  assert.deepEqual(await callService.testConnectivity(), { success: false, error: 'ACS client not initialized' })
  const originalSynthesize = ttsService.synthesizeToAudio
  ttsService.synthesizeToAudio = () => { throw new Error('Unexpected Azure synthesis') }
  try {
    await assert.rejects(callService.initiateCall({
      transactionId: 'offline', customerPhone: '+14155550123',
      customerName: 'Ada', amount: 12, merchantName: 'Market'
    }), { message: 'ACS Call Automation Client not initialized. Please check your ACS configuration.' })
  } finally {
    ttsService.synthesizeToAudio = originalSynthesize
  }
  assert.equal(callService.generateVerificationMessage({
    customerName: 'Ada', amount: 12.5, merchantName: '', currency: 'USD'
  }), "Hello Ada. This is an automated call from your bank's fraud prevention system. We detected a transaction of $12.50 at the merchant. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0. Please make your selection now.")
  assert.equal(callService.generateConfirmationMessage('2'),
    'Thank you for alerting us. Your transaction has been blocked and our fraud team will contact you shortly.')
})

test('blob upload failure falls back to byte-identical local WAV and URL', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'acs-audio-characterization-'))
  const originalDirectory = storageService.audioDir
  const originalClient = storageService.blobServiceClient
  const originalUpload = storageService.uploadToBlobStorage
  storageService.audioDir = directory
  storageService.blobServiceClient = { offlineOnly: true }
  storageService.uploadToBlobStorage = async () => { throw new Error('offline upload rejected') }
  try {
    const audio = Buffer.from([0, 127, 255, 10])
    const url = await storageService.saveAudioFile(audio, 'verification_offline')
    assert.match(url, new RegExp(`^http://localhost:${process.env.PORT || 3001}/audio/verification_offline_[0-9a-f-]+\\.wav$`))
    assert.deepEqual(readFileSync(join(directory, basename(new URL(url).pathname))), audio)
  } finally {
    storageService.audioDir = originalDirectory
    storageService.blobServiceClient = originalClient
    storageService.uploadToBlobStorage = originalUpload
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Blob adapter uploads WAV bytes with public audio content type', async () => {
  const originalClient = storageService.blobServiceClient
  const originalContainer = storageService.containerName
  const uploads = []
  storageService.containerName = 'audio-files'
  storageService.blobServiceClient = {
    getContainerClient(name) {
      assert.equal(name, 'audio-files')
      return {
        getBlockBlobClient(filename) {
          assert.match(filename, /^verification_[0-9a-f-]+\.wav$/)
          return {
            url: `https://example.invalid/audio-files/${filename}`,
            async upload(...args) { uploads.push(args) }
          }
        }
      }
    }
  }
  try {
    const audio = Buffer.from([0, 127, 255, 10])
    const url = await storageService.uploadToBlobStorage(audio, 'verification')
    assert.match(url, /^https:\/\/example\.invalid\/audio-files\/verification_[0-9a-f-]+\.wav$/)
    assert.equal(uploads.length, 1)
    assert.deepEqual(uploads[0], [audio, audio.length, {
      blobHTTPHeaders: { blobContentType: 'audio/wav' }
    }])
  } finally {
    storageService.blobServiceClient = originalClient
    storageService.containerName = originalContainer
  }
})

test('call media adapter cancels playback and starts one-tone DTMF recognition', async () => {
  const originalConnection = callService.getCallConnection
  const operations = []
  callService.getCallConnection = id => {
    assert.equal(id, 'media-call')
    return {
      getCallMedia: () => ({
        async cancelAllMediaOperations() { operations.push('cancel') },
        async playToAll(...args) { operations.push(['play', ...args]) },
        async startRecognizing(...args) { operations.push(['recognize', ...args]) }
      })
    }
  }
  const updates = []
  try {
    const source = { kind: 'fileSource', url: 'https://example.invalid/verification.wav' }
    await webhookHandler.safePlayPrompt('media-call', source, 'verification_message')
    await webhookHandler.startDtmfRecognition('media-call', 'media-transaction', '+14155550123',
      (id, update) => updates.push([id, update]))
    assert.deepEqual(operations, [
      'cancel',
      ['play', [source], { operationContext: 'verification_message' }],
      ['recognize', { phoneNumber: '+14155550123' }, {
        kind: 'callMediaRecognizeDtmfOptions',
        maxTonesToCollect: 1,
        interToneTimeoutInSeconds: 8,
        initialSilenceTimeoutInSeconds: 30,
        interruptPrompt: false,
        operationContext: 'dtmf_menu_media-transaction_1'
      }]
    ])
    assert.deepEqual(updates, [['media-transaction', {
      status: 'waiting-input', message: 'Waiting for customer DTMF input'
    }]])
    assert.equal(webhookHandler.recognitionAttempts.get('media-call'), 1)
  } finally {
    callService.getCallConnection = originalConnection
    webhookHandler.recognitionAttempts.delete('media-call')
  }
})

test('connected event falls back to stored audio and phone when in-memory call info is missing', async () => {
  const originals = {
    updateCallStatus: callService.updateCallStatus,
    getCallConnection: callService.getCallConnection,
    getCallInfo: callService.getCallInfo,
    safePlayPrompt: webhookHandler.safePlayPrompt,
    startDtmfRecognition: webhookHandler.startDtmfRecognition,
    getTransaction: webhookHandler.getTransaction
  }
  const statuses = []
  const changes = []
  const media = []
  callService.updateCallStatus = (...args) => { statuses.push(args) }
  callService.getCallConnection = () => ({ offlineOnly: true })
  callService.getCallInfo = () => undefined
  webhookHandler.safePlayPrompt = async (...args) => { media.push(args) }
  webhookHandler.startDtmfRecognition = async (...args) => { media.push(args) }
  webhookHandler.setTransactionGetter(() => ({
    audioUrl: 'https://example.invalid/audio.wav',
    customerPhone: '+14155550123', customerName: 'Ada', merchant: 'Market'
  }))
  webhookHandler.recognitionAttempts.set('connected-call', 2)
  try {
    await webhookHandler.handleEvent({
      type: 'Microsoft.Communication.CallConnected',
      data: { callConnectionId: 'connected-call' }
    }, 'stored-transaction', (id, change) => changes.push([id, change]))
    assert.deepEqual(statuses, [
      ['connected-call', 'connected'],
      ['connected-call', 'playing_message']
    ])
    assert.deepEqual(changes, [
      ['stored-transaction', { status: 'connected', message: 'Call connected - customer answered' }],
      ['stored-transaction', { status: 'playing-message', message: 'Playing TTS verification message' }]
    ])
    assert.deepEqual(media[0],
      ['connected-call', { kind: 'fileSource', url: 'https://example.invalid/audio.wav' }, 'verification_message'])
    assert.deepEqual(media[1].slice(0, 3), ['connected-call', 'stored-transaction', '+14155550123'])
    assert.equal(typeof media[1][3], 'function')
    assert.equal(media.length, 2)
    assert.equal(webhookHandler.recognitionAttempts.has('connected-call'), false)
  } finally {
    callService.updateCallStatus = originals.updateCallStatus
    callService.getCallConnection = originals.getCallConnection
    callService.getCallInfo = originals.getCallInfo
    webhookHandler.safePlayPrompt = originals.safePlayPrompt
    webhookHandler.startDtmfRecognition = originals.startDtmfRecognition
    webhookHandler.getTransaction = originals.getTransaction
    webhookHandler.recognitionAttempts.delete('connected-call')
  }
})

test('DTMF events map 1/2/0 to state and confirmation, and internal errors are acknowledged', async () => {
  const originalStatus = callService.updateCallStatus
  const originalConfirmation = webhookHandler.playConfirmation
  const statuses = []
  const confirmations = []
  const updates = []
  callService.updateCallStatus = (...args) => { statuses.push(args) }
  webhookHandler.playConfirmation = async (...args) => { confirmations.push(args) }
  webhookHandler.recognitionAttempts.set('offline-connection', 1)
  try {
    for (const [tone, status] of [['TONE1', 'approved'], [{ tone: 'Two' }, 'rejected'], ['toneO', 'escalated']]) {
      await webhookHandler.handleEvent({
        type: 'Microsoft.Communication.RecognizeCompleted',
        data: { callConnectionId: 'offline-connection', recognitionType: 'dtmf', dtmfResult: { tones: [tone] } }
      }, 'offline-transaction', (id, change) => updates.push([id, change]))
      assert.deepEqual(updates.at(-1), ['offline-transaction', {
        status, dtmfInput: tone === 'TONE1' ? '1' : tone === 'toneO' ? '0' : '2',
        message: `Customer selected option ${tone === 'TONE1' ? '1' : tone === 'toneO' ? '0' : '2'}`
      }])
    }
    assert.deepEqual(statuses, [
      ['offline-connection', 'processing', { dtmfInput: '1' }],
      ['offline-connection', 'processing', { dtmfInput: '2' }],
      ['offline-connection', 'processing', { dtmfInput: '0' }]
    ])
    assert.deepEqual(confirmations, [
      ['offline-connection', 'offline-transaction', '1'],
      ['offline-connection', 'offline-transaction', '2'],
      ['offline-connection', 'offline-transaction', '0']
    ])
    // handleEvent catches downstream handler failures instead of propagating
    // them to the HTTP acknowledgement; it must not append an audit update.
    callService.updateCallStatus = () => { throw new Error('offline downstream failure') }
    await webhookHandler.handleEvent({
      type: 'Microsoft.Communication.RecognizeCompleted',
      data: { callConnectionId: 'offline-connection', recognitionType: 'dtmf', dtmfResult: { tones: ['1'] } }
    }, 'offline-transaction', (id, change) => updates.push([id, change]))
    assert.equal(updates.length, 3)
  } finally {
    callService.updateCallStatus = originalStatus
    webhookHandler.playConfirmation = originalConfirmation
    webhookHandler.recognitionAttempts.delete('offline-connection')
  }
})

test('recognition failures classify no-input and call-not-found without contacting ACS', async () => {
  assert.equal(webhookHandler.shouldTreatAsNoInput({ subCode: '8512' }), true)
  assert.equal(webhookHandler.shouldTreatAsNoInput({ message: 'Initial Silence timeout' }), true)
  assert.equal(webhookHandler.shouldTreatAsNoInput({ message: 'Other failure' }), false)
  assert.equal(webhookHandler.isCallNotFoundError({ statusCode: 404 }), true)
  assert.equal(webhookHandler.isCallNotFoundError({ code: 'CallNotActive' }), true)
  const originalHangup = callService.hangupCall
  const updates = []
  callService.hangupCall = async () => {}
  try {
    await webhookHandler.handleEvent({
      type: 'Microsoft.Communication.RecognizeFailed',
      data: { callConnectionId: 'missing-call', resultInformation: { code: 500, message: 'Recognition rejected' } }
    }, 'offline-transaction', (id, change) => updates.push([id, change]))
    assert.deepEqual(updates, [['offline-transaction', {
      status: 'failed', message: 'Recognition rejected',
      error: '{"code":500,"message":"Recognition rejected"}'
    }]])
  } finally {
    callService.hangupCall = originalHangup
  }
})
