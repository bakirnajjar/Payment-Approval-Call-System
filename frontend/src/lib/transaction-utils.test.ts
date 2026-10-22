import { describe, expect, it, vi } from 'vitest'
import { addAuditLogEntry, createTransaction, generateCallScript } from './transaction-utils'

describe('transaction creation and audit', () => {
  it('creates a pending transaction with the form values and an initial audit entry', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'))
      const transaction = createTransaction({
        amount: '125.50',
        currency: 'AED',
        merchant: 'Shop',
        customerName: 'Alex',
        customerPhone: '+971501234567'
      })

      expect(transaction).toMatchObject({
        id: expect.stringMatching(/^TXN-\d+-[A-Z0-9]+$/),
        amount: 125.5,
        currency: 'AED',
        merchant: 'Shop',
        customerName: 'Alex',
        customerPhone: '+971501234567',
        status: 'pending',
        dtmfInput: null,
        retryCount: 0,
        createdAt: '2026-01-02T03:04:05.000Z',
        updatedAt: '2026-01-02T03:04:05.000Z',
        auditLog: [{
          timestamp: '2026-01-02T03:04:05.000Z',
          status: 'pending',
          message: 'Transaction created and queued for verification call'
        }]
      })
      expect(generateCallScript(transaction)).toMatchObject({
        transactionId: transaction.id,
        text: expect.stringContaining('AED 125.50')
      })

      vi.setSystemTime(new Date('2026-01-02T03:05:00.000Z'))
      const updated = addAuditLogEntry(transaction, 'dialing', 'Call started', { callConnectionId: 'call-1' })
      expect(updated).toMatchObject({
        status: 'dialing',
        updatedAt: '2026-01-02T03:05:00.000Z',
        auditLog: [
          transaction.auditLog[0],
          {
            timestamp: '2026-01-02T03:05:00.000Z',
            status: 'dialing',
            message: 'Call started',
            metadata: { callConnectionId: 'call-1' }
          }
        ]
      })
      expect(transaction.status).toBe('pending')
      expect(transaction.auditLog).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
