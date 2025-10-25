import type { Transaction, TransactionFormData, CallScript, AuditLogEntry, TransactionStatus } from './types'

export function generateTransactionId(): string {
  return `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
}

export function generateCallScript(transaction: Transaction): CallScript {
  const merchantName = transaction.merchant || transaction.merchantName || 'the merchant'

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: transaction.currency || 'USD'
  })

  const formattedAmount = formatter.format(transaction.amount || 0)

  const text = `Hello ${transaction.customerName || 'customer'}. This is a transaction verification call from your bank. We detected a transaction of ${formattedAmount} at ${merchantName}. If you authorized this transaction, press 1. If you did not authorize this transaction, press 2. If this call is not for you, press 0.`
  
  return {
    transactionId: transaction.id,
    text
  }
}

export function createTransaction(formData: TransactionFormData): Transaction {
  const id = generateTransactionId()
  const now = new Date().toISOString()
  
  const transaction: Transaction = {
    id,
    amount: parseFloat(formData.amount),
    currency: formData.currency,
    merchant: formData.merchant,
    customerName: formData.customerName,
    customerPhone: formData.customerPhone,
    status: 'pending',
    dtmfInput: null,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    auditLog: [
      {
        timestamp: now,
        status: 'pending',
        message: 'Transaction created and queued for verification call'
      }
    ]
  }
  
  return transaction
}

export function addAuditLogEntry(
  transaction: Transaction,
  status: TransactionStatus,
  message: string,
  metadata?: Record<string, unknown>
): Transaction {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    status,
    message,
    metadata
  }
  
  return {
    ...transaction,
    status,
    updatedAt: entry.timestamp,
    auditLog: [...transaction.auditLog, entry]
  }
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('971')) {
    return `+971 ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`
  }
  return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`
}

export function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`
}

export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function getStatusColor(status: TransactionStatus): string {
  switch (status) {
    case 'approved':
      return 'bg-success text-success-foreground'
    case 'rejected':
    case 'failed':
      return 'bg-destructive text-destructive-foreground'
    case 'escalated':
    case 'timeout':
    case 'no-answer':
      return 'bg-warning text-warning-foreground'
    case 'dialing':
    case 'connected':
    case 'playing-message':
    case 'waiting-input':
    case 'processing':
      return 'bg-primary text-primary-foreground'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function getStatusLabel(status: TransactionStatus): string {
  switch (status) {
    case 'pending': return 'Pending'
    case 'initiating': return 'Initiating'
    case 'dialing': return 'Dialing'
    case 'connected': return 'Connected'
    case 'playing-message': return 'Playing Message'
    case 'waiting-input': return 'Waiting for Input'
    case 'processing': return 'Processing'
    case 'approved': return 'Approved'
    case 'rejected': return 'Rejected'
    case 'escalated': return 'Escalated'
    case 'no-answer': return 'No Answer'
    case 'failed': return 'Failed'
    case 'timeout': return 'Timeout'
    default: return status
  }
}

export function calculateCallDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  const duration = Math.floor((end - start) / 1000)
  
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}
