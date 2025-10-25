/**
 * Webhook Handler for ACS Events
 * Processes incoming events from Azure Communication Services
 */

import { callService } from './call-service.js'
import { ttsService } from './tts-service.js'
import { storageService } from './storage-service.js'

const MAX_DTMF_ATTEMPTS = 3

class WebhookHandler {
  constructor() {
    this.getTransaction = null
    this.recognitionAttempts = new Map()
  }

  normalizeTone(tone) {
    const value = typeof tone === 'string'
      ? tone.toLowerCase()
      : typeof tone === 'object' && tone !== null && 'tone' in tone
        ? String(tone.tone).toLowerCase()
        : undefined

    switch (value) {
      case '1':
      case 'tone1':
      case 'one':
        return '1'
      case '2':
      case 'tone2':
      case 'two':
        return '2'
      case '0':
      case 'tone0':
      case 'zero':
      case 'toneo':
        return '0'
      case '*':
      case 'tone*':
      case 'asterisk':
      case 'star':
        return '*'
      case '#':
      case 'tone#':
      case 'hash':
      case 'pound':
        return '#'
      default:
        return undefined
    }
  }

  isCallNotFoundError(error) {
    if (!error) return false
    const code = error.code || error.statusCode
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
    return code === '8522' || code === 404 || message.includes('call not found')
  }

  /**
   * Set transaction getter function
   */
  setTransactionGetter(getter) {
    this.getTransaction = getter
  }

  /**
   * Handle incoming ACS event
   */
  async handleEvent(event, transactionId, updateTransaction) {
    const eventType = event.type
    console.log(`📨 Event: ${eventType} for transaction ${transactionId}`)

    try {
      switch (eventType) {
        case 'Microsoft.Communication.CallConnected':
          await this.handleCallConnected(event, transactionId, updateTransaction)
          break

        case 'Microsoft.Communication.PlayCompleted':
          await this.handlePlayCompleted(event, transactionId, updateTransaction)
          break

        case 'Microsoft.Communication.PlayFailed':
          await this.handlePlayFailed(event, transactionId, updateTransaction)
          break

        case 'Microsoft.Communication.PlayStarted':
          await this.handlePlayStarted(event, transactionId)
          break

        case 'Microsoft.Communication.RecognizeCompleted':
          await this.handleRecognizeCompleted(event, transactionId, updateTransaction)
          break

        case 'Microsoft.Communication.RecognizeFailed':
          await this.handleRecognizeFailed(event, transactionId, updateTransaction)
          break

        case 'Microsoft.Communication.CallDisconnected':
          await this.handleCallDisconnected(event, transactionId, updateTransaction)
          break

        case 'Microsoft.Communication.ParticipantsUpdated':
          console.log('👥 Participants updated')
          break

        default:
          console.log(`⚠️  Unhandled event type: ${eventType}`)
      }
    } catch (error) {
      console.error(`❌ Error handling event ${eventType}:`, error)
    }
  }

  /**
   * Handle call connected - play verification message
   */
  async handleCallConnected(event, transactionId, updateTransaction) {
    const callConnectionId = event.data.callConnectionId
    console.log(`✅ Call connected: ${callConnectionId}`)

    callService.updateCallStatus(callConnectionId, 'connected')
    this.recognitionAttempts.delete(callConnectionId)
    
    if (updateTransaction) {
      updateTransaction(transactionId, {
        status: 'connected',
        message: 'Call connected - customer answered'
      })
    }

    try {
      const callConnection = callService.getCallConnection(callConnectionId)
      let callInfo = callService.getCallInfo(callConnectionId)
      const transactionRecord = this.getTransaction?.(transactionId)

      // Fallback: Try to get audio URL from transaction store
      if (!callInfo || !callInfo.audioUrl) {
        console.log('⚠️  Call info not in memory, trying transaction store...')
        if (transactionRecord && transactionRecord.audioUrl) {
          console.log('✅ Found audio URL in transaction store')
          callInfo = callInfo ? { ...callInfo, audioUrl: transactionRecord.audioUrl } : {
            transactionId,
            audioUrl: transactionRecord.audioUrl,
            customerPhone: transactionRecord.customerPhone,
            customerName: transactionRecord.customerName,
            amount: transactionRecord.amount,
            merchantName: transactionRecord.merchantName || transactionRecord.merchant
          }
        }
      }

      if (!callInfo) {
        console.error('❌ Call info not found in memory or transaction store')
        return
      }

      const customerPhone = callInfo.customerPhone || transactionRecord?.customerPhone

      if (!customerPhone) {
        console.error('❌ Unable to determine customer phone for DTMF recognition')
        return
      }

      console.log('🔍 Call info:', JSON.stringify(callInfo, null, 2))

      if (!callInfo.audioUrl) {
        console.error('❌ Audio URL not found in call info')
        console.error('❌ Call info keys:', Object.keys(callInfo))
        return
      }

      // Play the verification message
      console.log('🔊 Playing verification message...')
      console.log('🔊 Audio URL:', callInfo.audioUrl)
      
      if (updateTransaction) {
        updateTransaction(transactionId, {
          status: 'playing-message',
          message: 'Playing TTS verification message'
        })
      }
      
      const playSource = {
        kind: 'fileSource',
        url: callInfo.audioUrl
      }

      console.log('🔊 Play source:', JSON.stringify(playSource, null, 2))

      await callConnection.getCallMedia().playToAll([playSource], {
        operationContext: 'verification_message'
      })

      callService.updateCallStatus(callConnectionId, 'playing_message')

      // Begin listening for DTMF immediately once the call starts
      await this.startDtmfRecognition(callConnectionId, transactionId, customerPhone, updateTransaction)

    } catch (error) {
      console.error('❌ Error playing message:', error)
      await callService.hangupCall(callConnectionId)
    }
  }

