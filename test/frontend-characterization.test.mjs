import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const root = resolve(import.meta.dirname, '../frontend')
let vite
let originalBackendUrl
let CallService
let TransactionDetail
let TransactionForm
let TransactionStats
let ErrorFallback

before(async () => {
  // Middleware mode loads the real TSX and aliased imports without opening a socket,
  // loading the deployment Vite plugins, or contacting browser/external services.
  originalBackendUrl = process.env.VITE_BACKEND_URL
  delete process.env.VITE_BACKEND_URL
  vite = await createServer({
    configFile: false, root, envDir: resolve(import.meta.dirname), appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    resolve: { alias: { '@': resolve(root, 'src') } },
    esbuild: { jsx: 'automatic' },
  })
  ;({ CallService } = await vite.ssrLoadModule('/src/lib/call-service.ts'))
  ;({ TransactionDetail } = await vite.ssrLoadModule('/src/components/TransactionDetail.tsx'))
  ;({ TransactionForm } = await vite.ssrLoadModule('/src/components/TransactionForm.tsx'))
  ;({ TransactionStats } = await vite.ssrLoadModule('/src/components/TransactionStats.tsx'))
  ;({ ErrorFallback } = await vite.ssrLoadModule('/src/ErrorFallback.tsx'))
})
after(async () => {
  await vite?.close()
  if (originalBackendUrl === undefined) delete process.env.VITE_BACKEND_URL
  else process.env.VITE_BACKEND_URL = originalBackendUrl
})

const transaction = () => ({
  id: 'TX-1', customerPhone: '+971501234567', customerName: 'Ada',
  amount: 12.5, merchant: 'Café', currency: 'AED', status: 'pending',
  retryCount: 0, auditLog: [], dtmfInput: null,
  createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
})

function withNetworkAndClock(t, handler) {
  const intervals = new Map()
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    return handler(url, options)
  })
  t.mock.method(globalThis, 'setInterval', (callback, ms) => {
    const token = { callback, ms }
    intervals.set(token, token)
    return token
  })
  t.mock.method(globalThis, 'clearInterval', token => { intervals.delete(token) })
  return { requests, intervals }
}

test('call initiation sends exact JSON payload, preserves updates and reuses two-second polling', async t => {
  const { requests, intervals } = withNetworkAndClock(t, async () => ({
    ok: true, json: async () => ({ callConnectionId: 'CALL-1' }),
  }))
  const service = new CallService()
  const updates = []
  const unsubscribe = service.subscribe('TX-1', update => updates.push(update))
  assert.equal(intervals.size, 1) // subscribe starts polling before initiation
  const initialInterval = [...intervals.keys()][0]
  await service.initiateCall(transaction())
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'http://localhost:3001/api/calls/initiate')
  assert.deepEqual(requests[0].options, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionId: 'TX-1', customerPhone: '+971501234567', customerName: 'Ada',
      amount: 12.5, merchantName: 'Café', merchant: 'Café', currency: 'AED',
    }),
  })
  assert.deepEqual(updates.map(u => u.status), ['initiating', 'dialing'])
  assert.equal(updates.at(-1).auditLog.at(-1).metadata.callConnectionId, 'CALL-1')
  assert.match(updates.at(-1).callStartedAt, /^\d{4}-\d\d-\d\dT/)
  assert.equal(intervals.size, 1)
  assert.ok(intervals.has(initialInterval))
  assert.equal([...intervals.values()][0].ms, 2000)
  const replay = []
  const unsubscribeReplay = service.subscribe('TX-1', update => replay.push(update))
  assert.deepEqual(replay.map(update => update.status), ['dialing'])
  unsubscribeReplay()
  unsubscribe()
  assert.equal(intervals.size, 0)
})

