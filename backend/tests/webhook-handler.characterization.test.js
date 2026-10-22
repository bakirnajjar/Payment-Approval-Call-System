import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

// Import the real handler without initializing the ACS, speech, or storage singletons.
// The normalization tests never need those services (or their network credentials).
const dependencies = new Map([
  [new URL('../services/call-service.js', import.meta.url).href, 'callService'],
  [new URL('../services/tts-service.js', import.meta.url).href, 'ttsService'],
  [new URL('../services/storage-service.js', import.meta.url).href, 'storageService']
])

registerHooks({
  load(url, context, nextLoad) {
    const name = dependencies.get(url)
    if (name) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `export const ${name} = Object.freeze({})`
      }
    }
    return nextLoad(url, context)
  }
})

const { webhookHandler } = await import('../services/webhook-handler.js')

test('normalizes current DTMF digit aliases and SDK tone objects', () => {
  for (const [raw, expected] of [
    ['1', '1'], ['TONE1', '1'], ['One', '1'],
    ['2', '2'], ['Tone2', '2'], ['TWO', '2'],
    ['0', '0'], ['Tone0', '0'], ['ZERO', '0'], ['ToneO', '0'],
    [{ tone: 'Tone1' }, '1'], [{ tone: 'two' }, '2'],
    [{ tone: 'TONEO' }, '0'], [{ tone: 1 }, '1']
  ]) {
    assert.equal(webhookHandler.normalizeTone(raw), expected, JSON.stringify(raw))
  }
})

test('normalizes star and pound aliases without changing their symbols', () => {
  for (const [raw, expected] of [
    ['*', '*'], ['TONE*', '*'], ['Asterisk', '*'], ['STAR', '*'],
    ['#', '#'], ['Tone#', '#'], ['HASH', '#'], ['Pound', '#'],
    [{ tone: '*' }, '*'], [{ tone: 'Pound' }, '#']
  ]) {
    assert.equal(webhookHandler.normalizeTone(raw), expected, JSON.stringify(raw))
  }
})

test('leaves unsupported, blank, and differently shaped inputs unrecognized', () => {
  for (const raw of [undefined, null, '', '3', ' tone1 ', 1, { dtmfTone: '1' }]) {
    assert.equal(webhookHandler.normalizeTone(raw), undefined, JSON.stringify(raw))
  }
})