  /**
   * Handle play started events to keep call state in sync
   */
  async handlePlayStarted(event, transactionId) {
    const callConnectionId = event.data.callConnectionId
    const operationContext = event.data.operationContext
    const contextLabel = operationContext ?? 'unknown'

    console.log(`▶️ Play started: ${contextLabel}`)

    if (!operationContext || operationContext === 'confirmation_message') {
      // Do not overwrite final transaction state updates during confirmation playback
      return
    }

    if (operationContext === 'verification_message') {
      callService.updateCallStatus(callConnectionId, 'playing_message')
      return
    }

    if (operationContext.startsWith('invalid_prompt')) {
      callService.updateCallStatus(callConnectionId, 'replaying_prompt')
      return
    }

    if (operationContext === 'timeout_message') {
      callService.updateCallStatus(callConnectionId, 'playing_timeout_message')
      return
    }

    callService.updateCallStatus(callConnectionId, 'playing_media')
  }

  /**
   * Handle play completed - start DTMF recognition
   */
  async handlePlayCompleted(event, transactionId, updateTransaction) {
    const callConnectionId = event.data.callConnectionId
    const operationContext = event.data.operationContext

    console.log(`✅ Play completed: ${operationContext}`)

    if (operationContext?.startsWith('invalid_prompt')) {
      callService.updateCallStatus(callConnectionId, 'waiting-input')

      const transaction = this.getTransaction?.(transactionId)
      if (transaction && typeof transaction.customerPhone === 'string') {
        await this.startDtmfRecognition(callConnectionId, transactionId, transaction.customerPhone, updateTransaction)
      } else {
        console.warn('⚠️  Unable to restart DTMF recognition - transaction data missing')
        await callService.hangupCall(callConnectionId)
      }

    } else if (operationContext === 'confirmation_message') {
      // End call after confirmation
      console.log('✅ Confirmation played, ending call...')
      setTimeout(async () => {
        await callService.hangupCall(callConnectionId)
      }, 1000)
    }
  }

  async startDtmfRecognition(callConnectionId, transactionId, customerPhone, updateTransaction) {
    try {
      const callConnection = callService.getCallConnection(callConnectionId)
      const callMedia = callConnection.getCallMedia()
      const attempt = (this.recognitionAttempts.get(callConnectionId) ?? 0) + 1

      this.recognitionAttempts.set(callConnectionId, attempt)

      if (!customerPhone) {
        throw new Error('Customer phone number not provided for DTMF recognition')
      }

      await callMedia.startRecognizing(
        { phoneNumber: customerPhone },
        {
          kind: 'callMediaRecognizeDtmfOptions',
          maxTonesToCollect: 1,
          interToneTimeoutInSeconds: 5,
          initialSilenceTimeoutInSeconds: 15,
          interruptPrompt: false,
          operationContext: `dtmf_menu_${transactionId}_${attempt}`
        }
      )

      const message = attempt === 1
        ? 'Waiting for customer DTMF input'
        : `Re-prompting customer (attempt ${attempt} of ${MAX_DTMF_ATTEMPTS})`

      updateTransaction?.(transactionId, {
        status: 'waiting-input',
        message
      })

    } catch (error) {
      if (this.isCallNotFoundError(error)) {
        console.warn('⚠️  Call ended before DTMF recognition could start')
        this.recognitionAttempts.delete(callConnectionId)
        return
      }

      console.error('❌ Failed to start DTMF recognition:', error)
      updateTransaction?.(transactionId, {
        status: 'failed',
        message: 'Failed to start DTMF recognition',
        error: error.message
      })
      this.recognitionAttempts.delete(callConnectionId)
      try {
        await callService.hangupCall(callConnectionId)
      } catch (hangupError) {
        if (!this.isCallNotFoundError(hangupError)) {
          console.error('❌ Failed to hang up call after recognition error:', hangupError)
        }
      }
    }
  }

