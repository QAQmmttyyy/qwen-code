/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentService } from '../agent-service.js';
import type { CreateSessionRequest } from '../types.js';
import { HttpError } from '../middleware/error-handler.js';

/**
 * Create session routes
 */
export function createSessionRoutes(agentService: AgentService): Router {
  const router = Router();

  /**
   * POST /api/sessions
   * Create a new session
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const request: CreateSessionRequest = req.body;
      const response = await agentService.createSession(request);
      res.status(201).json(response);
    } catch (error) {
      throw new HttpError(
        500,
        `Failed to create session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  /**
   * GET /api/sessions/:id
   * Get session information
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const sessionId = req.params['id'];
      if (!sessionId) {
        throw new HttpError(400, 'Session ID is required');
      }

      const sessionInfo = agentService.getSessionInfo(sessionId);
      res.json(sessionInfo);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new HttpError(404, error.message);
      }
      throw error;
    }
  });

  /**
   * DELETE /api/sessions/:id
   * Delete a session
   */
  router.delete('/:id', (req: Request, res: Response) => {
    const sessionId = req.params['id'];
    if (!sessionId) {
      throw new HttpError(400, 'Session ID is required');
    }

    const deleted = agentService.deleteSession(sessionId);
    if (!deleted) {
      throw new HttpError(404, `Session not found: ${sessionId}`);
    }

    res.status(204).send();
  });

  /**
   * GET /api/sessions/:id/history
   * Get conversation history
   */
  router.get('/:id/history', (req: Request, res: Response) => {
    try {
      const sessionId = req.params['id'];
      if (!sessionId) {
        throw new HttpError(400, 'Session ID is required');
      }

      const history = agentService.getHistory(sessionId);
      res.json(history);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new HttpError(404, error.message);
      }
      throw error;
    }
  });

  /**
   * GET /api/sessions
   * Get all active sessions
   */
  router.get('/', (_req: Request, res: Response) => {
    const stats = agentService.getStats();
    res.json(stats);
  });

  return router;
}
