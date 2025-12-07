/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';

const SKIP_PATHS = ['/health', '/health/ready', '/health/live'];

/**
 * Request logging middleware
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const shouldSkipLog = SKIP_PATHS.includes(req.path);

  if (shouldSkipLog) {
    next();
    return;
  }

  const start = Date.now();

  console.log(`📥 ${req.method} ${req.path}`);

  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📝 Request Body:', JSON.stringify(req.body, null, 2));
  }

  if (req.query && Object.keys(req.query).length > 0) {
    console.log('🔍 Query Params:', JSON.stringify(req.query, null, 2));
  }

  const originalWrite = res.write;
  const originalEnd = res.end;
  const chunks: Buffer[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.write = function (chunk: any, ...args: any[]): boolean {
    if (chunk) {
      chunks.push(Buffer.from(chunk));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalWrite.apply(res, [chunk, ...args] as any);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = function (chunk?: any, ...args: any[]): any {
    if (chunk) {
      chunks.push(Buffer.from(chunk));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalEnd.apply(res, [chunk, ...args] as any);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '🔴' : '✅';
    console.log(
      `${statusColor} ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`,
    );

    const contentType = res.getHeader('content-type') as string;

    if (contentType?.includes('application/json') && chunks.length > 0) {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const jsonBody = JSON.parse(body);
        console.log('📤 Response Body:', JSON.stringify(jsonBody, null, 2));
      } catch (_error) {
        console.log(
          '📤 Response Body (raw):',
          Buffer.concat(chunks).toString('utf8'),
        );
      }
    } else if (contentType?.includes('text/event-stream')) {
      const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`📡 SSE Stream: ${totalBytes} bytes sent`);
    }

    console.log('─'.repeat(60));
  });

  next();
}
