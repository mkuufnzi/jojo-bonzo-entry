import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/AppError';

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[Error] ${req.method} ${req.url}:`, err);

  let statusCode = err instanceof AppError ? err.statusCode : 500;
  
  // Handle specific errors
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
      statusCode = 400;
      err.message = `Invalid JSON payload: ${err.message}`;
  }

  if (statusCode === 400) {
      console.warn(`[400 Error Context] ${req.method} ${req.url}:`, {
          body: req.body,
          headers: req.headers,
          error: err
      });
  }

  const isApi = req.path.startsWith('/api') || req.path.includes('/api/') || req.xhr || req.headers.accept?.indexOf('json') !== -1;

  if (isApi) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        status: 'error',
        message: err.message,
      });
    }

    if (err instanceof ZodError) {
      return res.status(400).json({
        status: 'fail',
        error: 'Validation Error',
        message: 'The provided data is invalid.',
        details: err.issues.map(i => ({ path: i.path, message: i.message }))
      });
    }

    // Default API Error Response
    return res.status(statusCode).json({
      status: 'error',
      error: statusCode === 400 ? 'Bad Request' : 'Internal Server Error',
      message: (process.env.NODE_ENV === 'production' && statusCode >= 500) 
        ? 'An unexpected error occurred' 
        : err.message,
    });
  }

  // Web Request - Render Error Page
  res.status(statusCode).render('error', {
    title: 'Error',
    message: process.env.NODE_ENV === 'production' && statusCode === 500 
      ? 'An unexpected error occurred. Please try again later.' 
      : err.message || 'Something went wrong',
    error: process.env.NODE_ENV !== 'production' ? err : {},
    status: statusCode
  });
};

