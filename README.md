# Payment Transaction Approval via Phone Call System

## Overview

This is a **demonstration application** showcasing how Azure Communication Services (ACS) Call Automation can be used to verify payment transactions via automated phone calls with DTMF (keypad) input capture.

### Business Use Case

Banks need to verify high-value or suspicious transactions when customers don't have access to their mobile banking app. This system:
- Automatically calls the customer's registered phone number
- Plays a Text-to-Speech message with transaction details
- Captures the customer's response (1 = Approve, 2 = Reject, 0 = It's Not Me)
- Processes the response and updates the transaction status
- Maintains complete audit trail for compliance

## Features

✅ **Transaction Creation** - Form-based transaction initiation with validation  
✅ **Simulated Call Flow** - Complete ACS workflow simulation (dialing → connected → TTS → DTMF → processing)  
✅ **Real-time Status Updates** - Live progress tracking as calls proceed through workflow  
✅ **DTMF Response Handling** - Captures and processes keypad input (1/2/0)  
✅ **Retry Mechanism** - Automatic retry for failed/timeout calls (up to 3 attempts)  
✅ **Complete Audit Trail** - Full event log with timestamps for compliance  
✅ **Statistics Dashboard** - Overview of approval rates and call outcomes  
✅ **Responsive Design** - Mobile-first banking-grade UI  

## Technology Stack

- **Frontend**: React 19 + TypeScript
- **UI Components**: shadcn/ui v4 (Radix UI primitives)
- **Styling**: Tailwind CSS v4
- **State Management**: React hooks + Spark KV storage (persistent)
- **Icons**: Phosphor Icons
- **Notifications**: Sonner

## Demo Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Transaction Form                        │
│            (User enters payment details)                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Transaction Created & Queued                    │
│         (Stored in Spark KV with unique ID)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           Call Simulation Service (Async)                    │
│                                                              │
│  1. Initiating   → ACS CreateCall API invoked               │
│  2. Dialing      → Calling customer's registered number     │
│  3. Connected    → Customer answered                        │
│  4. Playing TTS  → "To approve AED 100, press 1..."         │
│  5. Waiting      → Listening for DTMF input                 │
│  6. Processing   → Captured digit (1/2/0)                   │
│  7. Final        → Approved/Rejected/Escalated              │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Real-time Status Updates                        │
│       (UI reflects each state change immediately)            │
└─────────────────────────────────────────────────────────────┘
```

## Production Implementation Guide

### Backend Requirements

To implement this in production with actual Azure Communication Services:

#### 1. **Azure Resources Setup**

```bash
# Create ACS resource
az communication create \
  --name "bank-verification-acs" \
  --resource-group "payment-verification-rg" \
  --location "uaenorth"

# Purchase phone numbers for outbound calling
az communication phonenumber purchase \
  --country-code AE \
  --phone-plan-id "..."
```

#### 2. **Backend Service (Python/Node.js)**

Create a backend service that:

**Endpoints:**
- `POST /api/transactions/initiate` - Receives transaction details, creates call
- `POST /api/webhooks/acs` - Receives ACS events (CallConnected, RecognizeCompleted, etc.)

**Example Python Implementation:**

```python
from azure.communication.callautomation import (
    CallAutomationClient,
    PhoneNumberIdentifier
)

# Initialize ACS client
client = CallAutomationClient.from_connection_string(
    connection_string="YOUR_ACS_CONNECTION_STRING"
)

# Initiate call
def initiate_verification_call(transaction):
    call_connection = client.create_call(
        target_participant=PhoneNumberIdentifier(transaction.customer_phone),
        source_caller_id_number=PhoneNumberIdentifier("+971XXXXXXXX"),
        callback_uri="https://your-api.com/api/webhooks/acs"
    )
    
    # Store call_connection.call_connection_id with transaction
    return call_connection

