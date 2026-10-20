import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CallService } from '../src/lib/call-service'
import type { Transaction } from '../src/lib/types'

const instant = '2025-01-02T03:04:05.000Z'

function transaction(): Transaction {
  return {
    id: 'TXN-1',
    amount: 12.5,
    currency: 'AED',
    merchant: 'Market',
    merchantName: 'Old alias',
    customerName: 'Alex',
    customerPhone: '+971500000001',
    status: 'pending',
    dtmfInput: null,
    createdAt: instant,
    updatedAt: instant,
    retryCount: 0,
    auditLog: [{ timestamp: instant, status: 'pending', message: 'Created' }]
  }
}

const ok = (data: unknown) => ({ ok: true, json: async () => data })

describe('CallService offline characterization', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(instant))
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('Unexpected network call')
    }))
    vi.spyOn(console, 'error').mockImplementation(vi.fn())
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('posts the current JSON contract and emits initiating/dialing audits before polling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ callConnectionId: 'call-7' }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new CallService()
    const updates = vi.fn()
    const unsubscribe = service.subscribe('TXN-1', updates)
    await service.initiateCall(transaction())

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:3001/api/calls/initiate')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body)).toEqual({
      transactionId: 'TXN-1', customerPhone: '+971500000001',
      customerName: 'Alex', amount: 12.5, merchantName: 'Market',
      merchant: 'Market', currency: 'AED'
    })
    expect(updates.mock.calls.map(([value]) => value.status)).toEqual(['initiating', 'dialing'])
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      callStartedAt: instant, callConnectionId: undefined, retryCount: 0,
      auditLog: [
        { status: 'pending', message: 'Created' },
        { status: 'initiating', message: 'Sending request to backend API' },
        {
          status: 'dialing',
          message: 'Real call initiated via ACS. Call ID: call-7',
          metadata: { callConnectionId: 'call-7' }
        }
      ]
    })
    unsubscribe()
  })

  it('merges partial polling updates and retains prior nonempty audit on an empty incoming audit', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ callConnectionId: 'call-7' }))
      .mockResolvedValueOnce(ok({ transaction: {
        id: 'TXN-1', status: 'connected', amount: 0, currency: '',
        merchant: '', merchantName: 'New alias', customerName: '',
        dtmfInput: '1', retryCount: 0, auditLog: []
      } }))
      .mockResolvedValueOnce(ok({ transaction: {
        id: 'TXN-1', status: 'waiting-input', dtmfInput: null,
        auditLog: [{ timestamp: instant, status: 'waiting-input', message: 'From backend' }]
      } }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new CallService()
    const updates = vi.fn()
    const unsubscribe = service.subscribe('TXN-1', updates)
    await service.initiateCall(transaction())
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3001/api/calls/TXN-1/status')
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      status: 'connected', amount: 0, currency: 'AED', merchant: 'New alias',
      merchantName: 'New alias', customerName: 'Alex', dtmfInput: '1',
      callConnectionId: undefined, retryCount: 0
    })
    expect(updates.mock.lastCall?.[0].auditLog).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(2000)
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      status: 'waiting-input', dtmfInput: null,
      auditLog: [{ message: 'From backend' }]
    })
    unsubscribe()
  })

  it('retries with incremented count, cleared DTMF, pending audit, and the same request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ callConnectionId: 'retry-call' }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new CallService()
    const updates = vi.fn()
    const unsubscribe = service.subscribe('TXN-1', updates)
    await service.retryCall({ ...transaction(), status: 'no-answer', retryCount: 2, dtmfInput: '2' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      transactionId: 'TXN-1', customerPhone: '+971500000001',
      customerName: 'Alex', amount: 12.5, merchantName: 'Market',
      merchant: 'Market', currency: 'AED'
    })
    expect(updates.mock.calls.map(([value]) => value.status)).toEqual(['pending', 'initiating', 'dialing'])
    expect(updates.mock.lastCall?.[0]).toMatchObject({
      retryCount: 3, dtmfInput: null, callConnectionId: undefined,
      auditLog: [
        { message: 'Created' },
        { status: 'pending', message: 'Retry attempt 3 initiated' },
        { status: 'initiating', message: 'Sending request to backend API' },
        { status: 'dialing', message: 'Real call initiated via ACS. Call ID: retry-call' }
      ]
    })
    unsubscribe()
  })

  it.each(['approved', 'rejected', 'escalated', 'timeout', 'no-answer', 'failed'] as const)(
    'stops polling on terminal %s and replays the last state to a later subscriber',
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(ok({ transaction: {
        id: 'TXN-1', status, merchantName: 'Backend Market'
      } }))
      vi.stubGlobal('fetch', fetchMock)
      const service = new CallService()
      const updates = vi.fn()
      const unsubscribe = service.subscribe('TXN-1', updates)
      await vi.advanceTimersByTimeAsync(2000)
      expect(updates).toHaveBeenCalledWith(expect.objectContaining({
        id: 'TXN-1', merchant: 'Backend Market', currency: 'USD',
        retryCount: 0, auditLog: [], dtmfInput: null, status
      }))
      await vi.advanceTimersByTimeAsync(6000)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
      unsubscribe()
      const later = vi.fn()
      const stopLater = service.subscribe('TXN-1', later)
      expect(later).toHaveBeenCalledWith(expect.objectContaining({ status }))
      stopLater()
    }
  )

  it('unsubscribes and clears the timer; a replacement subscription starts one new poller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({}))
    vi.stubGlobal('fetch', fetchMock)
    const service = new CallService()
    const first = vi.fn()
    const unsubscribe = service.subscribe('TXN-1', first)
    unsubscribe()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).not.toHaveBeenCalled()
    const second = vi.fn()
    const stopSecond = service.subscribe('TXN-1', second)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
    stopSecond()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    ['JSON error', { ok: false, text: async () => '{"message":"Declined"}' }, 'Declined'],
    ['plain text error', { ok: false, text: async () => 'Unavailable' }, 'Unavailable'],
    ['empty error', { ok: false, text: async () => '' }, 'Failed to initiate call']
  ])('records %s as failed and caches the terminal state', async (_kind, response, reason) => {
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    const service = new CallService()
    const updates = vi.fn()
    await service.initiateCall(transaction())
    expect(vi.getTimerCount()).toBe(0)
    // Subscribe after failure to observe the cached terminal transaction.
    const unsubscribe = service.subscribe('TXN-1', updates)
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', callEndedAt: instant,
      auditLog: expect.arrayContaining([
        expect.objectContaining({ status: 'failed', message: `Failed to initiate call: ${reason}` })
      ])
    }))
    unsubscribe()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('continues polling after a fetch exception or non-OK status response', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(ok({ transaction: { id: 'TXN-1', status: 'approved' } }))
    vi.stubGlobal('fetch', fetchMock)
    const service = new CallService()
    const updates = vi.fn()
    const unsubscribe = service.subscribe('TXN-1', updates)
    await vi.advanceTimersByTimeAsync(6000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }))
    expect(console.error).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
