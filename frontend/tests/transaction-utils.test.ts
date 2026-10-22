import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addAuditLogEntry,
  calculateCallDuration,
  createTransaction,
  formatCurrency,
  formatPhoneNumber,
  formatTimestamp,
  generateCallScript,
  generateTransactionId,
  getStatusColor,
  getStatusLabel
} from '../src/lib/transaction-utils'

describe('transaction utility characterization', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-02T03:04:05.000Z'))
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('generates a time-prefixed uppercase base36 transaction ID', () => {
    expect(generateTransactionId()).toBe('TXN-1735787045000-I')
    vi.setSystemTime(new Date('2025-01-02T03:04:06.000Z'))
    expect(generateTransactionId()).toBe('TXN-1735787046000-I')
  })

  it('parses form values and creates an initial pending audit event without mutating the form', () => {
    const form = {
      amount: '12.50 USD',
      currency: 'AED',
      merchant: 'Market',
      customerName: 'Alex',
      customerPhone: '+971500000001'
    }
    const transaction = createTransaction(form)
    expect(transaction).toEqual({
      id: 'TXN-1735787045000-I',
      amount: 12.5,
      currency: 'AED',
      merchant: 'Market',
      customerName: 'Alex',
      customerPhone: '+971500000001',
      status: 'pending',
      dtmfInput: null,
      createdAt: '2025-01-02T03:04:05.000Z',
      updatedAt: '2025-01-02T03:04:05.000Z',
      retryCount: 0,
      auditLog: [{
        timestamp: '2025-01-02T03:04:05.000Z',
        status: 'pending',
        message: 'Transaction created and queued for verification call'
      }]
    })
    expect(form.amount).toBe('12.50 USD')
  })

  it('appends timestamped audit metadata and status immutably', () => {
    const original = createTransaction({
      amount: '0', currency: 'USD', merchant: 'Shop',
      customerName: 'Alex', customerPhone: '123'
    })
    vi.setSystemTime(new Date('2025-01-02T03:04:07.000Z'))
    const updated = addAuditLogEntry(original, 'approved', 'Confirmed', { digit: '1' })
    expect(updated).toMatchObject({
      status: 'approved',
      createdAt: '2025-01-02T03:04:05.000Z',
      updatedAt: '2025-01-02T03:04:07.000Z'
    })
    expect(updated.auditLog).toEqual([
      original.auditLog[0],
      {
        timestamp: '2025-01-02T03:04:07.000Z',
        status: 'approved',
        message: 'Confirmed',
        metadata: { digit: '1' }
      }
    ])
    expect(original.status).toBe('pending')
    expect(original.auditLog).toHaveLength(1)
  })

  it('formats call script amounts using en-US Intl currency, including default names and zero', () => {
    const transaction = createTransaction({
      amount: '1234.5', currency: 'AED', merchant: 'Market',
      customerName: 'Alex', customerPhone: '123'
    })
    expect(generateCallScript(transaction)).toEqual({
      transactionId: transaction.id,
      text: 'Hello Alex. This is a transaction verification call from your bank. We detected a transaction of AED 1,234.50 at Market. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0.'
    })
    expect(generateCallScript({
      ...transaction, amount: 0, currency: '', merchant: '', merchantName: '', customerName: ''
    }).text).toContain('Hello customer. This is a transaction verification call from your bank. We detected a transaction of $0.00 at the merchant.')
  })

  it('uses literal currency codes and fixed decimals, UTC en-US timestamps and digit-only phone layout', () => {
    expect(formatCurrency(1234.5, 'AED')).toBe('AED 1234.50')
    expect(formatCurrency(-1.235, 'USD')).toBe('USD -1.24')
    expect(formatTimestamp('2025-01-02T03:04:05.000Z')).toBe('Jan 2, 2025, 03:04:05 AM')
    expect(formatPhoneNumber('+971 (50) 123-4567')).toBe('+971 50 123 4567')
    expect(formatPhoneNumber('(555) 123-4567')).toBe('+555 12 345 67')
  })

  it('maps statuses and floors durations in seconds', () => {
    expect(getStatusLabel('waiting-input')).toBe('Waiting for Input')
    expect(getStatusLabel('no-answer')).toBe('No Answer')
    expect(getStatusColor('failed')).toBe('bg-destructive text-destructive-foreground')
    expect(getStatusColor('timeout')).toBe('bg-warning text-warning-foreground')
    expect(calculateCallDuration('2025-01-02T03:04:05Z', '2025-01-02T03:05:06Z')).toBe('1m 1s')
    expect(calculateCallDuration('2025-01-02T03:04:05Z', '2025-01-02T03:04:05.999Z')).toBe('0s')
  })
})
