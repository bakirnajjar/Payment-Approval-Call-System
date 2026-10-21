import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateCallDuration,
  createTransaction,
  addAuditLogEntry,
  formatCurrency,
  formatTimestamp,
  formatPhoneNumber,
  generateCallScript,
  getStatusColor,
  getStatusLabel,
} from '../frontend/src/lib/transaction-utils.ts'

test('call script preserves transaction identity, US currency, customer, merchant, and keypad choices', () => {
  assert.deepEqual(
    generateCallScript({
      id: 'TXN-1',
      amount: 1234.5,
      currency: 'USD',
      merchant: 'Café',
      customerName: 'Ada',
    }),
    {
      transactionId: 'TXN-1',
      text: 'Hello Ada. This is a transaction verification call from your bank. We detected a transaction of $1,234.50 at Café. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0.',
    },
  )
})

test('call script falls back for absent customer, amount, currency, and merchant', () => {
  assert.deepEqual(
    generateCallScript({ id: 'TXN-2' }),
    {
      transactionId: 'TXN-2',
      text: 'Hello customer. This is a transaction verification call from your bank. We detected a transaction of $0.00 at the merchant. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0.',
    },
  )
  assert.match(generateCallScript({ id: 'TXN-3', merchantName: 'Old Name' }).text, /at Old Name\./)
})

test('phone formatting strips punctuation and preserves the existing non-971 grouping', () => {
  assert.equal(formatPhoneNumber('+971 (50) 123-4567'), '+971 50 123 4567')
  assert.equal(formatPhoneNumber('(415) 555-0199'), '+415 55 501 99')
  assert.equal(formatPhoneNumber(''), '+   ')
})

test('currency and call duration retain decimal and elapsed-second formatting', () => {
  assert.equal(formatCurrency(12.5, 'AED'), 'AED 12.50')
  assert.equal(formatCurrency(0, 'USD'), 'USD 0.00')
  assert.equal(calculateCallDuration('2024-01-01T00:00:00Z', '2024-01-01T00:01:01Z'), '1m 1s')
  assert.equal(calculateCallDuration('2024-01-01T00:00:00Z', '2024-01-01T00:00:59Z'), '59s')
})

test('status presentation groups active, warning, failure, and unknown statuses', () => {
  assert.equal(getStatusColor('processing'), 'bg-primary text-primary-foreground')
  assert.equal(getStatusColor('no-answer'), 'bg-warning text-warning-foreground')
  assert.equal(getStatusColor('rejected'), 'bg-destructive text-destructive-foreground')
  assert.equal(getStatusColor('pending'), 'bg-muted text-muted-foreground')
  assert.equal(getStatusLabel('waiting-input'), 'Waiting for Input')
  assert.equal(getStatusLabel('no-answer'), 'No Answer')
  assert.equal(getStatusLabel('other'), 'other')
})

test('created transaction serializes identity, decimal parsing, defaults and initial audit without changing input', (t) => {
  t.mock.method(Date, 'now', () => 1704067200000)
  t.mock.method(Math, 'random', () => 0.5)
  const input = { amount: '12.50xyz', currency: 'AED', merchant: 'Café', customerName: 'Ada', customerPhone: '+971501234567' }
  const transaction = createTransaction(input)
  assert.equal(transaction.id, 'TXN-1704067200000-I')
  assert.equal(transaction.amount, 12.5) // parseFloat currently accepts trailing text
  assert.deepEqual(JSON.parse(JSON.stringify(transaction)), {
    id: transaction.id, amount: 12.5, currency: 'AED', merchant: 'Café',
    customerName: 'Ada', customerPhone: '+971501234567', status: 'pending',
    dtmfInput: null, createdAt: transaction.createdAt, updatedAt: transaction.createdAt,
    retryCount: 0,
    auditLog: [{ timestamp: transaction.createdAt, status: 'pending', message: 'Transaction created and queued for verification call' }],
  })
  assert.match(transaction.createdAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
  assert.equal(input.amount, '12.50xyz')
})

test('audit transition appends an ISO timestamp and retains original entry, including omitted metadata serialization', () => {
  const original = createTransaction({ amount: '1', currency: 'USD', merchant: 'Shop', customerName: 'Ada', customerPhone: '12345' })
  const next = addAuditLogEntry(original, 'failed', 'Unable to call', { reason: 'offline' })
  assert.equal(original.status, 'pending')
  assert.equal(original.auditLog.length, 1)
  assert.equal(next.status, 'failed')
  assert.equal(next.auditLog.length, 2)
  assert.deepEqual(next.auditLog[0], original.auditLog[0])
  assert.deepEqual(next.auditLog[1], {
    timestamp: next.updatedAt, status: 'failed', message: 'Unable to call', metadata: { reason: 'offline' },
  })
  assert.equal(JSON.parse(JSON.stringify(original)).auditLog[0].metadata, undefined)
  assert.equal(JSON.parse(JSON.stringify(addAuditLogEntry(original, 'dialing', 'Calling'))).auditLog[1].metadata, undefined)
})

test('formatting pins rounding and timezone-sensitive dates with explicit UTC input', () => {
  assert.equal(formatCurrency(-1.234, 'AED'), 'AED -1.23')
  assert.equal(formatCurrency(1234.5, 'EUR'), 'EUR 1234.50')
  const previousTimezone = process.env.TZ
  try {
    process.env.TZ = 'UTC'
    assert.equal(formatTimestamp('2024-01-01T00:00:00Z'), 'Jan 1, 2024, 12:00:00 AM')
    assert.equal(formatTimestamp('2024-01-01T02:30:00+02:00'), 'Jan 1, 2024, 12:30:00 AM')
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
  assert.equal(calculateCallDuration('2024-01-01T00:00:00Z', '2024-01-01T00:00:00.999Z'), '0s')
})
