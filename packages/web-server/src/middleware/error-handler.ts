/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';
import type { ErrorResponse } from '../types.js';

/**
 * Custom error class with status code
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('❌ Error:', err);

  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const message = err.message || 'Internal server error';

  const errorResponse: ErrorResponse = {
    error: err.name || 'Error',
    message,
    statusCode,
  };

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(_req: Request, res: Response): void {
  const errorResponse: ErrorResponse = {
    error: 'NotFound',
    message: 'The requested resource was not found',
    statusCode: 404,
  };

  res.status(404).json(errorResponse);
}
