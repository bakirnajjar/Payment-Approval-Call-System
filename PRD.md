# Payment Transaction Approval via Phone Call System

A bank transaction verification system that uses automated phone calls to capture customer approval or rejection through DTMF (keypad) input.

**Experience Qualities**:
1. **Trustworthy** – Clear, professional interface that instills confidence in handling sensitive financial transactions
2. **Efficient** – Streamlined workflow from transaction creation to final approval with minimal steps
3. **Transparent** – Real-time status updates and complete audit trail of all call attempts and responses

**Complexity Level**: Light Application (multiple features with basic state)
The system handles transaction creation, call simulation, status tracking, and audit logging with straightforward state management suitable for a demo/prototype environment.

## Essential Features

### Feature 1: Transaction Initiation
- **Functionality**: Create a new transaction verification request with payment details (amount, merchant, customer phone)
- **Purpose**: Allows bank systems to trigger approval calls when customers lack mobile app access
- **Trigger**: User fills form with transaction details and clicks "Initiate Call"
- **Progression**: Enter details → Validate inputs → Submit → System generates call script → Call queued
- **Success criteria**: Transaction created with unique ID, call script generated, initial status set to "initiating"

### Feature 2: Automated Call Flow Simulation
- **Functionality**: Simulates the Azure Communication Services call automation workflow with TTS and DTMF capture
- **Purpose**: Demonstrates the complete call lifecycle for stakeholder review and backend team reference
- **Trigger**: Transaction submission automatically starts simulated call sequence
- **Progression**: Dialing → Connected → Playing TTS message → Waiting for input → Capturing DTMF (1/2/0) → Processing response → Call complete
- **Success criteria**: Clear visual feedback at each stage, realistic timing, proper state transitions

### Feature 3: Response Handling & Transaction Processing
- **Functionality**: Process customer DTMF input and update transaction status accordingly
- **Purpose**: Demonstrate business logic for approval/rejection/escalation paths
- **Trigger**: Customer presses 1 (approve), 2 (reject), or 0 (not me) during call
- **Progression**: Capture digit → Validate input → Play confirmation → Update transaction status → Log audit record → Show final result
- **Success criteria**: Correct status mapping (1=approved, 2=rejected, 0=escalated), confirmation played, transaction finalized

### Feature 4: Real-time Status Monitoring
- **Functionality**: Display live updates of all transaction attempts with current call status
- **Purpose**: Provides operations team visibility into system activity and call outcomes
- **Trigger**: Auto-updates as transactions progress through call workflow
- **Progression**: View dashboard → See all transactions → Filter by status → Click for details → View full audit trail
- **Success criteria**: Real-time updates without refresh, status badges with appropriate colors, sortable/filterable table

### Feature 5: Audit Trail & Reporting
- **Functionality**: Complete log of all call attempts, timestamps, responses, and system actions
- **Purpose**: Compliance requirement and troubleshooting tool for failed/suspicious transactions
- **Trigger**: Automatically logged at each workflow step
- **Progression**: Transaction created → Each status change logged → DTMF captured → Final outcome recorded → Exportable history
- **Success criteria**: Immutable log entries, millisecond-precision timestamps, all state transitions captured

## Edge Case Handling

- **No Response** – Timeout after 30 seconds, mark as "no-answer", allow retry or channel fallback (SMS/app)
- **Invalid Input** – DTMF digits other than 0/1/2 trigger reprompt up to 2 times before escalation
- **Multiple Attempts** – Track retry count per transaction, prevent infinite loops, escalate after 3 failed attempts
- **Duplicate Transactions** – Generate unique correlation IDs, prevent double-approval of same transaction
- **Network Failures** – Graceful error states with clear messaging, retry mechanisms with exponential backoff
- **Concurrent Calls** – Handle multiple simultaneous transactions without state collision

## Design Direction

The interface should feel professional, secure, and banking-grade—evoking the reliability of financial infrastructure while maintaining approachability. Design leans towards a serious, elegant aesthetic with subtle sophistication. A minimal interface better serves the purpose, reducing cognitive load during high-stakes transaction monitoring.

## Color Selection

**Custom palette** – Financial-grade color scheme using deep blue for trust and authority, green for approval states, red for rejection/alerts, and amber for pending/warning states.

- **Primary Color**: Deep Blue `oklch(0.35 0.08 250)` – Conveys trust, security, and financial institution authority; used for primary actions and branding
- **Secondary Colors**: 
  - Slate Gray `oklch(0.45 0.01 250)` for secondary UI elements and neutral backgrounds
  - Cool White `oklch(0.98 0.005 250)` for card surfaces maintaining the blue undertone
