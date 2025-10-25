import type { Transaction } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  CheckCircle, 
  XCircle, 
  Warning, 
  Phone,
  Clock
} from '@phosphor-icons/react'

interface TransactionStatsProps {
  transactions: Transaction[]
}

export function TransactionStats({ transactions }: TransactionStatsProps) {
  const stats = {
    total: transactions.length,
    approved: transactions.filter(t => t.status === 'approved').length,
    rejected: transactions.filter(t => t.status === 'rejected').length,
    pending: transactions.filter(t => 
      ['pending', 'initiating', 'dialing', 'connected', 'playing-message', 'waiting-input', 'processing'].includes(t.status)
    ).length,
    escalated: transactions.filter(t => t.status === 'escalated').length,
    failed: transactions.filter(t => 
      ['timeout', 'no-answer', 'failed'].includes(t.status)
    ).length
  }

  const decisionTotal = stats.approved + stats.rejected + stats.escalated
  const approvalRate = decisionTotal > 0 
    ? ((stats.approved / decisionTotal) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Phone className="text-primary" size={20} />
            <span className="text-2xl font-bold">{stats.total}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Approved
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <CheckCircle className="text-success" size={20} weight="fill" />
            <span className="text-2xl font-bold">{stats.approved}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Rejected
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <XCircle className="text-destructive" size={20} weight="fill" />
            <span className="text-2xl font-bold">{stats.rejected}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            In Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Clock className="text-primary" size={20} />
            <span className="text-2xl font-bold">{stats.pending}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Escalated
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Warning className="text-warning" size={20} weight="fill" />
            <span className="text-2xl font-bold">{stats.escalated}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Approval Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1">
            <span className="text-2xl font-bold">{approvalRate}</span>
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
