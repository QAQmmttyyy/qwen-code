/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentService } from '../agent-service.js';
import type { SendMessageRequest } from '../types.js';
import { HttpError } from '../middleware/error-handler.js';

/**
 * Create message routes
 */
export function createMessageRoutes(agentService: AgentService): Router {
  const router = Router();

  /**
   * POST /api/sessions/:id/messages
   * Send a message (streaming via SSE)
   */
  router.post('/:id/messages', async (req: Request, res: Response) => {
    const sessionId = req.params['id'];
    if (!sessionId) {
      throw new HttpError(400, 'Session ID is required');
    }

    const request: SendMessageRequest = req.body;
    if (!request.message) {
      throw new HttpError(400, 'Message is required');
    }

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
      // Stream raw ServerGeminiStreamEvent
      for await (const event of agentService.streamMessage(
        sessionId,
        request.message,
      )) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`,
      );
      res.end();
    }
  });

  return router;
}
