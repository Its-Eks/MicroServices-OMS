## REST API Endpoints

Base URL depends on runtime (see Configuration). Examples assume `/`.

### GET /onboarding
List active onboarding records.

Response: `{ success: true, data: OnboardingSummary[] }`

### POST /onboarding
Create/initiate an onboarding record for a customer/order.

Body: `{ customerId, orderId, metadata? }`
Response: `{ success: true, data: Onboarding }`

### GET /onboarding/:id
Fetch a single onboarding record with steps and current state.

### GET /onboarding/:id/history
Return workflow history entries with timestamps and actors.

### POST /onboarding/:id/transition
Advance workflow to the next state.

Body: `{ to: CanonicalStepId, reason?: string }`
Response: `{ success: true, data: Onboarding }`

### GET /onboarding/steps/canonical
Return ordered canonical steps and descriptions.

### GET /health
Basic health-check.

Notes:
- All responses normalize to `{ success, data }` shape where possible
- Errors follow `{ success: false, error: { code, message } }`


