import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateCallDuration,
  formatCurrency,
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