  /**
   * Handle play failed
   */
  async handlePlayFailed(event, transactionId, updateTransaction) {
    const callConnectionId = event.data.callConnectionId
    console.error('❌ Play failed for call:', callConnectionId)
    
    callService.updateCallStatus(callConnectionId, 'play_failed')
    this.recognitionAttempts.delete(callConnectionId)

    updateTransaction?.(transactionId, {
      status: 'failed',
      message: 'Prompt playback failed'
    })

    await callService.hangupCall(callConnectionId)
  }

  /**
   * Handle DTMF input received
   */
  async handleRecognizeCompleted(event, transactionId, updateTransaction) {
    const callConnectionId = event.data.callConnectionId
    const recognitionType = event.data.recognitionType

    console.log(`✅ Recognition completed: ${recognitionType}`)

    if (recognitionType === 'dtmf') {
      const dtmfResult = event.data.dtmfResult
      const tones = dtmfResult?.tones || []
      const rawTone = tones[0]
      const normalizedTone = this.normalizeTone(rawTone)

      console.log('🔍 Raw DTMF payload:', JSON.stringify({ rawTone, normalizedTone }))

      if (!normalizedTone) {
        console.log('⚠️  No DTMF tones detected')
        await this.handleNoInput(callConnectionId, transactionId, updateTransaction)
        return
      }

      console.log(`✅ DTMF input received: ${normalizedTone}`)

      if (!['0', '1', '2'].includes(normalizedTone)) {
        await this.handleInvalidInput(callConnectionId, transactionId, updateTransaction)
        return
      }

      callService.updateCallStatus(callConnectionId, 'processing', { dtmfInput: normalizedTone })

      // Determine transaction status based on input
      let transactionStatus
      switch (normalizedTone) {
        case '1':
          transactionStatus = 'approved'
          break
        case '2':
          transactionStatus = 'rejected'
          break
        case '0':
          transactionStatus = 'escalated'
          break
        default:
          transactionStatus = 'failed'
      }

      console.log(`📝 Transaction status: ${transactionStatus}`)

      updateTransaction?.(transactionId, {
        status: transactionStatus,
        dtmfInput: normalizedTone,
        message: `Customer selected option ${normalizedTone}`
      })

      this.recognitionAttempts.delete(callConnectionId)

      // Generate and play confirmation message
      await this.playConfirmation(callConnectionId, transactionId, normalizedTone)

      // TODO: Update transaction in database
      // await updateTransactionInDatabase(transactionId, transactionStatus, input)
    }
  }

  async handleInvalidInput(callConnectionId, transactionId, updateTransaction) {
    const attempts = this.recognitionAttempts.get(callConnectionId) ?? 1

    if (attempts >= MAX_DTMF_ATTEMPTS) {
      console.log('⚠️  Maximum invalid DTMF attempts reached')
      updateTransaction?.(transactionId, {
        status: 'failed',
        message: 'Maximum invalid DTMF inputs received'
      })
      await this.handleNoInput(callConnectionId, transactionId, updateTransaction)
      return
    }

    try {
      const retryMessage = 'The option you selected is not valid. Press 1 to approve the transaction, press 2 to decline it, or press 0 if this was not you.'
      const audioBuffer = await ttsService.synthesizeToAudio(retryMessage)
      const audioUrl = await storageService.saveAudioFile(audioBuffer, `invalid_${transactionId}_${attempts}`)

      const callConnection = callService.getCallConnection(callConnectionId)
      await callConnection.getCallMedia().playToAll([
        {
          kind: 'fileSource',
          url: audioUrl
        }
      ], {
        operationContext: `invalid_prompt_${attempts}`
      })

      updateTransaction?.(transactionId, {
        status: 'waiting-input',
        message: `Invalid input received - re-prompting (${attempts}/${MAX_DTMF_ATTEMPTS})`
      })
    } catch (error) {
      if (this.isCallNotFoundError(error)) {
        console.warn('⚠️  Call ended before invalid input prompt completed')
        this.recognitionAttempts.delete(callConnectionId)
        return
      }

      console.error('❌ Error handling invalid input:', error)
      updateTransaction?.(transactionId, {
        status: 'failed',
        message: 'Failed while re-prompting customer',
        error: error.message
      })
      try {
        await callService.hangupCall(callConnectionId)
      } catch (hangupError) {
        if (!this.isCallNotFoundError(hangupError)) {
          console.error('❌ Failed to hang up after invalid input error:', hangupError)
        }
      }
    }
  }

