export type TransactionStatus = 
  | 'pending'
  | 'initiating'
  | 'dialing'
  | 'connected'
  | 'playing-message'
  | 'waiting-input'
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'no-answer'
  | 'failed'
  | 'timeout'

export type DTMFInput = '0' | '1' | '2' | null

export interface Transaction {
  id: string
  amount: number
  currency: string
  merchant: string
  customerName: string
  customerPhone: string
  status: TransactionStatus
  dtmfInput: DTMFInput
  createdAt: string
  updatedAt: string
  callStartedAt?: string
  callEndedAt?: string
  retryCount: number
  auditLog: AuditLogEntry[]
  audioUrl?: string
  callConnectionId?: string
  error?: string
}

export interface AuditLogEntry {
  timestamp: string
  status: TransactionStatus
  message: string
  metadata?: Record<string, unknown>
}

export interface TransactionFormData {
  amount: string
  currency: string
  merchant: string
  customerName: string
  customerPhone: string
}

export interface CallScript {
  transactionId: string
  text: string
  audioUrl?: string
}
