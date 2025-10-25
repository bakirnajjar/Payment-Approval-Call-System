import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TransactionFormData } from '@/lib/types'
import { Phone } from '@phosphor-icons/react'

interface TransactionFormProps {
  onSubmit: (data: TransactionFormData) => void
  isSubmitting: boolean
}

export function TransactionForm({ onSubmit, isSubmitting }: TransactionFormProps) {
  const [formData, setFormData] = useState<TransactionFormData>({
    amount: '',
    currency: 'AED',
    merchant: '',
    customerName: '',
    customerPhone: ''
  })

  const [errors, setErrors] = useState<Partial<TransactionFormData>>({})

  const validate = (): boolean => {
    const newErrors: Partial<TransactionFormData> = {}

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Amount must be greater than 0'
    }

    if (!formData.merchant.trim()) {
      newErrors.merchant = 'Merchant name is required'
    }

    if (!formData.customerName.trim()) {
      newErrors.customerName = 'Customer name is required'
    }

    if (!formData.customerPhone.trim()) {
      newErrors.customerPhone = 'Phone number is required'
    } else if (!/^\+?[1-9]\d{1,14}$/.test(formData.customerPhone.replace(/\s/g, ''))) {
      newErrors.customerPhone = 'Invalid phone number format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onSubmit(formData)
    }
  }

  const handleChange = (field: keyof TransactionFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Transaction Verification</CardTitle>
        <CardDescription>
          Initiate a phone call to verify a customer transaction
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex flex-col gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="100.00"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                disabled={isSubmitting}
              />
              {errors.amount && (
                <span className="text-sm text-destructive">{errors.amount}</span>
              )}
            </div>

            <div className="w-full sm:w-32 flex flex-col gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => handleChange('currency', value)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="SAR">SAR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="merchant">Merchant</Label>
            <Input
              id="merchant"
              placeholder="noon.com"
              value={formData.merchant}
              onChange={(e) => handleChange('merchant', e.target.value)}
              disabled={isSubmitting}
            />
            {errors.merchant && (
              <span className="text-sm text-destructive">{errors.merchant}</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="customerName">Customer Name</Label>
            <Input
              id="customerName"
              placeholder="Ahmed Al Mansoori"
              value={formData.customerName}
              onChange={(e) => handleChange('customerName', e.target.value)}
              disabled={isSubmitting}
            />
            {errors.customerName && (
              <span className="text-sm text-destructive">{errors.customerName}</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="customerPhone">Customer Phone</Label>
            <Input
              id="customerPhone"
              type="tel"
              placeholder="+971501234567"
              value={formData.customerPhone}
              onChange={(e) => handleChange('customerPhone', e.target.value)}
              disabled={isSubmitting}
            />
            {errors.customerPhone && (
              <span className="text-sm text-destructive">{errors.customerPhone}</span>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            <Phone className="mr-2" />
            {isSubmitting ? 'Initiating Call...' : 'Initiate Verification Call'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
