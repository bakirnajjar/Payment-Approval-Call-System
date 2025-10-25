import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import type { Transaction, TransactionFormData } from '@/lib/types'
import { TransactionForm } from '@/components/TransactionForm'
import { TransactionDetail } from '@/components/TransactionDetail'
import { TransactionStats } from '@/components/TransactionStats'
import { AuditLogDialog } from '@/components/AuditLogDialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { createTransaction } from '@/lib/transaction-utils'
import { callService } from '@/lib/call-service'
import { toast } from 'sonner'
import { Phone, CheckCircle, Clock, ListBullets } from '@phosphor-icons/react'

function App() {
  const [transactions, setTransactions] = useKV<Transaction[]>('transactions', [])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedTab, setSelectedTab] = useState('new')
  const [auditTransaction, setAuditTransaction] = useState<Transaction | null>(null)
  const [auditDialogOpen, setAuditDialogOpen] = useState(false)

  const safeTransactions = transactions || []

  useEffect(() => {
    const unsubscribers: Array<() => void> = []

    safeTransactions.forEach(transaction => {
      if (!['approved', 'rejected', 'escalated', 'timeout', 'no-answer', 'failed'].includes(transaction.status)) {
        const unsubscribe = callService.subscribe(transaction.id, (updatedTransaction) => {
          setTransactions(currentTransactions => 
            (currentTransactions || []).map(t => 
              t.id === updatedTransaction.id ? updatedTransaction : t
            )
          )
        })
        unsubscribers.push(unsubscribe)
      }
    })

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [safeTransactions.map(t => t.id).join(','), setTransactions])

  const handleFormSubmit = async (formData: TransactionFormData) => {
    setIsSubmitting(true)
    
    try {
      const transaction = createTransaction(formData)
      
      setTransactions(currentTransactions => [transaction, ...(currentTransactions || [])])
      
      toast.success('Transaction created', {
        description: `Verification call initiated for ${transaction.customerName}`
      })
      
      setSelectedTab('active')
      
      setTimeout(() => {
        callService.initiateCall(transaction)
      }, 500)
      
    } catch (error) {
      toast.error('Failed to create transaction', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRetry = (transaction: Transaction) => {
    toast.info('Retrying call', {
      description: `Attempt ${transaction.retryCount + 1}/3`
    })
    callService.retryCall(transaction)
  }

  const handleViewAudit = (transaction: Transaction) => {
    setAuditTransaction(transaction)
    setAuditDialogOpen(true)
  }

  const activeTransactions = safeTransactions.filter(t => 
    ['dialing', 'connected', 'playing-message', 'waiting-input', 'processing'].includes(t.status)
  )

  const completedTransactions = safeTransactions.filter(t => 
    ['approved', 'rejected', 'escalated', 'timeout', 'no-answer', 'failed'].includes(t.status)
  )

  const pendingTransactions = safeTransactions.filter(t => 
    ['pending', 'initiating'].includes(t.status)
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              Payment Approval Call System
            </h1>
            <p className="text-muted-foreground">
              Azure Communication Services - Transaction Verification via Phone Call with DTMF Input
            </p>
          </div>

          <Alert>
            <Phone className="h-4 w-4" />
            <AlertTitle>Demo Mode</AlertTitle>
            <AlertDescription>
              This is a working demonstration of the ACS call automation workflow. 
              In production, this would integrate with Azure Communication Services backend APIs, 
              real phone numbers, and your core banking system.
            </AlertDescription>
          </Alert>

          <TransactionStats transactions={safeTransactions} />

          <Separator />

          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="new" className="flex items-center gap-2">
                <Phone size={16} />
                <span className="hidden sm:inline">New Call</span>
              </TabsTrigger>
              <TabsTrigger value="active" className="flex items-center gap-2">
                <Clock size={16} />
                <span className="hidden sm:inline">Active</span>
                {activeTransactions.length > 0 && (
                  <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
                    {activeTransactions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <ListBullets size={16} />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="flex flex-col gap-6 mt-6">
              <TransactionForm onSubmit={handleFormSubmit} isSubmitting={isSubmitting} />
            </TabsContent>

            <TabsContent value="active" className="flex flex-col gap-6 mt-6">
              {pendingTransactions.length > 0 && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Clock />
                    Pending Initiation
                  </h3>
                  {pendingTransactions.map(transaction => (
                    <TransactionDetail 
                      key={transaction.id} 
                      transaction={transaction}
                      onViewAudit={handleViewAudit}
                    />
                  ))}
                </div>
              )}

              {activeTransactions.length > 0 && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Phone className="animate-pulse" />
                    Active Calls
                  </h3>
                  {activeTransactions.map(transaction => (
                    <TransactionDetail 
                      key={transaction.id} 
                      transaction={transaction}
                      onViewAudit={handleViewAudit}
                    />
                  ))}
                </div>
              )}

              {activeTransactions.length === 0 && pendingTransactions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Phone className="text-muted-foreground mb-4" size={48} />
                  <h3 className="text-lg font-medium mb-2">No Active Calls</h3>
                  <p className="text-sm text-muted-foreground">
                    Create a new transaction to initiate a verification call
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="flex flex-col gap-6 mt-6">
              {completedTransactions.length > 0 ? (
                <div className="flex flex-col gap-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <CheckCircle />
                    Completed Calls ({completedTransactions.length})
                  </h3>
                  {completedTransactions.map(transaction => (
                    <TransactionDetail 
                      key={transaction.id} 
                      transaction={transaction}
                      onRetry={handleRetry}
                      onViewAudit={handleViewAudit}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ListBullets className="text-muted-foreground mb-4" size={48} />
                  <h3 className="text-lg font-medium mb-2">No Transaction History</h3>
                  <p className="text-sm text-muted-foreground">
                    Completed transactions will appear here
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AuditLogDialog 
        transaction={auditTransaction}
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
      />
    </div>
  )
}

export default App