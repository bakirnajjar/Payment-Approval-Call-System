                         # Azure Communication Services Backend

This backend server handles **real** Azure Communication Services phone calls with Text-to-Speech integration.

## 🚀 Features

- ✅ **Real ACS Phone Calls** - Actual outbound dialing using Azure Communication Services
- ✅ **Azure TTS Integration** - Natural voice messages using Azure Cognitive Services
- ✅ **DTMF Input Processing** - Captures customer button presses (1/2/0)
- ✅ **Webhook Handling** - Processes ACS events in real-time
- ✅ **Audio File Management** - Generates and serves TTS audio files
- ✅ **Call State Management** - Tracks all call statuses and transitions

## 📋 Prerequisites

Before running this backend, you need:

1. **Azure Communication Services Resource**
   - Provisioned phone number
   - Connection string
   - Endpoint URL

2. **Azure Cognitive Services (Speech)**
   - Speech API key
   - Region endpoint

3. **Publicly Accessible URL** (for webhooks)
   - Use ngrok, Azure Functions, or deployed server
   - ACS needs to send events to your server

## 🔧 Setup

### 1. Install Dependencies

```bash
# From the repository root; package-lock.json covers both workspaces.
npm ci
```

Run backend commands from the repository root with `npm run dev:backend` or
`npm run start:backend`. The backend has no separate lockfile or install step.

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your Azure credentials:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
# Azure Communication Services credentials
ACS_CONNECTION_STRING=endpoint=https://<your-resource>.communication.azure.com/;accesskey=<your-key>
ACS_PHONE_NUMBER=+10000000000

# Azure Cognitive Services Speech (Text-to-Speech)
AZURE_TTS_KEY=<your-speech-key>
AZURE_TTS_REGION=<your-region>
# Optional managed identity endpoint
# AZURE_TTS_ENDPOINT=https://<your-custom-endpoint>.cognitiveservices.azure.com/

# Publicly reachable base URL that ACS webhooks can call
CALLBACK_BASE_URL=https://your-domain.com

# Optional storage configuration for TTS audio files
# AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=...
# AZURE_STORAGE_ACCOUNT_NAME=<your-storage-account>
```

> ⚠️ **Keep secrets out of source control.** Never commit `.env` or any files containing live keys. The provided example uses placeholders only.

### 3. Get Your ACS Phone Number

```bash
# Login to Azure CLI
az login

# List your ACS phone numbers
az communication phonenumber list --connection-string "YOUR_CONNECTION_STRING"
```

Update `ACS_PHONE_NUMBER` in `.env` with one of your provisioned numbers.

### 4. Set Up Public Webhook URL

**For Development (using ngrok):**

```bash
# In a separate terminal
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Update CALLBACK_BASE_URL in .env
```

**For Production:**
Deploy to Azure Functions, Azure App Service, or any cloud platform with a public URL.

## 🎯 Running the Server

### Development Mode

```bash
npm run dev
```

Server will start on `http://localhost:3000`

### Production Mode

```bash
npm start
```

## 📡 API Endpoints

### POST /api/calls/initiate

Initiate an outbound call.

**Request:**

```json
{
  "transactionId": "abc-123",
  "customerPhone": "+14155551234",
  "customerName": "John Doe",
  "amount": 1500.00,
  "merchantName": "Amazon.com"
}
```

**Response:**

```json
{
  "success": true,
  "callConnectionId": "aHR0cHM6Ly...",
  "transactionId": "abc-123",
  "status": "initiated"
}
```

### POST /api/callbacks/:transactionId

Webhook endpoint for ACS events (called by Azure).

### GET /api/calls/:callConnectionId/status

Get current call status.

### POST /api/calls/:callConnectionId/hangup

Manually hang up a call.

### GET /health

Health check endpoint.

### GET /audio/:filename

Serve generated TTS audio files.

## 🔄 Call Flow

```text
1. Frontend → POST /api/calls/initiate
2. Backend → Generate TTS audio
3. Backend → Call ACS createCall()
4. ACS → Dial customer phone
5. Customer answers
6. ACS → CallConnected event → Backend webhook
7. Backend → Play TTS message
8. ACS → PlayCompleted event
9. Backend → Start DTMF recognition
10. Customer presses 1/2/0
11. ACS → RecognizeCompleted event
12. Backend → Process input, play confirmation
13. Backend → Hang up call
14. ACS → CallDisconnected event
15. Backend → Update transaction status
```

## 📊 ACS Events Handled

| Event | Description | Action |
|-------|-------------|--------|
| `CallConnected` | Customer answered | Play verification message |
| `PlayCompleted` | Message finished | Start DTMF recognition |
| `RecognizeCompleted` | DTMF input received | Process response, play confirmation |
| `CallDisconnected` | Call ended | Clean up resources |
| `PlayFailed` | Audio playback failed | Hang up, log error |
| `RecognizeFailed` | DTMF timeout | Play timeout message |

