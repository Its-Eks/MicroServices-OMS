## Onboarding Service - Capabilities, Gaps, and How to Test

### Purpose
The onboarding-service orchestrates the steps that transform a newly created or trial customer into an active, production-ready customer. It manages workflow steps, ownership, notifications, and exposes APIs for status/analytics. It complements (and is different from) simply “adding a customer”, which is just a single database insert.

### What it does today (Implemented)
- Create customer (DB-first, in-memory fallback): `POST /api/onboarding/customers`
- Initiate onboarding workflow (new_customer or trial): `POST /api/onboarding/initiate`
- Fetch onboarding status and steps:
  - `GET /api/onboarding/:id`
  - `GET /api/onboarding/:id/steps`
  - Update/advance step: `PUT /api/onboarding/:id/step/:stepId`
- List active onboardings: `GET /api/onboarding/active`
- Fetch current onboarding for a customer: `GET /api/onboarding/customer/:customerId`
- Assign an owner: `PATCH /api/onboarding/:id/assign`
- Queue notifications (email job via BullMQ): `POST /api/onboarding/:id/notify`
- Trial helpers:
  - List trial customers: `GET /api/onboarding/trial-customers`
  - Convert trial to customer: `POST /api/onboarding/trials/:id/convert`
- Webhooks (minimal handling): `/webhooks/email`, `/webhooks/shipping`, `/webhooks/equipment`
- Health endpoint: `GET /health`

### What is minimal or not production-grade yet
- Email delivery is simulated (console logs); no provider integration (e.g., SendGrid) yet.
- Analytics endpoint uses mock values instead of aggregations from Postgres.
- Notify payload shaping/templates are basic; no template versioning, no rich variables, limited retry/backoff policies.
- No SLA/escalation rules, reminder scheduling, or rule-engine for automated step transitions.
- No pagination/filtering for lists; no idempotency keys on mutating endpoints; limited auditing.
- MongoDB is wired but not actively used for the onboarding domain.

### Architecture (at a glance)
- HTTP API (Express), Postgres (primary storage), Redis (BullMQ queues/workers), optional MongoDB (not currently used).
- BullMQ workers require Redis option `maxRetriesPerRequest = null` (already set in code) to start cleanly.

### Environment variables (minimal local set)
Create `.env` in this directory:
```
PORT=3004
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
POSTGRES_SSL=false
REDIS_URL=redis://:PASSWORD@localhost:6379
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=onboarding_db
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```
Notes:
- Use your actual Postgres/Redis credentials in hosted environments. For Render-managed Redis, `rediss://` is supported; TLS is auto-enabled.
- If Postgres is unreachable, customer creation falls back to in-memory storage (for development only).

### Run locally
1) Start Redis (example using OMS_Server compose):
```
cd ../OMS_Server
docker compose up -d redis
```
2) Start onboarding-service:
```
cd ../onboarding-service
npm install
npm run dev
```
3) Health check (ensure no trailing spaces in URL):
```
curl http://localhost:3004/health
```

### Test the APIs (direct)
All examples below assume localhost:3004.

1) Create customer (DB-first, falls back to in-memory if DB not connected)
```
curl -X POST http://localhost:3004/api/onboarding/customers \
  -H "Content-Type: application/json" \
  -d '{
    "firstName":"Jane",
    "lastName":"Smith",
    "email":"jane.smith@example.com",
    "phone":"+1-555-111-2222",
    "address":{
      "street":"1 Test Way",
      "city":"Austin",
      "state":"TX",
      "postalCode":"73301",
      "country":"USA"
    },
    "customerType":"individual",
    "isTrial":true
  }'
```

2) Initiate onboarding (requires an existing customer id from DB)
```
curl -X POST http://localhost:3004/api/onboarding/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "customerId":"<customer-uuid>",
    "onboardingType":"trial",
    "assignedTo":"ops.user@company.com"
  }'
```

3) List active onboardings
```
curl http://localhost:3004/api/onboarding/active
```

4) Get onboarding detail
```
curl http://localhost:3004/api/onboarding/<onboardingId>
```

5) Update/advance a step
```
curl -X PUT http://localhost:3004/api/onboarding/<onboardingId>/step/service_setup \
  -H "Content-Type: application/json" \
  -d '{"notes":"Provisioning started"}'
```

6) Assign owner
```
curl -X PATCH http://localhost:3004/api/onboarding/<onboardingId>/assign \
  -H "Content-Type: application/json" \
  -d '{"assignedTo":"ops.user@company.com"}'
```

7) Queue a notification (email job)
```
curl -X POST http://localhost:3004/api/onboarding/<onboardingId>/notify \
  -H "Content-Type: application/json" \
  -d '{"type":"welcome","template":"welcome","variables":{"firstName":"Jane"}}'
```

8) Trial helpers
```
curl http://localhost:3004/api/onboarding/trial-customers
curl -X POST http://localhost:3004/api/onboarding/trials/<onboardingId>/convert
```

### Testing via OMS_Server proxy (optional)
To exercise the same flows through the gateway:
1) In `OMS_Server/.env` set:
```
ONBOARDING_SERVICE_URL=http://localhost:3004
ONBOARDING_CUSTOMER_CREATE_PATH=/api/onboarding/customers
```
Restart OMS_Server and test:
```
curl http://localhost:3003/onboarding/active
curl http://localhost:3003/onboarding/<id>
curl -X PATCH http://localhost:3003/onboarding/<id>/assign -H "Content-Type: application/json" -d '{"assignedTo":"ops@company.com"}'
curl -X POST http://localhost:3003/onboarding/<id>/notify -H "Content-Type: application/json" -d '{"type":"welcome"}'
```

### Troubleshooting
- 404 on `/health%20`: remove trailing spaces; use exact URL `/health`.
- 502/503 when hosted: warm the service by calling `/health` before POSTs; the main server includes retry/warmup logic.
- Workers don’t start: ensure Redis is reachable and `maxRetriesPerRequest` is `null` (already set).
- Customer create 400: ensure phone and full address fields are provided; camelCase or snake_case both supported.

### Roadmap (to reach production-grade)
- Integrate a real email provider (SendGrid/Mailgun) with templates and robust retries.
- Add pagination/filtering to lists; idempotency keys for POST/PATCH operations.
- Replace mock analytics with DB-backed aggregations and add audit logs.
- Implement SLA/reminders and a rules engine for automated transitions.
- Harden webhooks (auth, validation, idempotency) and add replay.


