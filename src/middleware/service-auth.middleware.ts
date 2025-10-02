import { Request, Response, NextFunction } from 'express';

/**
 * Service Authentication Middleware
 * Ensures only authorized services (like the main OMS server) can access payment endpoints
 */
export function serviceAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const serviceKey = req.headers['x-service-key'] as string;
  const forwardedFrom = req.headers['x-forwarded-from'] as string;
  const expectedServiceKey = process.env.ONBOARDING_SERVICE_API_KEY || 'default-service-key';

  // Allow webhook endpoints to bypass service auth (they need to be publicly accessible)
  if (req.path === '/webhook' && req.method === 'POST') {
    console.log('[ServiceAuth] Allowing webhook access');
    return next();
  }

  // Check for service authentication
  if (!serviceKey || serviceKey !== expectedServiceKey) {
    console.warn('[ServiceAuth] Unauthorized service access attempt:', {
      path: req.path,
      method: req.method,
      serviceKey: serviceKey ? 'provided' : 'missing',
      forwardedFrom,
      ip: req.ip
    });

    res.status(401).json({
      success: false,
      error: { 
        message: 'Unauthorized: Invalid service credentials',
        code: 'INVALID_SERVICE_KEY'
      }
    });
    return;
  }

  // Log authorized access
  console.log('[ServiceAuth] Authorized service access:', {
    path: req.path,
    method: req.method,
    forwardedFrom,
    userId: req.headers['x-user-id']
  });

  next();
}

/**
 * CORS configuration for service-to-service communication
 */
export const serviceCorsPolicyMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;
  const forwardedFrom = req.headers['x-forwarded-from'];

  // Allow requests from the main OMS server
  const allowedOrigins = [
    'http://localhost:3003', // Main OMS server
    process.env.OMS_SERVER_URL
  ].filter(Boolean);

  // Allow if forwarded from authorized service or from allowed origins
  if (forwardedFrom === 'oms-server' || (origin && allowedOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin || 'http://localhost:3003');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-service-key, x-user-id, x-forwarded-from');
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
};