# Handle CallConnected event
def on_call_connected(event):
    # Play TTS message
    client.get_call_connection(event.call_connection_id).play_to_all(
        text_to_play="Hello, this is a transaction verification call...",
        voice_kind="female"
    )
    
    # Start DTMF recognition
    client.get_call_connection(event.call_connection_id).start_recognizing(
        input_type="dtmf",
        max_tones_to_collect=1,
        interrupt_prompt=True,
        inter_digit_timeout=5
    )

# Handle RecognizeCompleted event
def on_recognize_completed(event):
    dtmf_input = event.dtmf_result.tones[0]  # '1', '2', or '0'
    
    if dtmf_input == '1':
        # Approve transaction in your banking system
        approve_transaction(event.call_connection_id)
    elif dtmf_input == '2':
        # Reject transaction
        reject_transaction(event.call_connection_id)
    elif dtmf_input == '0':
        # Escalate to fraud team
        escalate_to_fraud(event.call_connection_id)
    
    # Play confirmation and hang up
    client.get_call_connection(event.call_connection_id).play_to_all(
        text_to_play="Thank you. Your response has been recorded."
    )
    client.get_call_connection(event.call_connection_id).hang_up()
```

#### 3. **Key ACS APIs**

| API | Purpose | Documentation |
|-----|---------|---------------|
| `CreateCall` | Initiate outbound PSTN call | [Docs](https://learn.microsoft.com/azure/communication-services/quickstarts/call-automation/callflows-for-customer-interactions) |
| `Play` | Play TTS message to caller | [Docs](https://learn.microsoft.com/azure/communication-services/how-tos/call-automation/play-action) |
| `Recognize` | Collect DTMF input | [Docs](https://learn.microsoft.com/azure/communication-services/how-tos/call-automation/recognize-action) |
| `Hangup` | End the call | [Docs](https://learn.microsoft.com/azure/communication-services/how-tos/call-automation/control-mid-call-media-actions) |

#### 4. **Event Flow (Production)**

```
Your Backend              ACS                    Customer
     │                     │                         │
     ├─ CreateCall ───────>│                         │
     │                     ├─ Dial ─────────────────>│
     │                     │                         │
     │<─ CallConnected ────┤<─ Answer ───────────────┤
     │                     │                         │
     ├─ Play(TTS) ────────>│                         │
     │                     ├─ TTS Audio ────────────>│
     │                     │                         │
     ├─ Recognize(DTMF) ──>│                         │
     │                     │<─ Press 1 ──────────────┤
     │                     │                         │
     │<─ RecognizeComplete ┤                         │
     │   (dtmf: "1")       │                         │
     │                     │                         │
     ├─ [Approve Txn]      │                         │
     │                     │                         │
     ├─ Play(Confirm) ────>│                         │
     │                     ├─ "Approved" ───────────>│
     │                     │                         │
     ├─ Hangup ───────────>│                         │
     │                     ├─ End Call ─────────────>│
```

### Database Schema

```sql
CREATE TABLE transactions (
    id VARCHAR(50) PRIMARY KEY,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    merchant VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    status VARCHAR(50) NOT NULL,
    dtmf_input CHAR(1),
    call_id VARCHAR(100),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    call_started_at TIMESTAMP,
    call_ended_at TIMESTAMP,
    retry_count INT DEFAULT 0
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    transaction_id VARCHAR(50) REFERENCES transactions(id),
    timestamp TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB
);
```

### Security Considerations

1. **PCI DSS Compliance**: ACS is PCI DSS Level 1 certified - ensure your integration maintains compliance
2. **No PII in TTS**: Don't read full card numbers or sensitive PII over the call
3. **Webhook Authentication**: Validate ACS webhook signatures to prevent spoofing
4. **Encryption**: Use TLS 1.2+ for all API calls; store secrets in Azure Key Vault
5. **Call Recording**: Only record if required; redact PII in transcripts
6. **Audit Trail**: Log all events with correlation IDs for regulatory compliance

### Cost Estimation

| Component | Unit Cost (Approx) | Notes |
|-----------|-------------------|-------|
| Outbound PSTN call | $0.013/min (UAE) | Varies by country |
| TTS characters | $16/million chars | Azure AI Speech |
| Call Automation operations | Low/negligible | Control plane calls |

**Example**: 10,000 calls/day × 30 seconds avg × $0.013/min = ~$65/day

### Retry & Fallback Strategy

```
Attempt 1: Phone Call (ACS)
    ↓ (if timeout/no-answer)
