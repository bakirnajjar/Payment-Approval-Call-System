import { registerHooks } from 'node:module'

// This process never imports an Azure, speech, or storage implementation.
const modules = new Map([
  [new URL('../../services/call-service.js', import.meta.url).href, `
    import assert from 'node:assert/strict'
    export const callService = {
      getHealthStatus: () => ({ acsConfigured: false, clientInitialized: false, activeCalls: 0 }),
      testConnectivity: async () => ({ success: false, error: 'ACS client not initialized' }),
      initiateCall: async (request) => {
        if (request.transactionId === 'failure') throw new Error('offline call failure')
        if (request.transactionId === 'defaults') {
          assert.deepEqual(request, {
            transactionId: 'defaults', customerPhone: '+123', customerName: 'A',
            amount: undefined, merchantName: undefined, currency: 'USD'
          })
        }
        if (request.transactionId === 'alias') {
          assert.deepEqual(request, {
            transactionId: 'alias', customerPhone: '+1999', customerName: 'Zoë',
            amount: 123.45, merchantName: 'Old label', currency: 'EUR'
          })
        }
        return { callConnectionId: 'offline-connection', audioUrl: 'https://example.invalid/audio.wav' }
      },
      getCallStatus: async (id) => ({ callConnectionId: id, callState: 'offline' }),
      hangupCall: async () => {},
      updateCallStatus: () => {},
      getCallInfo: () => undefined,
      getCallConnection: () => ({
        getCallMedia: () => ({
          cancelAllMediaOperations: async () => {},
          playToAll: async () => {},
          startRecognizing: async () => {}
        })
      }),
      generateConfirmationMessage: (digit) => 'Confirmation ' + digit,
      removeCall: () => {}
    }
  `],
  [new URL('../../services/tts-service.js', import.meta.url).href,
    'export const ttsService = { synthesizeToAudio: async () => Buffer.from("offline") }'],
  [new URL('../../services/storage-service.js', import.meta.url).href,
    'export const storageService = { saveAudioFile: async () => "https://example.invalid/audio.wav" }'],
  [import.meta.resolve('dotenv'),
    'export default { config: () => ({ parsed: {} }) }']
])

registerHooks({
  load(url, context, nextLoad) {
    if (modules.has(url)) {
      return { format: 'module', shortCircuit: true, source: modules.get(url) }
    }
    return nextLoad(url, context)
  }
})

await import('../../server.js')
