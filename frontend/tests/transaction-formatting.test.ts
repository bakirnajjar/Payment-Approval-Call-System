import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addAuditLogEntry,
  createTransaction,
  formatCurrency,
  formatPhoneNumber,
  formatTimestamp,
  generateCallScript,
  generateTransactionId,
} from '../src/lib/transaction-utils'
import type { Transaction } from '../src/lib/types'

const transaction: Transaction = {
  id: 'TXN-123',
  amount: 1234.5,
  currency: 'USD',
  merchant: 'Corner Shop',
  customerName: 'Alex',
  customerPhone: '+971501234567',
  status: 'pending',
  dtmfInput: null,
  createdAt: '2025-01-02T03:04:05.000Z',
  updatedAt: '2025-01-02T03:04:05.000Z',
  retryCount: 0,
  auditLog: [],
}

describe('existing transaction formatting', () => {
  it('formats currency with a literal currency code and two decimal places', () => {
    expect(formatCurrency(12.5, 'AED')).toBe('AED 12.50')
    expect(formatCurrency(-1.235, 'USD')).toBe('USD -1.24')
  })

  it('formats UAE phone digits after stripping punctuation', () => {
    expect(formatPhoneNumber('+971 (50) 123-4567')).toBe('+971 50 123 4567')
  })

  it('formats a UTC timestamp with the existing en-US date and 12-hour clock', () => {
    const previousTZ = process.env.TZ
    process.env.TZ = 'UTC'
    try {
      expect(formatTimestamp('2025-01-02T03:04:05.000Z')).toBe('Jan 2, 2025, 03:04:05 AM')
    } finally {
      if (previousTZ === undefined) delete process.env.TZ
      else process.env.TZ = previousTZ
    }
  })

  it('generates the existing spoken USD amount and transaction reference', () => {
    expect(generateCallScript(transaction)).toEqual({
      transactionId: 'TXN-123',
      text: 'Hello Alex. This is a transaction verification call from your bank. We detected a transaction of $1,234.50 at Corner Shop. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0.',
    })
  })

  it('uses existing fallback name, merchant and currency when values are empty', () => {
    expect(generateCallScript({
      ...transaction,
      amount: 0,
      currency: '',
      merchant: '',
      merchantName: '',
      customerName: '',
    }).text).toBe(
      'Hello customer. This is a transaction verification call from your bank. We detected a transaction of $0.00 at the merchant. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0.',
    )
  })

  it('keeps amount formatting literal rather than applying locale grouping or currency symbols', () => {
    expect(formatCurrency(1234567.5, 'JPY')).toBe('JPY 1234567.50')
    expect(formatCurrency(0, '')).toBe(' 0.00')
    expect(formatCurrency(-0.125, 'EUR')).toBe('EUR -0.13')
  })

  it('speaks the configured currency and falls back to merchantName', () => {
    expect(generateCallScript({
      ...transaction,
      currency: 'AED',
      amount: 2000,
      merchant: '',
      merchantName: 'Backup Store',
    })).toEqual({
      transactionId: 'TXN-123',
      text: 'Hello Alex. This is a transaction verification call from your bank. We detected a transaction of AED 2,000.00 at Backup Store. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0.',
    })
  })
})

describe('existing transaction and audit transitions', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('generates the current time-based uppercase reference', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1735787045000)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(generateTransactionId()).toBe('TXN-1735787045000-I')
  })

  it('creates a pending transaction with parsed amount and one timestamped audit entry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-02T03:04:05.000Z'))
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(createTransaction({
      amount: '12.50 extra',
      currency: 'AED',
      merchant: 'Corner Shop',
      customerName: 'Alex',
      customerPhone: '+971501234567',
    })).toEqual({
      id: 'TXN-1735787045000-I',
      amount: 12.5,
      currency: 'AED',
      merchant: 'Corner Shop',
      customerName: 'Alex',
      customerPhone: '+971501234567',
      status: 'pending',
      dtmfInput: null,
      createdAt: '2025-01-02T03:04:05.000Z',
      updatedAt: '2025-01-02T03:04:05.000Z',
      retryCount: 0,
      auditLog: [{
        timestamp: '2025-01-02T03:04:05.000Z',
        status: 'pending',
        message: 'Transaction created and queued for verification call',
      }],
    })
  })

  it('appends audit metadata and advances status/time without mutating the previous transaction', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-02T04:05:06.000Z'))
    const changed = addAuditLogEntry(transaction, 'approved', 'Confirmed', { digit: '1' })
    expect(changed).toEqual({
      ...transaction,
      status: 'approved',
      updatedAt: '2025-01-02T04:05:06.000Z',
      auditLog: [{
        timestamp: '2025-01-02T04:05:06.000Z',
        status: 'approved',
        message: 'Confirmed',
        metadata: { digit: '1' },
      }],
    })
    expect(transaction.auditLog).toEqual([])
    expect(transaction.status).toBe('pending')
  })
})
