/**
 * Azure Communication Services Backend Server
 * Handles real outbound phone calls with TTS and DTMF input
 */

import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { callService } from './services/call-service.js'
import { webhookHandler } from './services/webhook-handler.js'
import { existsSync, mkdirSync } from 'fs'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 3001

// Middleware
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.text({ type: 'text/plain' }))

// Create audio directory if it doesn't exist
const audioDir = join(__dirname, 'audio')
if (!existsSync(audioDir)) {
  mkdirSync(audioDir, { recursive: true })
}

// Serve audio files
app.use('/audio', express.static(audioDir))

// In-memory transaction store (for demo - use database in production)
const transactions = new Map()

// Set transaction getter for webhook handler
webhookHandler.setTransactionGetter((transactionId) => transactions.get(transactionId))

export function updateTransaction(transactionId, updates) {
  const existing = transactions.get(transactionId) || {}
  const updated = { ...existing, ...updates, lastUpdated: new Date().toISOString() }

  if (updated.merchant === undefined && updated.merchantName) {
    updated.merchant = updated.merchantName
  }
  
  // Append to audit log if message provided
  if (updates.message) {
    const auditLog = existing.auditLog || []
    auditLog.push({
      timestamp: new Date().toISOString(),
      status: updates.status || existing.status,
      message: updates.message,
      metadata: updates.metadata
    })
    updated.auditLog = auditLog
  }
  
  transactions.set(transactionId, updated)
  console.log(`📝 Transaction ${transactionId} updated:`, updates.status || 'state change')
  return updated
}

// Health check with ACS status
app.get('/health', async (req, res) => {
  try {
    const healthStatus = callService.getHealthStatus()
    const connectivity = await callService.testConnectivity()
    
    res.json({ 
      status: 'healthy',
      service: 'ACS Backend',
      timestamp: new Date().toISOString(),
      acs: {
        ...healthStatus,
        connectivity
      }
    })
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'ACS Backend', 
      timestamp: new Date().toISOString(),
      error: error.message
    })
  }
})

// Initiate outbound call
app.post('/api/calls/initiate', async (req, res) => {
  try {
    console.log('📞 Incoming call request:', req.body)

    const { transactionId, customerPhone, customerName, amount, merchantName, currency, merchant } = req.body
    const transactionCurrency = currency || 'USD'
    const resolvedMerchant = merchantName || merchant

    if (!transactionId || !customerPhone || !customerName) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['transactionId', 'customerPhone', 'customerName', 'amount', 'merchantName', 'currency']
      })
    }

    // Initialize transaction state
    updateTransaction(transactionId, {
      id: transactionId,
      customerPhone,
      customerName,
      amount,
      merchantName: resolvedMerchant,
      merchant: resolvedMerchant,
      currency: transactionCurrency,
      status: 'initiating',
      callStartedAt: new Date().toISOString(),
      auditLog: [{
        timestamp: new Date().toISOString(),
        status: 'initiating',
        message: 'Call initiation request received'
      }]
    })

    const result = await callService.initiateCall({
      transactionId,
      customerPhone,
      customerName,
      amount,
      merchantName: resolvedMerchant,
      currency: transactionCurrency
    })

    // Update transaction with call connection ID and audio URL
    updateTransaction(transactionId, {
      callConnectionId: result.callConnectionId,
      audioUrl: result.audioUrl,
      status: 'dialing'
    })

    console.log('✅ Call initiated:', result.callConnectionId)

    res.json({
      success: true,
      callConnectionId: result.callConnectionId,
      transactionId,
      status: 'initiated'
    })

  } catch (error) {
    console.error('❌ Error initiating call:', error)
    
    // Update transaction with error
    if (req.body.transactionId) {
      updateTransaction(req.body.transactionId, {
        status: 'failed',
        error: error.message,
        callEndedAt: new Date().toISOString()
      })
    }
    
    res.status(500).json({
      error: 'Failed to initiate call',
      message: error.message
    })
  }
})

// Webhook endpoint for ACS events
app.post('/api/callbacks/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params
    const events = Array.isArray(req.body) ? req.body : [req.body]

    console.log(`📨 Webhook received for transaction ${transactionId}:`, events.length, 'events')

    for (const event of events) {
      await webhookHandler.handleEvent(event, transactionId, updateTransaction)
    }

    res.status(200).send('OK')

  } catch (error) {
    console.error('❌ Webhook error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get call status by transaction ID
app.get('/api/calls/:transactionId/status', async (req, res) => {
  try {
    const { transactionId } = req.params
    const transaction = transactions.get(transactionId)
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' })
    }
    
    res.json({ 
      transaction,
      found: true 
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get call status by call connection ID (legacy)
app.get('/api/calls/connection/:callConnectionId/status', async (req, res) => {
  try {
    const { callConnectionId } = req.params
    const status = await callService.getCallStatus(callConnectionId)
    
    res.json(status)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Hang up call
app.post('/api/calls/:callConnectionId/hangup', async (req, res) => {
  try {
    const { callConnectionId } = req.params
    await callService.hangupCall(callConnectionId)
    
    res.json({ success: true, message: 'Call ended' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           Azure Communication Services Backend Server            ║
╚══════════════════════════════════════════════════════════════════╝

✅ Server running on port ${PORT}
📞 Ready to handle real phone calls
🔊 TTS integration active
🌐 Callback URL: ${process.env.CALLBACK_BASE_URL || 'http://localhost:' + PORT}

Endpoints:
  POST /api/calls/initiate              - Initiate outbound call
  POST /api/callbacks/:transactionId    - ACS webhook handler
  GET  /api/calls/:id/status            - Get call status
  POST /api/calls/:id/hangup            - Hang up call
  GET  /health                          - Health check
  GET  /audio/:filename                 - Serve audio files

Ready for requests...
`)
})