- **Accent Color**: Emerald Green `oklch(0.55 0.15 160)` – Success states, approved transactions, positive confirmations
- **Foreground/Background Pairings**:
  - Background (Pure White `oklch(1 0 0)`): Deep Blue text `oklch(0.25 0.08 250)` – Ratio 10.2:1 ✓
  - Card (Cool White `oklch(0.98 0.005 250)`): Deep Blue text `oklch(0.25 0.08 250)` – Ratio 9.8:1 ✓
  - Primary (Deep Blue `oklch(0.35 0.08 250)`): White text `oklch(1 0 0)` – Ratio 8.9:1 ✓
  - Secondary (Slate `oklch(0.45 0.01 250)`): White text `oklch(1 0 0)` – Ratio 5.8:1 ✓
  - Accent (Emerald `oklch(0.55 0.15 160)`): White text `oklch(1 0 0)` – Ratio 4.7:1 ✓
  - Muted (Light Slate `oklch(0.96 0.005 250)`): Slate text `oklch(0.45 0.01 250)` – Ratio 7.2:1 ✓

## Font Selection

Typography should convey precision, clarity, and institutional trust—characteristics essential for financial interfaces. **Inter** for UI elements (clean, highly legible, professional) and **JetBrains Mono** for transaction IDs, phone numbers, and technical data (monospace ensures proper alignment of numeric/code data).

- **Typographic Hierarchy**:
  - H1 (Page Title): Inter SemiBold / 32px / -0.02em letter spacing
  - H2 (Section Headers): Inter SemiBold / 24px / -0.01em letter spacing
  - H3 (Card Titles): Inter Medium / 18px / normal letter spacing
  - Body (Default Text): Inter Regular / 15px / normal / 1.6 line height
  - Small (Meta Info): Inter Regular / 13px / normal / 1.5 line height
  - Code (IDs/Phone): JetBrains Mono Regular / 14px / normal / monospace precision

## Animations

Animations should communicate system state changes clearly and professionally—subtle enough to feel polished but functional enough to guide attention during critical status updates. The balance leans heavily toward functionality over delight in this high-stakes context.

- **Purposeful Meaning**: Smooth state transitions communicate progress and system responsiveness; pulsing indicators show active call states; sliding notifications confirm actions without disrupting workflow
- **Hierarchy of Movement**: 
  1. Critical alerts (rejection/errors) – immediate attention with subtle shake or color pulse
  2. Status changes – smooth fade/slide transitions as calls progress
  3. List updates – gentle stagger as new transactions appear
  4. Background elements – minimal motion to maintain focus on active transactions

## Component Selection

- **Components**: 
  - **Card** – Primary container for transaction details and call status (with border accent by status)
  - **Form** + **Input** + **Label** – Transaction creation form with validation
  - **Button** – Primary actions (initiate call, retry) with loading states
  - **Badge** – Status indicators (pending, calling, approved, rejected) with color coding
  - **Table** – Transaction history list with sortable columns
  - **Dialog** – Detailed audit trail view for individual transactions
  - **Tabs** – Switch between "New Transaction", "Active Calls", "History" views
  - **Alert** – System notifications and error states
  - **Separator** – Visual grouping of form sections and status panels
  - **ScrollArea** – Audit log viewer with many entries

- **Customizations**: 
  - Status-aware Card borders that change color based on transaction state
  - Custom pulsing animation component for "calling" state
  - DTMF keypad visualization component showing which key was pressed
  - Timeline component for call flow progression

- **States**: 
  - Buttons: default (solid primary), hover (slightly darker), loading (spinner + disabled), disabled (muted)
  - Inputs: default (border), focus (ring accent), error (red border + message), filled (subtle background)
  - Cards: idle (neutral), active (primary border), success (green border), error (red border)

- **Icon Selection**: 
  - Phone (call initiation), PhoneCall (active call), PhoneDisconnect (ended call)
  - CheckCircle (approved), XCircle (rejected), Warning (escalated)
  - Clock (pending), Timer (timeout), ArrowClockwise (retry)
  - List (transaction list), ChartBar (analytics), FileText (audit log)

- **Spacing**: 
  - Container padding: p-6 (24px)
  - Card gap: gap-4 (16px)
  - Form fields: space-y-4 (16px vertical)
  - Inline elements: gap-2 (8px)
  - Section margins: mb-8 (32px)

- **Mobile**: 
  - Single-column layout on mobile (form fields stack)
  - Transaction cards become full-width with condensed details
  - Table switches to card-based list view
  - Bottom-fixed action buttons for primary CTAs
  - Collapsible audit trail sections to reduce vertical scroll
