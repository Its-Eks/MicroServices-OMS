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

  // Build allowed origin list from env for both service-to-service and public browser calls
  const corsEnvOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const allowedOrigins = [
    // Local defaults
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:3003',
    'https://microservices-oms.onrender.com',
    'https://oms-client-01ry.onrender.com',
    'https://oms-server-ntlv.onrender.com',
    // Hosted/service origins
    process.env.OMS_SERVER_URL,
    ...corsEnvOrigins
  ].filter(Boolean) as string[];

  // Allow if forwarded from authorized service or from allowed origins
  const isAllowedOrigin = Boolean(origin && allowedOrigins.includes(origin));
  const isForwardedFromOms = forwardedFrom === 'oms-server';

  if (isForwardedFromOms || isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin || 'http://localhost:3003');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-service-key, x-user-id, x-forwarded-from');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
    return;
  }

  // If origin is not allowed here, defer to the global cors() middleware to handle
  next();
};
