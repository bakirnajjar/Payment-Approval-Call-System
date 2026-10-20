import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const actions = []
globalThis.__offlineMediaActions = actions
const dependencies = new Map([
  [new URL('../services/call-service.js', import.meta.url).href, `
    export const callService = {
      getCallInfo: () => undefined,
      updateCallStatus: (...args) => globalThis.__offlineMediaActions.push(['updateCallStatus', ...args]),
      getCallConnection: (id) => {
        globalThis.__offlineMediaActions.push(['getCallConnection', id])
        return { getCallMedia: () => ({
          cancelAllMediaOperations: async () => globalThis.__offlineMediaActions.push(['cancelAllMediaOperations']),
          playToAll: async (...args) => globalThis.__offlineMediaActions.push(['playToAll', ...args]),
          startRecognizing: async (...args) => globalThis.__offlineMediaActions.push(['startRecognizing', ...args])
        }) }
      },
      generateConfirmationMessage: digit => 'Confirmation ' + digit,
      hangupCall: async id => globalThis.__offlineMediaActions.push(['hangupCall', id]),
      removeCall: id => globalThis.__offlineMediaActions.push(['removeCall', id])
    }
  `],
  [new URL('../services/tts-service.js', import.meta.url).href, `
    export const ttsService = { synthesizeToAudio: async text => {
      globalThis.__offlineMediaActions.push(['synthesizeToAudio', text])
      return Buffer.from('audio')
    } }
  `],
  [new URL('../services/storage-service.js', import.meta.url).href, `
    export const storageService = { saveAudioFile: async (buffer, name) => {
      globalThis.__offlineMediaActions.push(['saveAudioFile', buffer.toString(), name])
      return 'https://audio.example.invalid/' + name
    } }
  `]
])
registerHooks({
  load(url, context, nextLoad) {
    if (dependencies.has(url)) {
      return { format: 'module', shortCircuit: true, source: dependencies.get(url) }
    }
    return nextLoad(url, context)
  }
})
const { webhookHandler } = await import('../services/webhook-handler.js')

test('connected callback plays stored audio and starts ACS DTMF recognition with current options', async () => {
  const updates = []
  webhookHandler.setTransactionGetter(() => ({
    audioUrl: 'https://audio.example.invalid/verification',
    customerPhone: '+15551234567', customerName: 'A'
  }))
  await webhookHandler.handleEvent({
    type: 'Microsoft.Communication.CallConnected',
    data: { callConnectionId: 'media-1' }
  }, 'tx-media', (id, change) => updates.push([id, change]))
  assert.deepEqual(actions.find(action => action[0] === 'playToAll'), [
    'playToAll', [{ kind: 'fileSource', url: 'https://audio.example.invalid/verification' }],
    { operationContext: 'verification_message' }
  ])
  assert.deepEqual(actions.find(action => action[0] === 'startRecognizing'), [
    'startRecognizing', { phoneNumber: '+15551234567' },
    {
      kind: 'callMediaRecognizeDtmfOptions',
      maxTonesToCollect: 1,
      interToneTimeoutInSeconds: 8,
      initialSilenceTimeoutInSeconds: 30,
      interruptPrompt: false,
      operationContext: 'dtmf_menu_tx-media_1'
    }
  ])
  assert.ok(actions.find(action => action[0] === 'cancelAllMediaOperations'))
  assert.deepEqual(updates.map(([, change]) => change.status),
    ['connected', 'playing-message', 'waiting-input'])
})

test('invalid DTMF variant speaks a keyed retry and retries recognition on prompt completion', async () => {
  actions.length = 0
  const updates = []
  const update = (id, change) => updates.push(change)
  await webhookHandler.handleEvent({
    type: 'Microsoft.Communication.RecognizeCompleted',
    data: { callConnectionId: 'media-1', recognitionType: 'dtmf', dtmfResult: { tones: [{ tone: 'Tone3' }] } }
  }, 'tx-media', update)
  assert.deepEqual(actions.find(action => action[0] === 'synthesizeToAudio'), [
    'synthesizeToAudio',
    'You pressed the 3 key, which is not a valid option. Press 1 to approve the transaction, press 2 to decline it, or press 0 if this was not you.'
  ])
  assert.deepEqual(actions.find(action => action[0] === 'saveAudioFile'),
    ['saveAudioFile', 'audio', 'invalid_tx-media_1'])
  assert.deepEqual(actions.find(action => action[0] === 'playToAll'), [
    'playToAll', [{ kind: 'fileSource', url: 'https://audio.example.invalid/invalid_tx-media_1' }],
    { operationContext: 'invalid_prompt_1' }
  ])
  assert.equal(updates.at(-1).status, 'waiting-input')
  actions.length = 0
  await webhookHandler.handleEvent({
    type: 'Microsoft.Communication.PlayCompleted',
    data: { callConnectionId: 'media-1', operationContext: 'invalid_prompt_1' }
  }, 'tx-media', update)
  assert.equal(actions.find(action => action[0] === 'startRecognizing')[2].operationContext,
    'dtmf_menu_tx-media_2')
  assert.equal(updates.at(-1).message, 'Re-prompting customer (attempt 2 of 3)')
})
