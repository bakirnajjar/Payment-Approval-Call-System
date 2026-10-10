import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../src/lib/types'
import type { CallService } from '../src/lib/call-service'

const timestamp = '2025-01-02T03:04:05.000Z'
const base: Transaction = {
  id: 'TXN-123',
  amount: 12.5,
  currency: 'AED',
  merchant: 'Corner Shop',
  customerName: 'Alex',
  customerPhone: '+971501234567',
  status: 'pending',
  dtmfInput: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  retryCount: 0,
  auditLog: [],
}

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
  text: async () => JSON.stringify(body),
}) as Response

describe('existing call-service observable behavior (offline)', () => {
  let service: CallService
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(timestamp))
    vi.stubEnv('VITE_BACKEND_URL', '')
    vi.resetModules()
    service = new (await import('../src/lib/call-service')).CallService()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('posts the existing request shape to the default URL, adds dialing audit and polls every 2 seconds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ callConnectionId: 'call-1' }))
      .mockResolvedValueOnce(jsonResponse({ transaction: { id: base.id, status: 'connected' } }))
    const updates = vi.fn()
    const unsubscribe = service.subscribe(base.id, updates)
    await service.initiateCall(base)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/calls/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: 'TXN-123',
        customerPhone: '+971501234567',
        customerName: 'Alex',
        amount: 12.5,
        merchantName: 'Corner Shop',
        merchant: 'Corner Shop',
        currency: 'AED',
      }),
    })
    expect(updates.mock.calls.map(([value]: [Transaction]) => value.status)).toEqual(['initiating', 'dialing'])
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      callStartedAt: timestamp,
      auditLog: [
        { timestamp, status: 'initiating', message: 'Sending request to backend API' },
        { timestamp, status: 'dialing', message: 'Real call initiated via ACS. Call ID: call-1', metadata: { callConnectionId: 'call-1' } },
      ],
    })
    // The connection ID is recorded in audit metadata, not copied into the transaction.
    expect(updates.mock.lastCall?.[0].callConnectionId).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3001/api/calls/TXN-123/status')
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      status: 'connected', amount: 12.5, currency: 'AED', merchant: 'Corner Shop',
    })
    unsubscribe()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('defaults sparse backend state and replays the cached state to a later subscriber', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ transaction: {
      id: base.id, status: 'waiting-input', merchantName: 'Backend Shop',
    } }))
    const first = vi.fn()
    const unsubscribe = service.subscribe(base.id, first)
    await vi.advanceTimersByTimeAsync(2000)
    expect(first).toHaveBeenCalledWith({
      id: base.id,
      status: 'waiting-input',
      merchantName: 'Backend Shop',
      merchant: 'Backend Shop',
      currency: 'USD',
      retryCount: 0,
      auditLog: [],
      dtmfInput: null,
    })
    const replay = vi.fn()
    const stop = service.subscribe(base.id, replay)
    expect(replay).toHaveBeenCalledWith(first.mock.lastCall?.[0])
    unsubscribe()
    stop()
  })

  it('keeps existing fields for sparse polling updates but accepts zero, null and replacement audit', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ callConnectionId: 'call-2' }))
      .mockResolvedValueOnce(jsonResponse({ transaction: {
        id: base.id, status: 'waiting-input', amount: 0, currency: '',
        merchant: '', customerName: '', dtmfInput: '1', auditLog: [],
      } }))
      .mockResolvedValueOnce(jsonResponse({ transaction: {
        id: base.id, status: 'approved', dtmfInput: null,
        auditLog: [{ timestamp, status: 'approved', message: 'Backend approved' }],
      } }))
    const updates = vi.fn()
    const stop = service.subscribe(base.id, updates)
    await service.initiateCall(base)
    await vi.advanceTimersByTimeAsync(2000)
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      amount: 0, currency: 'AED', merchant: 'Corner Shop', customerName: 'Alex',
      dtmfInput: '1', status: 'waiting-input',
    })
    expect(updates.mock.lastCall?.[0].auditLog).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      status: 'approved', dtmfInput: null,
      auditLog: [{ timestamp, status: 'approved', message: 'Backend approved' }],
    })
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    stop()
  })

  it.each(['approved', 'rejected', 'escalated', 'timeout', 'no-answer', 'failed'] as const)(
    'stops polling on final state %s', async (status) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ transaction: { id: base.id, status } }))
      const stop = service.subscribe(base.id, vi.fn())
      await vi.advanceTimersByTimeAsync(6000)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      stop()
    },
  )

  it.each([
    [{ message: 'Cannot dial', error: 'ignored' }, 'Cannot dial'],
    [{ error: 'Denied' }, 'Denied'],
    [{}, 'Failed to initiate call'],
  ])('records a failed call from the backend JSON error %j', async (body, message) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(body, false))
    const updates = vi.fn()
    const stop = service.subscribe(base.id, updates)
    await service.initiateCall(base)
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      status: 'failed',
      callEndedAt: timestamp,
      auditLog: [
        { status: 'failed', message: `Failed to initiate call: ${message}` },
      ],
    })
    // The failure path rebuilds the audit log from the original input.
    expect(updates.mock.calls[0][0].auditLog).toHaveLength(1)
    expect(console.error).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(4000)
    // An interval started by subscribe continues even after an initiate failure.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    stop()
  })

  it('uses response text for non-JSON errors and treats a network rejection as failed', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, text: async () => 'gateway unavailable' })
      .mockRejectedValueOnce(new Error('offline'))
    const updates = vi.fn()
    const stop = service.subscribe(base.id, updates)
    await service.initiateCall(base)
    expect(updates.mock.lastCall?.[0].auditLog.at(-1).message).toBe('Failed to initiate call: gateway unavailable')
    await service.initiateCall(base)
    expect(updates.mock.lastCall?.[0].auditLog.at(-1).message).toBe('Failed to initiate call: offline')
    stop()
  })

  it('ignores unsuccessful and malformed polls, then continues on the next tick', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ transaction: { id: base.id, status: 'connected' } }))
    const updates = vi.fn()
    const stop = service.subscribe(base.id, updates)
    await vi.advanceTimersByTimeAsync(8000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(updates.mock.lastCall?.[0].status).toBe('connected')
    expect(console.error).toHaveBeenCalledWith('Status polling error:', expect.any(Error))
    stop()
  })

  it('uses a configured backend URL and retries with incremented count and new audit', async () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://example.test')
    vi.resetModules()
    service = new (await import('../src/lib/call-service')).CallService()
    fetchMock.mockResolvedValue(jsonResponse({ callConnectionId: 'call-retry' }))
    const updates = vi.fn()
    const stop = service.subscribe(base.id, updates)
    await service.retryCall({ ...base, dtmfInput: '2', retryCount: 2 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/api/calls/initiate',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(updates.mock.calls.map(([value]: [Transaction]) => value.status)).toEqual([
      'pending', 'initiating', 'dialing',
    ])
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      status: 'dialing',
      dtmfInput: null,
      retryCount: 3,
      auditLog: [
        { status: 'pending', message: 'Retry attempt 3 initiated' },
        { status: 'initiating', message: 'Sending request to backend API' },
        { status: 'dialing', message: 'Real call initiated via ACS. Call ID: call-retry' },
      ],
    })
    stop()
  })
})
