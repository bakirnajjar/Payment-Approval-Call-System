import type { Transaction } from './types'
import { addAuditLogEntry } from './transaction-utils'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

type CallUpdateCallback = (transaction: Transaction) => void

export class CallService {
  private callbacks: Map<string, CallUpdateCallback> = new Map()
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map()
  private finalStates = new Set<Transaction['status']>(['approved', 'rejected', 'escalated', 'timeout', 'no-answer', 'failed'])
  private currentTransactions: Map<string, Transaction> = new Map()

  private mergeTransactionData(existing: Transaction | undefined, incoming: Partial<Transaction>): Transaction {
    if (!existing) {
      const guaranteed = incoming as Transaction
      return {
        ...guaranteed,
        merchant: guaranteed.merchant || guaranteed.merchantName || '',
        currency: guaranteed.currency || 'USD',
        retryCount: guaranteed.retryCount ?? 0,
        auditLog: guaranteed.auditLog ?? [],
        dtmfInput: guaranteed.dtmfInput ?? null
      }
    }

    const mergedAuditLog = incoming.auditLog && incoming.auditLog.length > 0
      ? incoming.auditLog
      : existing.auditLog

    return {
      ...existing,
      ...incoming,
  amount: incoming.amount ?? existing.amount,
  currency: incoming.currency || existing.currency,
  merchant: incoming.merchant || incoming.merchantName || existing.merchant,
  merchantName: incoming.merchantName || existing.merchantName,
  customerName: incoming.customerName || existing.customerName,
  customerPhone: incoming.customerPhone || existing.customerPhone,
  dtmfInput: incoming.dtmfInput !== undefined ? incoming.dtmfInput : existing.dtmfInput,
  callStartedAt: incoming.callStartedAt ?? existing.callStartedAt,
  callEndedAt: incoming.callEndedAt ?? existing.callEndedAt,
  retryCount: incoming.retryCount ?? existing.retryCount,
  audioUrl: incoming.audioUrl || existing.audioUrl,
  callConnectionId: incoming.callConnectionId || existing.callConnectionId,
  error: incoming.error || existing.error,
      auditLog: mergedAuditLog
    }
  }

  private pushUpdate(transaction: Transaction): void {
    this.currentTransactions.set(transaction.id, transaction)
    const callback = this.callbacks.get(transaction.id)
    if (callback) {
      callback(transaction)
    }
  }
  
  subscribe(transactionId: string, callback: CallUpdateCallback): () => void {
    this.callbacks.set(transactionId, callback)

    const existing = this.currentTransactions.get(transactionId)
    if (existing) {
      callback(existing)
    }

    if (!this.pollingIntervals.has(transactionId)) {
      this.startStatusPolling(transactionId)
    }

    return () => {
      this.callbacks.delete(transactionId)
      const interval = this.pollingIntervals.get(transactionId)
      if (interval) {
        clearInterval(interval)
        this.pollingIntervals.delete(transactionId)
      }
    }
  }
  
  private notify(transaction: Transaction): void {
    const callback = this.callbacks.get(transaction.id)
    if (callback) {
      callback(transaction)
    }
  }
  
  async initiateCall(transaction: Transaction): Promise<void> {
    try {
      // Update initial status
      this.currentTransactions.set(transaction.id, transaction)

      let current = addAuditLogEntry(transaction, 'initiating', 'Sending request to backend API')
      current = this.mergeTransactionData(this.currentTransactions.get(transaction.id), current)
      this.pushUpdate(current)

      // Call backend API to initiate real phone call
      const response = await fetch(`${BACKEND_URL}/api/calls/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId: transaction.id,
          customerPhone: transaction.customerPhone,
          customerName: transaction.customerName,
          amount: transaction.amount,
          merchantName: transaction.merchant,
          merchant: transaction.merchant,
          currency: transaction.currency
        })
      })

      if (!response.ok) {
        const rawError = await response.text()
        try {
          const parsed = rawError ? JSON.parse(rawError) : null
          throw new Error(parsed?.message || parsed?.error || 'Failed to initiate call')
        } catch (parseError) {
          if (parseError instanceof SyntaxError) {
            throw new Error(rawError || 'Failed to initiate call')
          }
          throw parseError
        }
      }

      const result = await response.json()
      
      current = addAuditLogEntry(
        current, 
        'dialing', 
        `Real call initiated via ACS. Call ID: ${result.callConnectionId}`,
        { callConnectionId: result.callConnectionId }
      )
      current.callStartedAt = new Date().toISOString()
      current = this.mergeTransactionData(this.currentTransactions.get(transaction.id), current)
      this.pushUpdate(current)

      // Start polling for call status updates
      this.startStatusPolling(transaction.id)
      
    } catch (error) {
      console.error('Failed to initiate call:', error)
      const failed = addAuditLogEntry(
        transaction,
        'failed',
        `Failed to initiate call: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      failed.callEndedAt = new Date().toISOString()
      const mergedFailed = this.mergeTransactionData(this.currentTransactions.get(transaction.id), failed)
      this.pushUpdate(mergedFailed)
    }
  }

  private startStatusPolling(transactionId: string): void {
    if (this.pollingIntervals.has(transactionId)) {
      return
    }

    // Poll every 2 seconds for status updates
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/calls/${transactionId}/status`)
        
        if (response.ok) {
          const statusData = await response.json()
          
          // Check if we have a complete transaction state from backend
          if (statusData.transaction) {
            const existing = this.currentTransactions.get(transactionId)
            const backendTransaction = statusData.transaction as Partial<Transaction>
            const merged = this.mergeTransactionData(existing, backendTransaction)
            this.pushUpdate(merged)
            
            // Stop polling if call is in final state
            if (this.finalStates.has(merged.status)) {
              clearInterval(interval)
              this.pollingIntervals.delete(transactionId)
            }
          }
        }
      } catch (error) {
        console.error('Status polling error:', error)
      }
    }, 2000)
    
    this.pollingIntervals.set(transactionId, interval)
  }
  
  async retryCall(transaction: Transaction): Promise<void> {
    const updatedTransaction = {
      ...transaction,
      status: 'pending' as const,
      dtmfInput: null,
      retryCount: transaction.retryCount + 1
    }
    
    const withAudit = addAuditLogEntry(
      updatedTransaction,
      'pending',
      `Retry attempt ${updatedTransaction.retryCount} initiated`
    )
    const merged = this.mergeTransactionData(this.currentTransactions.get(transaction.id), withAudit)
    this.pushUpdate(merged)
    
    await this.initiateCall(withAudit)
  }
}

export const callService = new CallService()
