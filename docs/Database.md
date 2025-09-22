## Persistence Model

Default implementation uses an in-memory map for simplicity. Swap `database.service.ts` with a real adapter for PostgreSQL/MongoDB.

### Entities
- Onboarding
  - id (uuid)
  - customerId
  - orderId
  - steps: array of `{ id, name, description, status }`
  - currentStepId
  - history: array of `{ from, to, at, by?, reason? }`
  - metadata

### Operations
- createOnboarding
- getOnboardingById
- listOnboarding
- updateOnboarding (step changes, history append)

### Migration Guidance
If using SQL, create tables:
- onboarding
- onboarding_steps
- onboarding_history

Match canonical step IDs in `OnboardingWorkflow.md`.

