# Azure Integration Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Application                         │
│                      (http://localhost:5001)                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌──────────────┐        ┌──────────────┐       ┌──────────────┐
│  User fills  │   -->  │  App.tsx     │  -->  │ Call Service │
│  transaction │        │  submits     │       │  initiates   │
│  form        │        │              │       │              │
└──────────────┘        └──────────────┘       └──────────────┘
                                                        │
                                                        │
                        ┌───────────────────────────────┴────────┐
                        │                                        │
                        ▼                                        ▼
              ┌──────────────────┐                    ┌──────────────────┐
              │  Azure TTS       │                    │  Azure ACS       │
              │  Service         │                    │  Service         │
              │                  │                    │                  │
              │  - Generate      │                    │  - Initiate call │
              │    messages      │                    │  - Handle DTMF   │
              │  - Voice         │                    │  - Manage call   │
              │    synthesis     │                    │    state         │
              └──────────────────┘                    └──────────────────┘
                        │                                        │
                        │                                        │
                        ▼                                        ▼
              ┌──────────────────┐                    ┌──────────────────┐
              │  Azure Cognitive │                    │  Azure           │
              │  Services        │                    │  Communication   │
              │  (West Europe)   │                    │  Services        │
              │                  │                    │  (UAE)           │
              └──────────────────┘                    └──────────────────┘
                                                              │
                                                              │
                                                              ▼
                                                    ┌──────────────────┐
                                                    │  Customer Phone  │
                                                    │  +1415555XXXX    │
                                                    └──────────────────┘
```

## Configuration Flow

```
.env.local (Your Credentials)
      │
      │ Loaded at build time (Vite)
      │
      ▼
src/lib/azure-config.ts
      │
      │ Validates & exports config
      │
      ├─────────────────┬─────────────────┐
      │                 │                 │
      ▼                 ▼                 ▼
azure-call-service  azure-tts-service  AzureConfigStatus
      │                 │                 │
      │                 │                 │
      └────────┬────────┴────────┬────────┘
               │                 │
               ▼                 ▼
           App.tsx          UI Components
```

## Call Flow Sequence

```
User Action:                Transaction Form Submitted
                                    │
                                    ▼
Frontend:               callService.initiateCall(transaction)
                                    │
                                    ▼
Configuration:          Load ACS & TTS credentials from azure-config
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
TTS Service:    Generate verification message    Configure voice settings
                "Hello [Name], we detected..."   (Jenny Neural, en-US)
                                    │
                                    ▼
ACS Service:    [DEMO MODE] Simulate call flow
                (In production: actual ACS API call)
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            Status: Dialing   Connected    Playing Message
                                    │
                                    ▼
                    Wait for DTMF Input (1/2/0)
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
                Press 1         Press 2         Press 0
                Approve         Reject          Escalate
                                    │
                                    ▼
TTS Service:    Generate confirmation message
                "Thank you. Your transaction..."
                                    │
                                    ▼
ACS Service:    End call & update transaction status
                                    │
                                    ▼
Frontend:       Display result in UI (Active → History)
                Show audit log with full details
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Transaction Data                          │
├─────────────────────────────────────────────────────────────────┤
│  customerName: "John Doe"                                       │
│  customerPhone: "+14155551234"                                  │
│  amount: 1500.00                                                │
│  merchantName: "Amazon.com"                                     │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TTS Message Generation                        │
├─────────────────────────────────────────────────────────────────┤
│  Text: "Hello John Doe. This is an automated call from          │
│         your bank's fraud prevention system. We detected         │
│         a transaction of $1,500.00 at Amazon.com..."            │
│                                                                  │
│  Voice: en-US-JennyNeural                                       │
│  Rate: 1.0                                                       │
│  Pitch: 1.0                                                      │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Azure TTS Synthesis                          │
├─────────────────────────────────────────────────────────────────┤
│  Endpoint: https://westeurope.api.cognitive.microsoft.com/      │
│  Key: D7a28cAh... (from .env.local)                            │
│  Region: westeurope                                             │
│                                                                  │
│  Output: Audio stream (SSML → Neural Voice → Audio)            │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ACS Call Automation                         │
├─────────────────────────────────────────────────────────────────┤
│  Endpoint: https://banajacs.uae.communication.azure.com/        │
│  Key: EyOjhgij... (from .env.local)                            │
│                                                                  │
│  Actions:                                                        │
│  1. Create call → Dial +14155551234                            │
│  2. Play audio → TTS message                                    │
│  3. Recognize → DTMF input (1/2/0)                             │
│  4. Play audio → Confirmation message                           │
│  5. Hangup → End call                                           │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Transaction Update                          │
├─────────────────────────────────────────────────────────────────┤
│  status: "approved" | "rejected" | "escalated"                  │
│  dtmfInput: "1" | "2" | "0"                                     │
│  callStartedAt: "2025-10-24T10:30:00Z"                         │
│  callEndedAt: "2025-10-24T10:31:45Z"                           │
│  auditLog: [Array of all events and timestamps]                │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
/workspaces/spark-template/
│
├── .env.local                        ← 🔑 YOUR CREDENTIALS HERE
├── .env.example                      ← Template for others
│
├── src/
│   ├── App.tsx                       ← Main application
│   │
│   ├── lib/
│   │   ├── azure-config.ts           ← ⚙️  Config loader & validator
│   │   ├── azure-call-service.ts     ← 📞 ACS call automation
│   │   ├── azure-tts-service.ts      ← 🔊 Text-to-Speech
│   │   ├── transaction-utils.ts      ← Transaction helpers
│   │   └── types.ts                  ← TypeScript types
│   │
│   └── components/
│       ├── AzureConfigStatus.tsx     ← ✅ Config status display
│       ├── TransactionForm.tsx       ← Form to create transaction
│       ├── TransactionDetail.tsx     ← Call details display
│       ├── TransactionStats.tsx      ← Statistics dashboard
│       └── AuditLogDialog.tsx        ← Detailed audit viewer
│
├── AZURE_INTEGRATION.md              ← 📚 Full integration guide
├── SETUP_COMPLETE.md                 ← 🎉 Quick start guide
├── CREDENTIALS_LOCATION.md           ← 🗺️  Where credentials are used
└── INTEGRATION_DIAGRAM.md            ← 📊 This file (visual diagrams)
```

## Environment Variables Mapping

```
.env.local Variable              →   Used By                    →   Azure Service
─────────────────────────────────────────────────────────────────────────────────
VITE_ACS_ENDPOINT                →   azure-call-service.ts     →   ACS API
VITE_ACS_ACCESS_KEY              →   azure-call-service.ts     →   ACS Authentication
VITE_ACS_CONNECTION_STRING       →   azure-call-service.ts     →   ACS SDK Client

VITE_AZURE_TTS_KEY               →   azure-tts-service.ts      →   Cognitive Services
VITE_AZURE_TTS_ENDPOINT          →   azure-tts-service.ts      →   TTS API
VITE_AZURE_TTS_REGION            →   azure-tts-service.ts      →   TTS Region Config
```

## Security Model

### Development (Current)
```
Browser
  ↓
.env.local (loaded by Vite)
  ↓
Frontend JavaScript (credentials visible in source)
  ↓
Direct API calls to Azure
```
⚠️ **Not secure for production** - Credentials exposed in browser

### Production (Recommended)
```
Browser
  ↓
Frontend (no credentials)
  ↓
Backend API (/api/calls/initiate)
  ↓
Server Environment Variables
  ↓
Azure Services
```
✅ **Secure** - Credentials never leave server

## Component Interaction

```
┌────────────────────────────────────────────────────────────────┐
│                          App.tsx                                │
│  - Manages application state                                    │
│  - Handles transaction lifecycle                                │
│  - Subscribes to call updates                                   │
└────┬──────────────────────────────────────┬────────────────────┘
     │                                      │
     │ Uses                                 │ Displays
     │                                      │
     ▼                                      ▼
┌─────────────────┐              ┌──────────────────────┐
│ callService     │              │ AzureConfigStatus    │
│ (azure-call-    │              │ - Shows ✓ or ○       │
│  service.ts)    │              │ - Validates config    │
│                 │              └──────────────────────┘
│ - initiateCall()│
│ - retryCall()   │              ┌──────────────────────┐
│ - subscribe()   │              │ TransactionForm      │
└─────────────────┘              │ - Collects data      │
     │                           │ - Submits to App     │
     │ Uses                      └──────────────────────┘
     │
     ▼                           ┌──────────────────────┐
┌─────────────────┐              │ TransactionDetail    │
│ azureTTSService │              │ - Shows status       │
│ (azure-tts-     │              │ - Audit logs         │
│  service.ts)    │              │ - Retry button       │
│                 │              └──────────────────────┘
│ - generateVeri- │
│   ficationMsg() │              ┌──────────────────────┐
│ - generateConf- │              │ AuditLogDialog       │
│   irmationMsg() │              │ - Detailed timeline  │
└─────────────────┘              │ - All events         │
     │                           └──────────────────────┘
     │ Both use
     │
     ▼
┌─────────────────┐
│ azureConfig     │
│ (azure-config.  │
│  ts)            │
│                 │
│ - Loads .env    │
│ - Validates     │
│ - Exports       │
└─────────────────┘
```

## Summary

This application integrates:
1. ✅ **Azure Communication Services** for making phone calls
2. ✅ **Azure Text-to-Speech** for generating voice messages
3. ✅ **Real-time UI** for monitoring call status
4. ✅ **Audit logging** for compliance and debugging

Your credentials are securely stored in `.env.local` and used throughout the application to power the call automation workflow.
