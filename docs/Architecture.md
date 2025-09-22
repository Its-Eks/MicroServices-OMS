## Architecture

The Onboarding Service is a Node.js/Express application that implements a PRD-compliant onboarding workflow and related APIs.

### Components
- Server (Express): `src/server.ts` / `src/simple-server.ts`
- Controller: `src/controllers/onboarding.controller.ts`
- Services:
  - `onboarding.service.ts`: workflow steps, transitions, state normalization
  - `database.service.ts`: persistence interface (mock or real DB)
  - `queue.service.ts`: simple in-memory queue/event dispatcher
- Middleware:
  - `logger.middleware.ts`
  - `error.middleware.ts`

### Data Flow
1. Client calls REST endpoints (create/fetch/transition onboarding)
2. Controller validates, calls OnboardingService
3. OnboardingService reads/writes via DatabaseService
4. Events emitted to QueueService for async side-effects (emails, metrics)
5. Responses normalized to the canonical 10-step workflow

### Notes
- Works standalone or as a reference for OMS integration
- Swap `database.service.ts` with a real DB adapter when needed