Attempt 2: Phone Call (retry after 5 min)
    ↓ (if timeout/no-answer)
Attempt 3: Phone Call (retry after 15 min)
    ↓ (if still failed)
Fallback: SMS with approval link + Push notification
    ↓ (if still no response)
Escalate to human agent call
```

## Development

### Run Locally

```bash
npm install
npm run dev
```

### Project Structure

```
spark-template/
├── docs/                        # Documentation
│   ├── PRD.md                   # Product Requirements
│   ├── INTEGRATION_DIAGRAM.md   # Architecture docs
│   └── SECURITY.md              # Security guidelines
├── scripts/                     # Utility scripts
│   └── start-all.sh             # Start both frontend & backend
├── backend/                     # Node.js API server
│   ├── server.js                # Express server
│   ├── services/                # Business logic
│   │   ├── call-service.js      # ACS call management
│   │   ├── tts-service.js       # Azure TTS integration
│   │   ├── webhook-handler.js   # ACS event processing
│   │   └── storage-service.js   # Data persistence
│   └── audio/                   # Generated TTS files
├── src/                         # React frontend
│   ├── components/              # UI components
│   │   ├── TransactionForm.tsx  # Create new transaction
│   │   ├── TransactionDetail.tsx # Display transaction card
│   │   ├── TransactionStats.tsx # Dashboard statistics
│   │   └── AuditLogDialog.tsx   # Full audit trail viewer
│   ├── lib/                     # Utilities & services
│   │   ├── types.ts             # TypeScript interfaces
│   │   ├── transaction-utils.ts # Helper functions
│   │   └── call-service.ts      # Call simulation service
│   ├── hooks/                   # Custom React hooks
│   └── styles/                  # CSS & themes
└── package.json                 # Frontend dependencies
```

## Quick Start

### Prerequisites
- Node.js 22+ 
- Azure Communication Services resource with phone number
- Azure Cognitive Services (Speech) resource

### Setup
1. **Clone and install dependencies:**
   ```bash
   npm install
   cd backend && npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env.local` and add your Azure credentials:
   ```env
   VITE_ACS_ENDPOINT=https://your-acs.communication.azure.com/
   VITE_ACS_ACCESS_KEY=your_access_key
   VITE_AZURE_TTS_KEY=your_tts_key
   VITE_AZURE_TTS_REGION=your_region
   ```

3. **Start the application:**
   ```bash
   # Use the convenient startup script
   chmod +x scripts/start-all.sh
   ./scripts/start-all.sh
   
   # Or start services manually:
   # Backend (in one terminal)
   cd backend && npm start
   
   # Frontend (in another terminal)
   npm run dev
   ```

4. **Test the system:**
   - Open http://localhost:5001
   - Fill in transaction details
   - Enter a real phone number for testing
   - Click "Initiate Verification Call"

## References

- [ACS Call Automation Overview](https://learn.microsoft.com/azure/communication-services/concepts/call-automation/call-automation)
- [Outbound Calling Quickstart](https://learn.microsoft.com/azure/communication-services/quickstarts/call-automation/callflows-for-customer-interactions)
- [DTMF Recognition Guide](https://learn.microsoft.com/azure/communication-services/how-tos/call-automation/recognize-action)
- [Azure AI Speech (TTS)](https://learn.microsoft.com/azure/ai-services/speech-service/)

---

**Note**: This is a demonstration/prototype application. For production deployment, implement proper authentication, database persistence, monitoring, and compliance controls.
