import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { TraceManager, TraceContext } from '../lib/trace';

/**
 * Middleware to initialize a trace context for every request
 */
export const traceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const context: TraceContext = {
    traceId: (req.headers['x-trace-id'] as string) || uuidv4(),
  };

  // Wrap the entire request lifecycle in the trace context
  TraceManager.run(context, () => {
    // Attach to req for easy access
    (req as any).traceContext = context;
    // Standard accessors for Controllers/Views
    (req as any).traceId = context.traceId;
    res.locals.traceId = context.traceId;
    
    // Set Header for Debugging
    res.setHeader('X-Trace-ID', context.traceId);
    
    next();
  });
};
