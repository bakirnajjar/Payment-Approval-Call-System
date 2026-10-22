// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { Transaction } from './lib/types'

const mocks = vi.hoisted(() => ({
  initiateCall: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
  success: vi.fn()
}))

vi.mock('@github/spark/hooks', () => ({
  useKV: (_key: string, initial: Transaction[]) => useState(initial)
}))
vi.mock('./lib/call-service', () => ({
  callService: { initiateCall: mocks.initiateCall, subscribe: mocks.subscribe }
}))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: vi.fn() } }))

import App from './App'

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('stores a submitted transaction through Spark KV, shows it in Active, and initiates its call', async () => {
  render(<App />)
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '35.25' } })
  fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: 'Shop' } })
  fireEvent.change(screen.getByLabelText('Customer Name'), { target: { value: 'Alex' } })
  fireEvent.change(screen.getByLabelText('Customer Phone'), { target: { value: '+971501234567' } })
  fireEvent.click(screen.getByRole('button', { name: 'Initiate Verification Call' }))

  expect(await screen.findByText('Pending Initiation')).toBeTruthy()
  expect(screen.getByText('AED 35.25')).toBeTruthy()
  expect(mocks.success).toHaveBeenCalledWith('Transaction created', expect.any(Object))
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled())
  await waitFor(() => expect(mocks.initiateCall).toHaveBeenCalledOnce(), { timeout: 1500 })
  expect(mocks.initiateCall.mock.calls[0][0]).toMatchObject({
    amount: 35.25, currency: 'AED', merchant: 'Shop', customerName: 'Alex',
    customerPhone: '+971501234567', status: 'pending', retryCount: 0
  })
})
