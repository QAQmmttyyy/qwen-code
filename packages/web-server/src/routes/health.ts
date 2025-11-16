/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentService } from '../agent-service.js';

/**
 * Create health check routes
 */
export function createHealthRoutes(agentService: AgentService): Router {
  const router = Router();

  /**
   * GET /health
   * Health check endpoint
   */
  router.get('/', (_req: Request, res: Response) => {
    const stats = agentService.getStats();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeSessions: stats.activeSessions,
      version: process.env['npm_package_version'] || '0.1.1',
    });
  });

  /**
   * GET /health/ready
   * Readiness check endpoint
   */
  router.get('/ready', (_req: Request, res: Response) => {
    res.json({
      ready: true,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /health/live
   * Liveness check endpoint
   */
  router.get('/live', (_req: Request, res: Response) => {
    res.json({
      alive: true,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
