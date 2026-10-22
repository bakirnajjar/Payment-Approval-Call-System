import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CallService } from './call-service'
import { createTransaction } from './transaction-utils'
import type { Transaction } from './types'

const transaction = (): Transaction => createTransaction({
  amount: '42.50',
  currency: 'AED',
  merchant: 'Market',
  customerName: 'Sam',
  customerPhone: '+971501234567'
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('CallService API contracts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-03T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('posts initiation payload, emits audit transitions, and polls status until a final state', async () => {
    const service = new CallService()
    const input = transaction()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ callConnectionId: 'call-1' }))
      .mockResolvedValueOnce(json({ transaction: {
        id: input.id, status: 'connected', merchantName: 'Backend Shop',
        auditLog: [], callConnectionId: 'call-1'
      } }))
      .mockResolvedValueOnce(json({ transaction: {
        id: input.id, status: 'approved', dtmfInput: '1',
        auditLog: [{ timestamp: '2026-02-03T10:00:04.000Z', status: 'approved', message: 'Approved by customer' }]
      } }))
    vi.stubGlobal('fetch', fetchMock)
    const updates: Transaction[] = []
    const unsubscribe = service.subscribe(input.id, value => updates.push(value))

    await service.initiateCall(input)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/calls/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: input.id, customerPhone: input.customerPhone,
        customerName: input.customerName, amount: input.amount,
        merchantName: input.merchant, merchant: input.merchant, currency: input.currency
      })
    })
    expect(updates.map(update => update.status)).toEqual(['initiating', 'dialing'])
    expect(updates[1]).toMatchObject({
      callConnectionId: 'call-1',
      callStartedAt: '2026-02-03T10:00:00.000Z',
      auditLog: [
        input.auditLog[0],
        { status: 'initiating', message: 'Sending request to backend API' },
        { status: 'dialing', metadata: { callConnectionId: 'call-1' } }
      ]
    })
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenLastCalledWith(`http://localhost:3001/api/calls/${input.id}/status`)
    expect(updates.at(-1)).toMatchObject({
      status: 'connected', merchant: 'Backend Shop', currency: 'AED',
      customerName: 'Sam', dtmfInput: null, retryCount: 0, auditLog: updates[1].auditLog
    })

    await vi.advanceTimersByTimeAsync(2000)
    expect(updates.at(-1)).toMatchObject({
      status: 'approved', dtmfInput: '1', merchant: 'Backend Shop',
      auditLog: [{ status: 'approved', message: 'Approved by customer' }]
    })
    expect(vi.getTimerCount()).toBe(0)
    unsubscribe()
  })

  it('does not duplicate polling subscriptions, and stops on unsubscribe', async () => {
    const service = new CallService()
    const input = transaction()
    const fetchMock = vi.fn().mockResolvedValue(json({}))
    vi.stubGlobal('fetch', fetchMock)
    const first = vi.fn()
    const unsubscribe = service.subscribe(input.id, first)
    const second = vi.fn()
    const unsubscribeSecond = service.subscribe(input.id, second)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    unsubscribeSecond()
    unsubscribe()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['JSON error', () => json({ message: 'Invalid number' }, 400), 'Invalid number'],
    ['plain text error', () => new Response('Gateway unavailable', { status: 502 }), 'Gateway unavailable'],
    ['empty error', () => new Response('', { status: 500 }), 'Failed to initiate call']
  ])('records a failed call for %s', async (_label, response, message) => {
    const service = new CallService()
    const input = transaction()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const updates: Transaction[] = []
    const unsubscribe = service.subscribe(input.id, update => updates.push(update))
    await service.initiateCall(input)

    expect(updates.map(update => update.status)).toEqual(['initiating', 'failed'])
    expect(updates.at(-1)).toMatchObject({
      callEndedAt: '2026-02-03T10:00:00.000Z',
      auditLog: [
        input.auditLog[0],
        { status: 'initiating' },
        { status: 'failed', message: `Failed to initiate call: ${message}` }
      ]
    })
    unsubscribe()
  })

  it('keeps polling after a transient status error and stops after a terminal response', async () => {
    const service = new CallService()
    const input = transaction()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(json({ transaction: { ...input, status: 'failed' } }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const updates: Transaction[] = []
    const unsubscribe = service.subscribe(input.id, update => updates.push(update))
    await vi.advanceTimersByTimeAsync(6000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(updates).toHaveLength(1)
    expect(updates[0].status).toBe('failed')
    expect(vi.getTimerCount()).toBe(0)
    unsubscribe()
  })
})
