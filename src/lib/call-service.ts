import type { Transaction, DTMFInput } from './types'
import { addAuditLogEntry } from './transaction-utils'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

type CallUpdateCallback = (transaction: Transaction) => void

export class CallService {
  private callbacks: Map<string, CallUpdateCallback> = new Map()
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map()
  private finalStates = new Set<Transaction['status']>(['approved', 'rejected', 'escalated', 'timeout', 'no-answer', 'failed'])
  
  subscribe(transactionId: string, callback: CallUpdateCallback): () => void {
    this.callbacks.set(transactionId, callback)

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
      let current = addAuditLogEntry(transaction, 'initiating', 'Sending request to backend API')
      this.notify(current)

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
          merchantName: transaction.merchant
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
      this.notify(current)

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
      this.notify(failed)
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
            this.notify(statusData.transaction)
            
            // Stop polling if call is in final state
            if (this.finalStates.has(statusData.transaction.status)) {
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
    
    this.notify(withAudit)
    
    await this.initiateCall(withAudit)
  }
}

export const callService = new CallService()
