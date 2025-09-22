## Postman Usage

### Environment Variables
- baseUrl: `http://localhost:3031` (or your deploy URL)
- onboardingId: set from create response

### Collection Flow
1. Auth (if applicable)
2. Create onboarding: POST /onboarding
3. Get onboarding: GET /onboarding/:id
4. Transition through steps: POST /onboarding/:id/transition
5. Verify history: GET /onboarding/:id/history
6. List all: GET /onboarding

Responses follow `{ success, data }` pattern for easy tests.


