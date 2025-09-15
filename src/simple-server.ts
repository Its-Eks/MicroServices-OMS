import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '3004');

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'onboarding-service',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Onboarding Service is running!',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api/onboarding/*'
    }
  });
});

app.listen(port, () => {
  console.log(`🚀 Onboarding Service running on port ${port}`);
  console.log(`🔗 Health check: http://localhost:${port}/health`);
});

export default app;
