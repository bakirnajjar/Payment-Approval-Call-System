import type { Transaction } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatTimestamp, getStatusColor, getStatusLabel } from '@/lib/transaction-utils'

interface AuditLogDialogProps {
  transaction: Transaction | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuditLogDialog({ transaction, open, onOpenChange }: AuditLogDialogProps) {
  if (!transaction) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm sm:text-base">
            Audit Log - {transaction.id}
          </DialogTitle>
          <DialogDescription>
            Complete audit trail of all call events and status changes
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[500px] pr-4">
          <div className="flex flex-col gap-4">
            {transaction.auditLog.map((log, idx) => (
              <div key={idx} className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <Badge className={getStatusColor(log.status)}>
                    {getStatusLabel(log.status)}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
                <p className="text-sm">{log.message}</p>
                {log.metadata && (
                  <div className="p-2 bg-muted rounded text-xs font-mono">
                    {JSON.stringify(log.metadata, null, 2)}
                  </div>
                )}
                {idx < transaction.auditLog.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
