import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { CallAutomationClient } from '../backend/node_modules/@azure/communication-call-automation/dist/esm/index.js'

// Configure a syntactically valid offline ACS client; intercept its network boundary
// before importing the service. No real credentials or endpoints are used.
process.env.ACS_CONNECTION_STRING = `endpoint=https://example.invalid/;accesskey=${Buffer.alloc(64).toString('base64')}`
process.env.ACS_PHONE_NUMBER = '+14155550100'
process.env.CALLBACK_BASE_URL = 'https://example.invalid'
process.env.AZURE_STORAGE_CONNECTION_STRING = ''
process.env.AZURE_STORAGE_ACCOUNT_NAME = ''
process.env.AZURE_TTS_ENDPOINT = ''
process.env.COGNITIVE_SERVICES_ENDPOINT = ''
process.env.AZURE_TTS_KEY = 'test-only-not-a-credential'
process.env.AZURE_TTS_REGION = 'test-region'

const originalCreateCall = CallAutomationClient.prototype.createCall
const calls = []
CallAutomationClient.prototype.createCall = async (...args) => {
  calls.push(args)
  return { callConnectionProperties: { callConnectionId: 'offline-success-connection' } }
}

const originalConsole = { log: console.log, warn: console.warn, error: console.error }
console.log = () => {}
console.warn = () => {}
console.error = () => {}

try {
  const { callService } = await import('../backend/services/call-service.js')
  const { ttsService } = await import('../backend/services/tts-service.js')
  const { storageService } = await import('../backend/services/storage-service.js')
  const originalSynthesize = ttsService.synthesizeToAudio
  const spoken = []
  const audio = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0xff])
  // Only the speech provider is replaced: production formatting, upload,
  // ACS invitation, and active-call state all execute unchanged.
  ttsService.synthesizeToAudio = async (text) => {
    spoken.push(text)
    return audio.buffer
  }

  test('real initiation formats speech, stores audio locally and creates an offline ACS call', async () => {
    let audioPath
    try {
      const result = await callService.initiateCall({
        transactionId: 'offline-success', customerPhone: '+14155550199',
        customerName: 'Ada', amount: 1234.5, merchantName: 'Café'
      })
      assert.deepEqual(spoken, [
        "Hello Ada. This is an automated call from your bank's fraud prevention system. We detected a transaction of $1,234.50 at Café. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0. Please make your selection now."
      ])
      assert.match(result.audioUrl, /^https:\/\/example\.invalid\/audio\/verification_offline-success_[\da-f-]+\.wav$/)
      audioPath = fileURLToPath(new URL(`../backend/audio/${result.audioUrl.split('/').at(-1)}`, import.meta.url))
      assert.deepEqual(await readFile(audioPath), Buffer.from(audio))
      assert.deepEqual(calls, [[
        {
          targetParticipant: { phoneNumber: '+14155550199' },
          sourceCallIdNumber: { phoneNumber: '+14155550100' }
        },
        'https://example.invalid/api/callbacks/offline-success',
        { operationContext: 'offline-success', callIntelligenceOptions: { cognitiveServicesEndpoint: '' } }
      ]])
      assert.deepEqual(result, {
        callConnectionId: 'offline-success-connection', transactionId: 'offline-success',
        audioUrl: result.audioUrl, status: 'initiated', currency: 'USD'
      })
      const stored = callService.getCallInfo('offline-success-connection')
      assert.deepEqual(stored, {
        transactionId: 'offline-success', customerPhone: '+14155550199', customerName: 'Ada',
        amount: 1234.5, merchantName: 'Café', currency: 'USD',
        audioUrl: result.audioUrl, status: 'initiated',
        callConnectionId: 'offline-success-connection', startTime: stored.startTime
      })
      assert.match(stored.startTime, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/)
    } finally {
      callService.removeCall('offline-success-connection')
      if (audioPath) await unlink(audioPath)
    }
  })

  after(() => {
    ttsService.synthesizeToAudio = originalSynthesize
    CallAutomationClient.prototype.createCall = originalCreateCall
    Object.assign(console, originalConsole)
  })
} catch (error) {
  CallAutomationClient.prototype.createCall = originalCreateCall
  Object.assign(console, originalConsole)
  throw error
}
