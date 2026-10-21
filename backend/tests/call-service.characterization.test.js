import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

// A complete offline ACS boundary: the real service builds the arguments, the fake
// client records them. No credential or network connection can leave this process.
for (const key of ['ACS_CONNECTION_STRING', 'ACS_PHONE_NUMBER', 'CALLBACK_BASE_URL',
  'AZURE_TTS_ENDPOINT', 'COGNITIVE_SERVICES_ENDPOINT']) delete process.env[key]
process.env.ACS_CONNECTION_STRING = 'offline-fixture'
process.env.ACS_PHONE_NUMBER = '+15550000000'
process.env.CALLBACK_BASE_URL = 'https://callback.example.invalid'
process.env.AZURE_TTS_ENDPOINT = 'https://speech.example.invalid'

const calls = []
globalThis.__offlineCalls = calls
const sources = new Map([
  [import.meta.resolve('@azure/communication-call-automation'), `
    export class CallAutomationClient {
      constructor(value) { globalThis.__offlineCalls.push(['constructor', value]) }
      async createCall(...args) {
        globalThis.__offlineCalls.push(['createCall', ...args])
        return { callConnectionProperties: { callConnectionId: 'conn-offline' } }
      }
      getCallConnection(id) {
        globalThis.__offlineCalls.push(['getCallConnection', id])
        return {
          getCallConnectionProperties: async () => ({ callConnectionState: 'connected' }),
          hangUp: async (forEveryone) => globalThis.__offlineCalls.push(['hangUp', forEveryone])
        }
      }
    }
  `],
  [new URL('../services/tts-service.js', import.meta.url).href, `
    export const ttsService = {
      synthesizeToAudio: async (message) => {
        globalThis.__offlineCalls.push(['synthesizeToAudio', message])
        return Buffer.from('offline audio')
      }
    }
  `],
  [new URL('../services/storage-service.js', import.meta.url).href, `
    export const storageService = {
      saveAudioFile: async (audio, name) => {
        globalThis.__offlineCalls.push(['saveAudioFile', audio.toString(), name])
        return 'https://audio.example.invalid/' + name
      }
    }
  `],
  [import.meta.resolve('dotenv'), 'export default { config: () => ({ parsed: {} }) }']
])
registerHooks({
  load(url, context, nextLoad) {
    if (sources.has(url)) return { format: 'module', shortCircuit: true, source: sources.get(url) }
    return nextLoad(url, context)
  }
})
const { callService } = await import('../services/call-service.js')

test('verification and confirmation speech preserve currency formatting and fallback merchant', () => {
  assert.equal(callService.generateVerificationMessage({
    customerName: 'Zoë', amount: 1234.5, merchantName: 'Café', currency: 'EUR'
  }), "Hello Zoë. This is an automated call from your bank's fraud prevention system. We detected a transaction of €1,234.50 at Café. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0. Please make your selection now.")
  assert.match(callService.generateVerificationMessage({
    customerName: 'A', amount: 0
  }), /transaction of \$0\.00 at the merchant\./)
  assert.deepEqual(['1', '2', '0', '?'].map(value => callService.generateConfirmationMessage(value)), [
    'Thank you. Your transaction has been approved. Have a great day.',
    'Thank you for alerting us. Your transaction has been blocked and our fraud team will contact you shortly.',
    'We apologize for the inconvenience. We have noted that this call was not for you. Goodbye.',
    'Invalid input. Goodbye.'
  ])
})

test('call initiation sends synthesized message, saved audio and exact offline ACS invitation/options', async () => {
  const result = await callService.initiateCall({
    transactionId: 'tx-1', customerPhone: '+15551234567', customerName: 'A',
    amount: 12.3, merchantName: 'Shop', currency: 'USD'
  })
  assert.deepEqual(result, {
    callConnectionId: 'conn-offline', transactionId: 'tx-1',
    audioUrl: 'https://audio.example.invalid/verification_tx-1',
    status: 'initiated', currency: 'USD'
  })
  assert.deepEqual(calls[0], ['constructor', 'offline-fixture'])
  assert.match(calls[1][1], /transaction of \$12\.30 at Shop\./)
  assert.deepEqual(calls[2], ['saveAudioFile', 'offline audio', 'verification_tx-1'])
  assert.deepEqual(calls[3], ['createCall',
    { targetParticipant: { phoneNumber: '+15551234567' }, sourceCallIdNumber: { phoneNumber: '+15550000000' } },
    'https://callback.example.invalid/api/callbacks/tx-1',
    { operationContext: 'tx-1', callIntelligenceOptions: { cognitiveServicesEndpoint: 'https://speech.example.invalid' } }
  ])
  const status = await callService.getCallStatus('conn-offline')
  assert.equal(status.callState, 'connected')
  assert.equal(status.localInfo.audioUrl, result.audioUrl)
  assert.equal(status.localInfo.customerPhone, '+15551234567')
  await callService.hangupCall('conn-offline')
  assert.deepEqual(calls.slice(-3).map(call => call[0]), ['getCallConnection', 'getCallConnection', 'hangUp'])
  assert.deepEqual(calls.at(-1), ['hangUp', true])
  assert.equal(callService.getCallInfo('conn-offline').status, 'ended')
})

test('invalid phone fails before speech, storage and ACS calls', async () => {
  const initialCount = calls.length
  await assert.rejects(callService.initiateCall({
    transactionId: 'bad', customerPhone: '15551234567', customerName: 'A',
    amount: 12, merchantName: 'Shop'
  }), /Customer phone number must be in E\.164 format/)
  assert.equal(calls.length, initialCount)
})