## 🔊 Text-to-Speech

The backend generates natural-sounding voice messages using Azure Neural TTS:

- **Voice**: en-US-JennyNeural (professional female voice)
- **Format**: 8kHz 16-bit mono PCM (optimized for phone calls)
- **Style**: Friendly and clear

**Example Message:**
> "Hello John Doe. This is an automated call from your bank's fraud prevention system..."

## 🗂️ File Structure

```text
backend/
├── server.js                      # Express server
├── .env                           # Environment configuration
├── package.json                   # Dependencies
├── services/
│   ├── call-service.js            # ACS call management
│   ├── webhook-handler.js         # Event processing
│   ├── tts-service.js             # Text-to-Speech
│   └── storage-service.js         # Audio file storage
└── audio/                         # Generated audio files
```

## 🐛 Troubleshooting

### Webhooks Not Received

**Problem:** ACS events not reaching your server

**Solutions:**

1. Ensure `CALLBACK_BASE_URL` is publicly accessible
2. Use ngrok for local development: `ngrok http 3000`
3. Check firewall settings
4. Verify webhook URL in ACS logs

### Calls Not Connecting

**Problem:** Calls fail to initiate

**Solutions:**

1. Verify `ACS_PHONE_NUMBER` is correct and provisioned
2. Check phone number format (E.164: `+14155551234`)
3. Ensure target number can receive calls
4. Check ACS resource is active in Azure Portal

### TTS Audio Not Playing

**Problem:** Customer doesn't hear message

**Solutions:**

1. Check audio files in `backend/audio/` directory
2. Verify `CALLBACK_BASE_URL` is accessible from ACS
3. Test audio URL directly in browser
4. Check TTS service logs for errors

### DTMF Not Recognized

**Problem:** Customer input not detected

**Solutions:**

1. Increase `initialSilenceTimeoutInSeconds` in webhook-handler.js
2. Verify customer is pressing keys during recognition phase
3. Check ACS logs for RecognizeCompleted events

## 📈 Monitoring

### View Logs

```bash
# Server logs
npm run dev

# Detailed logs for debugging
NODE_ENV=development npm run dev
```

### Azure Portal Monitoring

1. Go to Azure Portal → Your ACS Resource
2. Navigate to **Monitoring** → **Metrics**
3. View:
   - Call success rates
   - Call duration
   - Failed calls
   - API errors

### Call Recordings (Optional)

To enable call recording, add to webhook-handler.js:

```javascript
await callConnection.startRecording({
  recordingStorageKind: 'azureBlobStorage',
  recordingContent: 'audio',
  recordingChannel: 'mixed'
})
```

## 🔐 Security Best Practices

### ✅ Do's

- ✅ Store credentials in `.env` (never commit)
- ✅ Use HTTPS for callback URLs
- ✅ Validate incoming webhook requests
- ✅ Implement rate limiting
- ✅ Add authentication to API endpoints
- ✅ Log all call activities

### ❌ Don'ts

- ❌ Never expose ACS credentials in frontend
- ❌ Don't use HTTP for production webhooks
- ❌ Don't skip input validation
- ❌ Don't store sensitive data in logs

## 🚀 Deployment

### Azure Functions (Recommended)

```bash
# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Deploy
func azure functionapp publish your-function-app-name
```

### Azure App Service

```bash
# Create web app
az webapp create --name your-app-name --resource-group your-rg --plan your-plan

# Deploy
az webapp deployment source config-zip --name your-app-name --resource-group your-rg --src backend.zip
```

### Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## 📞 Testing

### Test Call Initiation

```bash
curl -X POST http://localhost:3000/api/calls/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "test-123",
    "customerPhone": "+14155551234",
    "customerName": "Test User",
    "amount": 100.00,
    "merchantName": "Test Merchant"
  }'
```

### Test Webhook

```bash
curl -X POST http://localhost:3000/api/callbacks/test-123 \
  -H "Content-Type: application/json" \
  -d '[{
    "type": "Microsoft.Communication.CallConnected",
    "data": {
      "callConnectionId": "test-call-id"
    }
  }]'
```

## 📚 Additional Resources

- [Azure Communication Services Docs](https://learn.microsoft.com/azure/communication-services/)
- [Call Automation API Reference](https://learn.microsoft.com/azure/communication-services/concepts/call-automation/call-automation)
- [Azure TTS Documentation](https://learn.microsoft.com/azure/cognitive-services/speech-service/text-to-speech)
- [ACS Pricing](https://azure.microsoft.com/pricing/details/communication-services/)

## 💡 Next Steps

1. ✅ Install dependencies
2. ✅ Configure `.env` with your credentials
3. ⚠️ **Get your ACS phone number** and update `.env`
4. ⚠️ **Set up ngrok** or public URL for webhooks
5. 🚀 Start the server: `npm run dev`
6. 🧪 Test with the frontend application
7. 📊 Monitor calls in Azure Portal

---

**Ready to make real calls!** 📞✨