  /**
   * Handle recognition failed
   */
  async handleRecognizeFailed(event, transactionId, updateTransaction) {
    const callConnectionId = event.data.callConnectionId
    console.error('❌ Recognition failed:', event.data)
    
    updateTransaction?.(transactionId, {
      status: 'failed',
      message: 'DTMF recognition failed'
    })

    await this.handleNoInput(callConnectionId, transactionId, updateTransaction)
  }

  /**
   * Handle no input received
   */
  async handleNoInput(callConnectionId, transactionId, updateTransaction) {
    console.log('⚠️  No input received - timeout')

    callService.updateCallStatus(callConnectionId, 'timeout')
    this.recognitionAttempts.delete(callConnectionId)

    try {
      // Play timeout message
      const timeoutMessage = "We did not receive your response. Please call us back if you have any questions. Goodbye."
      
      const audioBuffer = await ttsService.synthesizeToAudio(timeoutMessage)
      const audioUrl = await storageService.saveAudioFile(audioBuffer, `timeout_${transactionId}`)

      const callConnection = callService.getCallConnection(callConnectionId)
      
      const playSource = {
        kind: 'fileSource',
        url: audioUrl
      }

      await callConnection.getCallMedia().playToAll([playSource], {
        operationContext: 'timeout_message'
      })

      if (updateTransaction) {
        updateTransaction(transactionId, {
          status: 'timeout',
          message: 'No DTMF input received'
        })
      }

      // End call after timeout message
      setTimeout(async () => {
        try {
          await callService.hangupCall(callConnectionId)
        } catch (hangupError) {
          if (!this.isCallNotFoundError(hangupError)) {
            console.error('❌ Failed to hang up during timeout handling:', hangupError)
          }
        }
      }, 3000)

    } catch (error) {
      if (this.isCallNotFoundError(error)) {
        console.warn('⚠️  Call ended before timeout message could be played')
        this.recognitionAttempts.delete(callConnectionId)
        return
      }

      console.error('❌ Error handling timeout:', error)
      try {
        await callService.hangupCall(callConnectionId)
      } catch (hangupError) {
        if (!this.isCallNotFoundError(hangupError)) {
          console.error('❌ Failed to hang up after timeout error:', hangupError)
        }
      }
    }
  }

  /**
   * Play confirmation message
   */
  async playConfirmation(callConnectionId, transactionId, dtmfInput) {
    try {
      console.log(`🔊 Playing confirmation for input: ${dtmfInput}`)

      const confirmationMessage = callService.generateConfirmationMessage(dtmfInput)
      
      // Generate TTS audio for confirmation
      const audioBuffer = await ttsService.synthesizeToAudio(confirmationMessage)
      const audioUrl = await storageService.saveAudioFile(audioBuffer, `confirm_${transactionId}_${dtmfInput}`)

      const callConnection = callService.getCallConnection(callConnectionId)
      
      const playSource = {
        kind: 'fileSource',
        url: audioUrl
      }

      await callConnection.getCallMedia().playToAll([playSource], {
        operationContext: 'confirmation_message'
      })

      callService.updateCallStatus(callConnectionId, 'confirmed')

    } catch (error) {
      console.error('❌ Error playing confirmation:', error)
      await callService.hangupCall(callConnectionId)
    }
  }

  /**
   * Handle call disconnected
   */
  async handleCallDisconnected(event, transactionId, updateTransaction) {
    const callConnectionId = event.data.callConnectionId
    console.log(`📞 Call disconnected: ${callConnectionId}`)

    callService.updateCallStatus(callConnectionId, 'disconnected')
    this.recognitionAttempts.delete(callConnectionId)

    if (updateTransaction) {
      updateTransaction(transactionId, {
        message: 'Call disconnected',
        callEndedAt: new Date().toISOString()
      })
    }
    
    // Cleanup after a delay
    setTimeout(() => {
      callService.removeCall(callConnectionId)
      console.log(`🗑️  Cleaned up call: ${callConnectionId}`)
    }, 60000) // Keep for 1 minute for status queries
  }
}

export const webhookHandler = new WebhookHandler()
