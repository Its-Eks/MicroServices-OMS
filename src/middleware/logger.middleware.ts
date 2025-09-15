import { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  // Log request
  console.log(`[${timestamp}] ${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    ...(req.body && Object.keys(req.body).length > 0 && { body: req.body }),
    ...(req.query && Object.keys(req.query).length > 0 && { query: req.query }),
    ...(req.params && Object.keys(req.params).length > 0 && { params: req.params })
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): any {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] ${req.method} ${req.url} - ${res.statusCode}`, {
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      contentType: res.get('Content-Type')
    });

    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

export const createLogger = (service: string) => {
  return {
    info: (message: string, meta?: any) => {
      console.log(`[${new Date().toISOString()}] [INFO] [${service}] ${message}`, meta || '');
    },
    warn: (message: string, meta?: any) => {
      console.warn(`[${new Date().toISOString()}] [WARN] [${service}] ${message}`, meta || '');
    },
    error: (message: string, meta?: any) => {
      console.error(`[${new Date().toISOString()}] [ERROR] [${service}] ${message}`, meta || '');
    },
    debug: (message: string, meta?: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[${new Date().toISOString()}] [DEBUG] [${service}] ${message}`, meta || '');
      }
    }
  };
};
