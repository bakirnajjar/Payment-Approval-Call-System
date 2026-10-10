import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatPhoneNumber,
  formatTimestamp,
  generateCallScript,
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
})
