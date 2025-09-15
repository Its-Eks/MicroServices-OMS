import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { statusCode = 500, message, code = 'INTERNAL_ERROR' } = error;

  // Log error details
  console.error('Error occurred:', {
    message,
    code,
    statusCode,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorMessage = isDevelopment ? message : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: {
      message: errorMessage,
      code,
      ...(isDevelopment && { stack: error.stack })
    }
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND'
    }
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Common error creators
export const createValidationError = (message: string) => 
  new AppError(message, 400, 'VALIDATION_ERROR');

export const createNotFoundError = (resource: string) => 
  new AppError(`${resource} not found`, 404, 'NOT_FOUND');

export const createUnauthorizedError = (message: string = 'Unauthorized') => 
  new AppError(message, 401, 'UNAUTHORIZED');

export const createForbiddenError = (message: string = 'Forbidden') => 
  new AppError(message, 403, 'FORBIDDEN');

export const createConflictError = (message: string) => 
  new AppError(message, 409, 'CONFLICT');

export const createInternalError = (message: string = 'Internal server error') => 
  new AppError(message, 500, 'INTERNAL_ERROR');
