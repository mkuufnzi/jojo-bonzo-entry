import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  userId?: string;
  appId?: string;
  traceId: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

export const TraceManager = {
  /**
   * Run a function within a trace context
   */
  run(context: TraceContext, fn: () => void) {
    return storage.run(context, fn);
  },

  /**
   * Get the current trace context
   */
  getContext(): TraceContext | undefined {
    return storage.getStore();
  },

  /**
   * Helper to ensure we have a trace ID
   */
  getTraceId(): string {
    return storage.getStore()?.traceId || 'unknown';
  }
};
