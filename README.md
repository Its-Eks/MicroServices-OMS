# Onboarding Service

A dedicated microservice for handling customer onboarding workflows in the OMS (Order Management System).

## Features

- **Customer Onboarding Management**: Complete onboarding workflow management
- **Trial Customer Support**: Specialized handling for trial customers
- **Queue-based Processing**: Asynchronous job processing with Redis/BullMQ
- **Webhook Support**: Integration with external services (email, shipping, equipment)
- **Analytics**: Onboarding metrics and reporting
- **Multi-database Support**: PostgreSQL for transactional data, MongoDB for workflow data

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   OMS Server    │───▶│  Onboarding      │───▶│   Databases     │
│   (Main API)    │    │  Service         │    │   PostgreSQL    │
└─────────────────┘    └──────────────────┘    │   MongoDB       │
                              │                 │   Redis         │
                              ▼                 └─────────────────┘
                       ┌──────────────────┐
                       │   Queue System   │
                       │   (BullMQ)       │
                       └──────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL
- MongoDB
- Redis

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd onboarding-service
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your database credentials
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Start the service:**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Endpoints

### Onboarding Management

- `POST /api/onboarding/initiate` - Start new onboarding process
- `GET /api/onboarding/:id` - Get onboarding status
- `GET /api/onboarding/customer/:customerId` - Get customer's active onboarding
- `PUT /api/onboarding/:id/step/:stepId` - Update onboarding step
- `GET /api/onboarding/:id/steps` - Get onboarding steps

### Trial Management

- `GET /api/onboarding/trials/list` - Get trial customers
- `POST /api/onboarding/trials/:id/convert` - Convert trial to customer

### Analytics

- `GET /api/onboarding/analytics/overview` - Get onboarding analytics

### Webhooks

- `POST /webhooks/email` - Email service webhooks
- `POST /webhooks/shipping` - Shipping service webhooks
- `POST /webhooks/equipment` - Equipment service webhooks

## Onboarding Workflow

The service follows a structured onboarding process:

1. **Initiated** - Onboarding process started
2. **Welcome Sent** - Welcome email sent to customer
3. **Service Setup** - Service configuration completed
4. **Equipment Ordered** - Equipment ordered for installation
5. **Equipment Shipped** - Equipment shipped to customer
6. **Installation Scheduled** - Installation appointment scheduled
7. **Installation Completed** - Service installation completed
8. **Service Activated** - Service activated and tested
9. **Follow-up** - Post-activation follow-up
10. **Completed** - Onboarding process completed

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3004` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `MONGODB_URI` | MongoDB connection string | Required |
| `REDIS_URL` | Redis connection string | Required |
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:3000` |

### Database Schema

The service uses the existing OMS database schema with the `customer_onboarding` table:

```sql
CREATE TABLE customer_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  order_id UUID REFERENCES orders(id),
  onboarding_type VARCHAR(20) NOT NULL,
  current_step VARCHAR(50) NOT NULL,
  completion_percentage INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES users(id),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  notes TEXT
);
```

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run build:watch` - Build with file watching
- `npm run clean` - Clean build directory
- `npm run health` - Check service health

### Project Structure

```
src/
├── controllers/          # API controllers
│   └── onboarding.controller.ts
├── services/            # Business logic services
│   ├── database.service.ts
│   ├── onboarding.service.ts
│   └── queue.service.ts
├── middleware/          # Express middleware
│   ├── error.middleware.ts
│   └── logger.middleware.ts
└── server.ts           # Main server file
```

## Integration with Main OMS

To integrate this service with your main OMS server:

1. **Update OMS Server Routes:**
   ```typescript
   // OMS_Server/src/Routes/onboarding.routes.ts
   import { OnboardingProxyService } from '../services/onboarding-proxy.service';
   
   const onboardingProxy = new OnboardingProxyService();
   
   router.post('/initiate', async (req, res) => {
     const result = await onboardingProxy.initiateOnboarding(req.body);
     res.json(result);
   });
   ```

2. **Create Proxy Service:**
   ```typescript
   // OMS_Server/src/services/onboarding-proxy.service.ts
   import axios from 'axios';
   
   export class OnboardingProxyService {
     private baseURL = process.env.ONBOARDING_SERVICE_URL || 'http://localhost:3004';
     
     async initiateOnboarding(data: any) {
       const response = await axios.post(`${this.baseURL}/api/onboarding/initiate`, data);
       return response.data;
     }
   }
   ```

## Monitoring

### Health Check

The service provides a health check endpoint:

```bash
curl http://localhost:3004/health
```

Response:
```json
{
  "status": "healthy",
  "service": "onboarding-service",
  "timestamp": "2025-01-10T10:00:00.000Z",
  "uptime": 3600
}
```

### Queue Monitoring

Monitor queue statistics:

```bash
curl http://localhost:3004/api/onboarding/analytics/overview
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3004
CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  onboarding-service:
    build: ./onboarding-service
    ports:
      - "3004:3004"
    environment:
      - DATABASE_URL=postgresql://user:password@postgres:5432/oms_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check database credentials in `.env`
   - Ensure databases are running
   - Verify network connectivity

2. **Redis Connection Failed**
   - Check Redis server status
   - Verify Redis URL in `.env`
   - Check Redis configuration

3. **Queue Jobs Not Processing**
   - Check Redis connection
   - Verify queue worker is running
   - Check job logs for errors

### Logs

The service provides detailed logging for debugging:

```bash
# Development logs
npm run dev

# Production logs
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License

## Integration with OMS_Server (Simple Guide)

### Setup
- Ensure both services use the same PostgreSQL database.
- onboarding-service env:
  - `DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB`
  - `POSTGRES_SSL=true` (if cloud)
- OMS_Server env:
  - `POSTGRES_*` (host, user, password, db, port=5432, ssl=true)
  - `ONBOARDING_SERVICE_URL=http://localhost:3004`

### How it connects
- OMS_Server routes under `/customers` proxy customer creation to onboarding-service.
- On success, onboarding-service returns the created row (from PostgreSQL when connected).
- OMS_Server reads lists/stats from PostgreSQL; some endpoints fall back to onboarding-service if DB is down.

### Onboarding endpoints used by OMS_Server
- `POST /api/onboarding/customers` → Create customer (accepts camelCase or snake_case)
- `GET /api/onboarding/customers` → Fallback list used by OMS_Server
- `GET /api/onboarding/trial-customers` → Fallback for trial list

### Data flow (create)
1) Client → OMS_Server `POST /customers`
2) OMS_Server → onboarding-service `POST /api/onboarding/customers`
3) Onboarding → PostgreSQL insert → returns created customer
4) OMS_Server → Client

### Quick test
1) Start onboarding-service: `npm run dev`
2) Start OMS_Server: `npm run dev`
3) Create customer on OMS_Server:
```bash
curl -s -X POST http://localhost:3003/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"firstName":"John","lastName":"Doe","email":"john.doe@example.com","phone":"+1234567890","address":{"street":"123 Main St","city":"New York","state":"NY","postalCode":"10001","country":"USA"},"customerType":"individual","isTrial":false}'
```
4) List customers (DB):
```bash
curl -s -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3003/customers
```

### Troubleshooting
- If create returns 404, set `ONBOARDING_CUSTOMER_CREATE_PATH=/api/onboarding/customers` on OMS_Server.
- If lists are empty, ensure both services connect to the same PostgreSQL.
- URL-encode emails for `/customers/email/:email` on OMS_Server.
