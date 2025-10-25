/**
 * Azure Text-to-Speech Service
 * Generates audio from text using Azure Cognitive Services
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { DefaultAzureCredential } from '@azure/identity'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const AZURE_TTS_KEY = process.env.AZURE_TTS_KEY || process.env.AZURE_SPEECH_KEY
const AZURE_TTS_REGION = process.env.AZURE_TTS_REGION || process.env.AZURE_SPEECH_REGION
const AZURE_TTS_ENDPOINT = process.env.AZURE_TTS_ENDPOINT || process.env.COGNITIVE_SERVICES_ENDPOINT

class TTSService {
  constructor() {
    this.speechConfig = null
    this.initialize()
  }

  /**
   * Initialize TTS service
   */
  initialize() {
    try {
      // Try API key authentication first (for local development)
      if (AZURE_TTS_KEY && AZURE_TTS_REGION) {
        this.speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_TTS_KEY, AZURE_TTS_REGION)
        console.log('✅ TTS Service initialized with API key')
      }
      // Try managed identity (for Azure deployment)
      else if (AZURE_TTS_ENDPOINT) {
        const credential = new DefaultAzureCredential()
        this.speechConfig = sdk.SpeechConfig.fromEndpoint(AZURE_TTS_ENDPOINT, credential)
        console.log('✅ TTS Service initialized with managed identity')
      }
      else {
        throw new Error('Azure TTS credentials not configured. Please set AZURE_TTS_KEY + AZURE_TTS_REGION or AZURE_TTS_ENDPOINT')
      }
      
      // Set output format for phone calls (8kHz, 16-bit, mono)
      this.speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff8Khz16BitMonoPcm
      
      // Set default voice
      this.speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural'

    } catch (error) {
      console.error('❌ Failed to initialize TTS:', error)
      throw error
    }
  }

  /**
   * Synthesize text to audio
   */
  async synthesizeToAudio(text, options = {}) {
    if (!this.speechConfig) {
      throw new Error('TTS not initialized')
    }

    const {
      voice = 'en-US-JennyNeural',
      rate = '0.95',
      pitch = '0%',
      style = 'friendly'
    } = options

    try {
      console.log(`🔊 Synthesizing: "${text.substring(0, 50)}..."`)

      // Create SSML
      const ssml = this.createSSML(text, { voice, rate, pitch, style })

      // Create synthesizer
      const synthesizer = new sdk.SpeechSynthesizer(this.speechConfig, null)

      return new Promise((resolve, reject) => {
        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              console.log(`✅ TTS synthesis completed: ${result.audioData.byteLength} bytes`)
              resolve(result.audioData)
            } else {
              const error = new Error(`Speech synthesis failed: ${result.errorDetails}`)
              console.error('❌', error.message)
              reject(error)
            }
            synthesizer.close()
          },
          (error) => {
            console.error('❌ TTS synthesis error:', error)
            synthesizer.close()
            reject(error)
          }
        )
      })
    } catch (error) {
      console.error('❌ TTS synthesis error:', error)
      throw error
    }
  }

  /**
   * Create SSML markup
   */
  createSSML(text, options) {
    const { voice, rate, pitch, style } = options

    // Use express-as style for more natural sounding voice
    return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
             xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
        <voice name="${voice}">
          <mstts:express-as style="${style}">
            <prosody rate="${rate}" pitch="${pitch}">
              ${this.escapeXml(text)}
            </prosody>
          </mstts:express-as>
        </voice>
      </speak>
    `.trim()
  }

  /**
   * Escape XML special characters
   */
  escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  /**
   * Get available voices
   */
  getAvailableVoices() {
    return {
      'en-US': [
        { name: 'en-US-JennyNeural', gender: 'Female', description: 'Friendly and warm' },
        { name: 'en-US-AriaNeural', gender: 'Female', description: 'Professional' },
        { name: 'en-US-GuyNeural', gender: 'Male', description: 'Clear and professional' },
        { name: 'en-US-DavisNeural', gender: 'Male', description: 'Strong and confident' },
        { name: 'en-US-JaneNeural', gender: 'Female', description: 'Natural and conversational' },
      ],
      'en-GB': [
        { name: 'en-GB-SoniaNeural', gender: 'Female', description: 'Professional British' },
        { name: 'en-GB-RyanNeural', gender: 'Male', description: 'Clear British accent' },
      ]
    }
  }
}

export const ttsService = new TTSService()
