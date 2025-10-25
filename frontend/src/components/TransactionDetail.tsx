import type { Transaction } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  formatPhoneNumber, 
  formatCurrency, 
  formatTimestamp, 
  getStatusColor,
  getStatusLabel,
  calculateCallDuration,
  generateCallScript
} from '@/lib/transaction-utils'
import { 
  Phone, 
  CheckCircle, 
  XCircle, 
  Warning,
  Clock,
  ArrowClockwise,
  FileText
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface TransactionDetailProps {
  transaction: Transaction
  onRetry?: (transaction: Transaction) => void
  onViewAudit?: (transaction: Transaction) => void
}

export function TransactionDetail({ transaction, onRetry, onViewAudit }: TransactionDetailProps) {
  const isActive = ['dialing', 'connected', 'playing-message', 'waiting-input', 'processing'].includes(transaction.status)
  const isFinal = ['approved', 'rejected', 'escalated', 'timeout', 'no-answer', 'failed'].includes(transaction.status)
  const canRetry = ['timeout', 'no-answer', 'failed'].includes(transaction.status) && transaction.retryCount < 3
  
  const script = generateCallScript(transaction)
  
  const getStatusIcon = () => {
    switch (transaction.status) {
      case 'approved':
        return <CheckCircle className="text-success" weight="fill" />
      case 'rejected':
      case 'failed':
        return <XCircle className="text-destructive" weight="fill" />
      case 'escalated':
      case 'timeout':
      case 'no-answer':
        return <Warning className="text-warning" weight="fill" />
      case 'dialing':
      case 'connected':
      case 'playing-message':
      case 'waiting-input':
      case 'processing':
        return <Phone className="text-primary animate-pulse" weight="fill" />
      default:
        return <Clock className="text-muted-foreground" />
    }
  }

  return (
    <Card className={cn(
      "transition-all duration-300",
      isActive && "border-2 animate-pulse-border"
    )}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-mono text-sm sm:text-lg">
                {transaction.id}
              </CardTitle>
              {getStatusIcon()}
            </div>
            <Badge className={cn("w-fit", getStatusColor(transaction.status))}>
              {getStatusLabel(transaction.status)}
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {canRetry && onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRetry(transaction)}
              >
                <ArrowClockwise className="mr-2" />
                Retry ({transaction.retryCount}/3)
              </Button>
            )}
            {onViewAudit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewAudit(transaction)}
              >
                <FileText className="mr-2" />
                Audit Log
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Customer</span>
            <span className="font-medium">{transaction.customerName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Phone</span>
            <span className="font-mono text-sm">{formatPhoneNumber(transaction.customerPhone)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Amount</span>
            <span className="font-semibold text-lg">
              {formatCurrency(transaction.amount, transaction.currency)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Merchant</span>
            <span className="font-medium">{transaction.merchant}</span>
          </div>
        </div>

        {transaction.dtmfInput && (
          <>
            <Separator />
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Customer Response</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-bold">
                  {transaction.dtmfInput}
                </span>
                <span className="text-sm">
                  {transaction.dtmfInput === '1' && '(Approved)'}
                  {transaction.dtmfInput === '2' && '(Rejected)'}
                  {transaction.dtmfInput === '0' && '(It\'s Not Me)'}
                </span>
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted-foreground">Call Script (TTS)</span>
          <div className="p-3 bg-muted rounded-md text-sm leading-relaxed">
            {script.text}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Created</span>
            <span className="font-mono text-xs">
              {formatTimestamp(transaction.createdAt)}
            </span>
          </div>
          {transaction.callStartedAt && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Call Started</span>
              <span className="font-mono text-xs">
                {formatTimestamp(transaction.callStartedAt)}
              </span>
            </div>
          )}
          {transaction.callEndedAt && transaction.callStartedAt && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-mono">
                {calculateCallDuration(transaction.callStartedAt, transaction.callEndedAt)}
              </span>
            </div>
          )}
        </div>

        {isFinal && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Recent Activity</span>
              <ScrollArea className="h-32 rounded-md border p-3">
                <div className="flex flex-col gap-2">
                  {transaction.auditLog.slice(-5).reverse().map((log, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="w-fit text-xs">
                          {getStatusLabel(log.status)}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
