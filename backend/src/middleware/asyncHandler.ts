import type { RequestHandler } from 'express';

/**
 * Envolve um handler async para que erros sejam repassados ao middleware de erro do Express
 * em vez de virarem unhandledRejection (que pode derrubar o processo no Express 4).
 */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
