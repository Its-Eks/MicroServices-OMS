## Queue & Events

`queue.service.ts` provides a simple pub/sub for domain events like `onboarding.transitioned`.

### Typical Events
- onboarding.created
- onboarding.transitioned
- onboarding.completed

### Consumers
- Email dispatchers
- Metrics/observability pipelines
- SLA monitors

Replace the in-memory queue with Redis, RabbitMQ, or a hosted service for production.


