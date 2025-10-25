/**
 * Azure Communication Services Call Service
 * Handles real outbound phone calls
 */

import { CallAutomationClient } from '@azure/communication-call-automation'
import dotenv from 'dotenv'
import { ttsService } from './tts-service.js'
import { storageService } from './storage-service.js'

// Load environment variables
dotenv.config()

const ACS_CONNECTION_STRING = process.env.ACS_CONNECTION_STRING
const ACS_PHONE_NUMBER = process.env.ACS_PHONE_NUMBER
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL || `http://localhost:${process.env.PORT || 3001}`

// Validate configuration on startup
function validateACSConfiguration() {
  const missing = []
  
  if (!ACS_CONNECTION_STRING) missing.push('ACS_CONNECTION_STRING')
  if (!ACS_PHONE_NUMBER) missing.push('ACS_PHONE_NUMBER')
  
  if (missing.length > 0) {
    console.warn('⚠️  Missing ACS configuration:', missing.join(', '))
    console.warn('   Set these environment variables to enable real phone calls')
    return false
  }
  
  console.log('✅ ACS Configuration validated')
  return true
}

// Initialize ACS client only if properly configured
let callAutomationClient = null
const isACSConfigured = validateACSConfiguration()

if (isACSConfigured) {
  try {
    callAutomationClient = new CallAutomationClient(ACS_CONNECTION_STRING)
    console.log('✅ ACS Call Automation Client initialized')
  } catch (error) {
    console.error('❌ Failed to initialize ACS client:', error)
  }
}

// Store active calls
const activeCalls = new Map()

class CallService {
  /**
   * Initiate an outbound call to a customer
   */
  async initiateCall({ transactionId, customerPhone, customerName, amount, merchantName }) {
    try {
      console.log(`📞 Initiating call to ${customerPhone} for transaction ${transactionId}`)

      // Validate ACS client is available
      if (!callAutomationClient) {
        throw new Error('ACS Call Automation Client not initialized. Please check your ACS configuration.')
      }

      // Validate required environment variables
      if (!ACS_CONNECTION_STRING || !ACS_PHONE_NUMBER) {
        throw new Error('Missing required ACS configuration: ACS_CONNECTION_STRING and ACS_PHONE_NUMBER must be set')
      }

      // Validate phone number format
      if (!customerPhone.startsWith('+')) {
        throw new Error('Customer phone number must be in E.164 format (e.g., +14155551234)')
      }

      // Generate verification message
      const message = this.generateVerificationMessage(customerName, amount, merchantName)
      console.log(`💬 Generated message: "${message}"`)

      // Generate TTS audio
      console.log('🔊 Generating TTS audio...')
      const audioBuffer = await ttsService.synthesizeToAudio(message)
      
      // Upload audio to accessible location
      const audioUrl = await storageService.saveAudioFile(audioBuffer, `verification_${transactionId}`)
      console.log(`✅ Audio uploaded: ${audioUrl}`)

      // Prepare call invitation using proper ACS Call Automation format
      const callInvite = {
        targetParticipant: { phoneNumber: customerPhone },
        sourceCallIdNumber: { phoneNumber: ACS_PHONE_NUMBER }
      }

      // Callback URL for this specific transaction
      const callbackUri = `${CALLBACK_BASE_URL}/api/callbacks/${transactionId}`
      console.log(`🔗 Callback URI: ${callbackUri}`)

      // Create call options with cognitive services integration
      const createCallOptions = {
        operationContext: transactionId,
        callIntelligenceOptions: {
          cognitiveServicesEndpoint: process.env.AZURE_TTS_ENDPOINT || process.env.COGNITIVE_SERVICES_ENDPOINT
        }
      }

      // Create the call using correct ACS Call Automation API format
      console.log(`📞 Dialing ${customerPhone}...`)
      
      const result = await callAutomationClient.createCall(
        callInvite,
        callbackUri,
        createCallOptions
      )

      const callConnectionId = result.callConnectionProperties.callConnectionId

      // Store call information
      activeCalls.set(callConnectionId, {
        transactionId,
        customerPhone,
        customerName,
        amount,
        merchantName,
        audioUrl,
        status: 'initiated',
        callConnectionId,
        startTime: new Date().toISOString()
      })

      console.log(`✅ Call created with ID: ${callConnectionId}`)
      console.log(`🔍 Stored call info with audio URL: ${audioUrl}`)
      console.log(`🔍 Total active calls: ${activeCalls.size}`)

      return {
        callConnectionId,
        transactionId,
        audioUrl,
        status: 'initiated'
      }

    } catch (error) {
      console.error('❌ Failed to initiate call:', error)
      throw error
    }
  }

