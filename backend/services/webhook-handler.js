/**
 * Webhook Handler for ACS Events
 * Processes incoming events from Azure Communication Services
 */

import { callService } from './call-service.js'
import { ttsService } from './tts-service.js'
import { storageService } from './storage-service.js'

class WebhookHandler {
  constructor() {
    this.getTransaction = null
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
    
    if (updateTransaction) {
      updateTransaction(transactionId, {
        status: 'connected',
        message: 'Call connected - customer answered'
      })
    }

    try {
      const callConnection = callService.getCallConnection(callConnectionId)
      let callInfo = callService.getCallInfo(callConnectionId)

      // Fallback: Try to get audio URL from transaction store
      if (!callInfo || !callInfo.audioUrl) {
        console.log('⚠️  Call info not in memory, trying transaction store...')
        if (this.getTransaction) {
          const transaction = this.getTransaction(transactionId)
          if (transaction && transaction.audioUrl) {
            console.log('✅ Found audio URL in transaction store')
            callInfo = callInfo ? { ...callInfo, audioUrl: transaction.audioUrl } : {
              transactionId,
              audioUrl: transaction.audioUrl,
              customerPhone: transaction.customerPhone,
              customerName: transaction.customerName,
              amount: transaction.amount,
              merchantName: transaction.merchantName || transaction.merchant
            }
          }
        }
      }

      if (!callInfo) {
        console.error('❌ Call info not found in memory or transaction store')
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

    } catch (error) {
      console.error('❌ Error playing message:', error)
      await callService.hangupCall(callConnectionId)
    }
  }

  /**
   * Handle play completed - start DTMF recognition
   */
  async handlePlayCompleted(event, transactionId, updateTransaction) {
    const callConnectionId = event.data.callConnectionId
    const operationContext = event.data.operationContext

    console.log(`✅ Play completed: ${operationContext}`)

    if (operationContext === 'verification_message') {
      console.log('✅ Play completed: verification_message')
      callService.updateCallStatus(callConnectionId, 'waiting-input')

      if (this.getTransaction) {
        const transaction = this.getTransaction(transactionId)
        if (transaction && typeof transaction.customerPhone === 'string') {
          try {
            const callConnection = callService.getCallConnection(callConnectionId)
            const callMedia = callConnection.getCallMedia()

            await callMedia.startRecognizing(
              { phoneNumber: transaction.customerPhone },
              {
                kind: 'callMediaRecognizeDtmfOptions',
                maxTonesToCollect: 1,
                stopDtmfTones: ['#'],
                interToneTimeoutInSeconds: 5,
                initialSilenceTimeoutInSeconds: 15,
                interruptPrompt: false,
                operationContext: `dtmf_menu_${transactionId}`
              }
            )

            updateTransaction?.(transactionId, {
              status: 'waiting-input',
              message: 'Waiting for customer DTMF input'
            })
          } catch (error) {
            console.error('❌ Failed to start DTMF recognition:', error)
            updateTransaction?.(transactionId, {
              status: 'failed',
              message: 'Failed to start DTMF recognition',
              error: error.message
            })
            await callService.hangupCall(callConnectionId)
          }
        }
      }

    } else if (operationContext === 'confirmation_message') {
      // End call after confirmation
      console.log('✅ Confirmation played, ending call...')
      setTimeout(async () => {
        await callService.hangupCall(callConnectionId)
      }, 1000)
    }
  }

  /**
   * Handle play failed
   */
  async handlePlayFailed(event, transactionId, updateTransaction) {
    const callConnectionId = event.data.callConnectionId
    console.error('❌ Play failed for call:', callConnectionId)
    
    callService.updateCallStatus(callConnectionId, 'play_failed')

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

      if (tones.length === 0) {
        console.log('⚠️  No DTMF tones detected')
        await this.handleNoInput(callConnectionId, transactionId, updateTransaction)
        return
      }

      const input = tones[0]
      console.log(`✅ DTMF input received: ${input}`)

      callService.updateCallStatus(callConnectionId, 'processing', { dtmfInput: input })

      // Determine transaction status based on input
      let transactionStatus
      switch (input) {
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
        dtmfInput: input,
        message: `Customer selected option ${input}`
      })

      // Generate and play confirmation message
      await this.playConfirmation(callConnectionId, transactionId, input)

      // TODO: Update transaction in database
      // await updateTransactionInDatabase(transactionId, transactionStatus, input)
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
        await callService.hangupCall(callConnectionId)
      }, 3000)

    } catch (error) {
      console.error('❌ Error handling timeout:', error)
      await callService.hangupCall(callConnectionId)
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
