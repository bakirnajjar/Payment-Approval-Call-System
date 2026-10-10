import assert from 'node:assert/strict'
import { test } from 'node:test'

// The handler imports SDK-backed services at module load. Keep initialization offline,
// even if a developer's shell happens to contain live Azure credentials.
const offlineKeys = [
  'ACS_CONNECTION_STRING', 'ACS_PHONE_NUMBER',
  'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_ACCOUNT_NAME',
  'AZURE_TTS_KEY', 'AZURE_SPEECH_KEY', 'AZURE_TTS_REGION',
  'AZURE_SPEECH_REGION', 'AZURE_TTS_ENDPOINT', 'COGNITIVE_SERVICES_ENDPOINT'
]
const original = new Map(offlineKeys.map(key => [key, process.env[key]]))
// Empty strings also prevent dotenv from filling these keys from a local .env file.
for (const key of offlineKeys) process.env[key] = ''
process.env.AZURE_TTS_KEY = 'offline-test-only'
process.env.AZURE_TTS_REGION = 'westus'

let webhookHandler
try {
  ;({ webhookHandler } = await import('../services/webhook-handler.js'))
} finally {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test('DTMF normalization accepts existing textual and SDK tone aliases', () => {
  for (const [input, expected] of [
    ['1', '1'], ['TONE1', '1'], ['One', '1'],
    [{ tone: '2' }, '2'], [{ tone: 'TWO' }, '2'],
    ['toneO', '0'], ['Zero', '0'],
    ['ASTERISK', '*'], [{ tone: 'star' }, '*'],
    ['HASH', '#'], [{ tone: 'pound' }, '#']
  ]) {
    assert.equal(webhookHandler.normalizeTone(input), expected)
  }
})

test('DTMF normalization does not coerce other payload shapes or trim input', () => {
  for (const input of [undefined, null, 1, ' 1 ', '3', '', { dtmfTone: '1' }, { tone: null }]) {
    assert.equal(webhookHandler.normalizeTone(input), undefined)
  }
})