  /**
   * Get call connection
   */
  getCallConnection(callConnectionId) {
    return callAutomationClient.getCallConnection(callConnectionId)
  }

  /**
   * Get call information
   */
  getCallInfo(callConnectionId) {
    const info = activeCalls.get(callConnectionId)
    console.log(`🔍 Getting call info for ${callConnectionId}:`, info ? 'Found' : 'NOT FOUND')
    console.log(`🔍 Active calls in memory: ${activeCalls.size}`)
    console.log(`🔍 Active call IDs:`, Array.from(activeCalls.keys()))
    return info
  }

  /**
   * Update call status
   */
  updateCallStatus(callConnectionId, status, data = {}) {
    const callInfo = activeCalls.get(callConnectionId)
    if (callInfo) {
      activeCalls.set(callConnectionId, {
        ...callInfo,
        status,
        ...data,
        lastUpdate: new Date().toISOString()
      })
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callConnectionId) {
    try {
      const callConnection = this.getCallConnection(callConnectionId)
      const properties = await callConnection.getCallConnectionProperties()
      const callInfo = activeCalls.get(callConnectionId)

      return {
        callConnectionId,
        callState: properties.callConnectionState,
        localInfo: callInfo,
        properties
      }
    } catch (error) {
      console.error('Error getting call status:', error)
      throw error
    }
  }

  /**
   * Hang up a call
   */
  async hangupCall(callConnectionId) {
    try {
      const callConnection = this.getCallConnection(callConnectionId)
      await callConnection.hangUp(true)
      
      this.updateCallStatus(callConnectionId, 'ended')
      console.log(`✅ Call ${callConnectionId} ended`)

    } catch (error) {
      console.error('Error hanging up call:', error)
      throw error
    }
  }

  /**
   * Generate verification message
   */
  generateVerificationMessage(customerName, amount, merchantName) {
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)

    return `
      Hello ${customerName}. 
      This is an automated call from your bank's fraud prevention system.
      We detected a transaction of ${formattedAmount} at ${merchantName}.
      If you authorized this transaction, press 1.
      If you did not authorize this transaction, press 2.
      If this call is not for you, press 0.
      Please make your selection now.
    `.trim().replace(/\s+/g, ' ')
  }

  /**
   * Generate confirmation message based on DTMF input
   */
  generateConfirmationMessage(dtmfInput) {
    switch (dtmfInput) {
      case '1':
        return 'Thank you. Your transaction has been approved. Have a great day.'
      case '2':
        return 'Thank you for alerting us. Your transaction has been blocked and our fraud team will contact you shortly.'
      case '0':
        return 'We apologize for the inconvenience. We have noted that this call was not for you. Goodbye.'
      default:
        return 'Invalid input. Goodbye.'
    }
  }

  /**
   * Remove call from active calls
   */
  removeCall(callConnectionId) {
    activeCalls.delete(callConnectionId)
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      acsConfigured: isACSConfigured,
      clientInitialized: !!callAutomationClient,
      activeCalls: activeCalls.size,
      configuration: {
        hasConnectionString: !!ACS_CONNECTION_STRING,
        hasPhoneNumber: !!ACS_PHONE_NUMBER,
        phoneNumber: ACS_PHONE_NUMBER ? `${ACS_PHONE_NUMBER.slice(0, 4)}***${ACS_PHONE_NUMBER.slice(-4)}` : null,
        callbackBaseUrl: CALLBACK_BASE_URL
      }
    }
  }

  /**
   * Test ACS connectivity
   */
  async testConnectivity() {
    if (!callAutomationClient) {
      return { success: false, error: 'ACS client not initialized' }
    }

    try {
      // This is a simple test - in production you might want to test with a test call
      return { 
        success: true, 
        message: 'ACS client is initialized and ready',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

export const callService = new CallService()