test('API JSON and text errors become failed audited transactions without additional polling', async t => {
  const errors = []
  t.mock.method(console, 'error', (...args) => errors.push(args))
  for (const [body, message] of [
    ['{"message":"Unavailable"}', 'Unavailable'],
    ['{"error":"Denied"}', 'Denied'],
    ['plain text', 'plain text'],
    ['', 'Failed to initiate call'],
  ]) {
    await t.test(`body ${JSON.stringify(body)}`, async subtest => {
      const { intervals } = withNetworkAndClock(subtest, async () => ({ ok: false, text: async () => body }))
      const updates = []
      const service = new CallService()
      const unsubscribe = service.subscribe('TX-1', update => updates.push(update))
      const initialInterval = [...intervals.keys()][0]
      await service.initiateCall(transaction())
      assert.deepEqual(updates.map(u => u.status), ['initiating', 'failed'])
      assert.equal(updates.at(-1).auditLog.at(-1).message, `Failed to initiate call: ${message}`)
      assert.match(updates.at(-1).callEndedAt, /^\d{4}-\d\d-\d\dT/)
      assert.equal(intervals.size, 1)
      assert.ok(intervals.has(initialInterval))
      unsubscribe()
      assert.equal(intervals.size, 0)
    })
  }
  assert.equal(errors.length, 4)
})

test('polling merges partial states, retains local fields and stops on terminal state', async t => {
  let step = 0
  const service = new CallService()
  const updates = []
  const clock = withNetworkAndClock(t, async (url) => url.endsWith('/initiate')
    ? { ok: true, json: async () => ({ callConnectionId: 'CALL-1' }) }
    : { ok: true, json: async () => ({ transaction: step++ === 0
      ? { id: 'TX-1', status: 'connected', amount: 0, auditLog: [] }
      : { id: 'TX-1', status: 'approved', dtmfInput: '1', auditLog: [{ timestamp: '2024-01-01T00:00:02Z', status: 'approved', message: 'Approved' }] } }) })
  service.subscribe('TX-1', update => updates.push(update))
  await service.initiateCall(transaction())
  const tick = [...clock.intervals.values()][0].callback
  await tick()
  assert.equal(updates.at(-1).status, 'connected')
  assert.equal(updates.at(-1).amount, 0)
  assert.equal(updates.at(-1).merchant, 'Café')
  assert.equal(updates.at(-1).auditLog.length, 2)
  await tick()
  assert.equal(updates.at(-1).status, 'approved')
  assert.equal(updates.at(-1).dtmfInput, '1')
  assert.equal(updates.at(-1).auditLog[0].status, 'approved')
  assert.equal(clock.intervals.size, 0)
  assert.equal(clock.requests.filter(r => r.url.endsWith('/status')).length, 2)
})

test('subscription ignores non-OK and transient polling errors, then unsubscribes', async t => {
  const errors = []
  t.mock.method(console, 'error', (...args) => errors.push(args))
  let step = 0
  const { intervals } = withNetworkAndClock(t, async () => {
    if (step++ === 0) return { ok: false }
    throw new Error('offline')
  })
  const service = new CallService()
  const unsubscribe = service.subscribe('TX-1', () => { throw new Error('unexpected update') })
  const tick = [...intervals.values()][0].callback
  await tick()
  await tick()
  assert.equal(errors.length, 1)
  assert.equal(intervals.size, 1)
  unsubscribe()
  assert.equal(intervals.size, 0)
})

test('React form loading and transaction detail expose pending, retry, and completed states', () => {
  const form = renderToStaticMarkup(React.createElement(TransactionForm, { isSubmitting: true, onSubmit() {} }))
  assert.match(form, /Initiating Call\.\.\./)
  assert.match(form, /disabled=""/)
  const pending = renderToStaticMarkup(React.createElement(TransactionDetail, { transaction: transaction(), onRetry() {} }))
  assert.match(pending, /Pending/)
  assert.doesNotMatch(pending, /Retry \(0\/3\)/)
  const failed = { ...transaction(), status: 'failed', auditLog: [{ timestamp: transaction().createdAt, status: 'failed', message: 'Offline' }] }
  const detail = renderToStaticMarkup(React.createElement(TransactionDetail, { transaction: failed, onRetry() {} }))
  assert.match(detail, /Retry \(0\/3\)/)
  assert.match(detail, /Offline/)
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(TransactionDetail, { transaction: { ...failed, retryCount: 3 }, onRetry() {} })), /Retry \(3\/3\)/)
  const stats = renderToStaticMarkup(React.createElement(TransactionStats, { transactions: [transaction(), failed] }))
  assert.match(stats, /Total Calls/)
  assert.match(stats, /In Progress/)
})

test('React development error fallback rethrows the original error for the hosting boundary', () => {
  const error = new Error('<offline>')
  assert.throws(
    () => renderToStaticMarkup(React.createElement(ErrorFallback, { error, resetErrorBoundary() {} })),
    thrown => thrown === error,
  )
})
