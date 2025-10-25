/**
 * Storage Service for Audio Files
 * Saves audio files to Azure Blob Storage or locally as fallback
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { BlobServiceClient } from '@azure/storage-blob'
import { DefaultAzureCredential } from '@azure/identity'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL || `http://localhost:${process.env.PORT || 3001}`
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING
const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME

class StorageService {
  constructor() {
    this.audioDir = join(dirname(__dirname), 'audio')
    this.ensureAudioDirectory()
    
    // Initialize Azure Blob Storage
    if (AZURE_STORAGE_CONNECTION_STRING && AZURE_STORAGE_CONNECTION_STRING !== 'your_blob_storage_connection_string_here') {
      try {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)
        this.containerName = 'audio-files'
        this.initializeBlobContainer()
        console.log('✅ Azure Blob Storage initialized with connection string')
      } catch (error) {
        console.warn('⚠️  Azure Blob Storage initialization with connection string failed:', error.message)
        this.blobServiceClient = null
      }
    } else if (AZURE_STORAGE_ACCOUNT_NAME) {
      try {
        // Use managed identity in Azure
        const credential = new DefaultAzureCredential()
        const accountUrl = `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`
        this.blobServiceClient = new BlobServiceClient(accountUrl, credential)
        this.containerName = 'audio-files'
        this.initializeBlobContainer()
        console.log('✅ Azure Blob Storage initialized with managed identity')
      } catch (error) {
        console.warn('⚠️  Azure Blob Storage initialization with managed identity failed:', error.message)
        this.blobServiceClient = null
      }
    } else {
      console.log('💡 Azure Storage not configured, using local storage')
      this.blobServiceClient = null
    }
  }

  /**
   * Initialize blob container
   */
  async initializeBlobContainer() {
    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName)
      await containerClient.createIfNotExists({
        access: 'blob' // Allow public read access to blob files
      })
      console.log(`✅ Blob container '${this.containerName}' ready`)
    } catch (error) {
      console.error('❌ Error initializing blob container:', error)
    }
  }

  /**
   * Ensure audio directory exists for local fallback
   */
  ensureAudioDirectory() {
    if (!existsSync(this.audioDir)) {
      mkdirSync(this.audioDir, { recursive: true })
      console.log(`✅ Created local audio directory: ${this.audioDir}`)
    }
  }

  /**
   * Save audio file - tries Azure Blob Storage first, falls back to local
   */
  async saveAudioFile(audioBuffer, filename) {
    // Try Azure Blob Storage first
    if (this.blobServiceClient) {
      try {
        return await this.uploadToBlobStorage(audioBuffer, filename)
      } catch (error) {
        console.warn('⚠️  Azure Blob upload failed, falling back to local storage:', error.message)
      }
    }

    // Fallback to local storage
    return await this.saveAudioFileLocal(audioBuffer, filename)
  }

  /**
   * Save audio file locally
   */
  async saveAudioFileLocal(audioBuffer, filename) {
    try {
      const uniqueFilename = `${filename}_${uuidv4()}.wav`
      const filepath = join(this.audioDir, uniqueFilename)

      // Convert ArrayBuffer to Buffer
      const buffer = Buffer.from(audioBuffer)
      
      writeFileSync(filepath, buffer)
      
      const audioUrl = `${CALLBACK_BASE_URL}/audio/${uniqueFilename}`
      
      console.log(`✅ Audio saved locally: ${audioUrl}`)
      
      return audioUrl

    } catch (error) {
      console.error('❌ Error saving audio file locally:', error)
      throw error
    }
  }

  /**
   * Upload to Azure Blob Storage
   */
  async uploadToBlobStorage(audioBuffer, filename) {
    try {
      const uniqueFilename = `${filename}_${uuidv4()}.wav`
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName)
      const blockBlobClient = containerClient.getBlockBlobClient(uniqueFilename)
      
      // Convert ArrayBuffer to Buffer
      const buffer = Buffer.from(audioBuffer)
      
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: 'audio/wav'
        }
      })
      
      const audioUrl = blockBlobClient.url
      console.log(`✅ Audio uploaded to Azure Blob Storage: ${audioUrl}`)
      
      return audioUrl
      
    } catch (error) {
      console.error('❌ Error uploading to blob storage:', error)
      throw error
    }
  }
}

export const storageService = new StorageService()
