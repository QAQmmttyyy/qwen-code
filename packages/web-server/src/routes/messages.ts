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

    console.log(`💬 Sending message to session: ${sessionId}`);
    console.log(
      `📝 Message: ${request.message.substring(0, 100)}${request.message.length > 100 ? '...' : ''}`,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let eventCount = 0;
    const startTime = Date.now();

    try {
      for await (const event of agentService.streamMessage(
        sessionId,
        request.message,
      )) {
        eventCount++;
        console.log(
          `📡 Stream Event #${eventCount}:`,
          JSON.stringify(event, null, 2),
        );
        res.write(`data: ${JSON.stringify(event)}\n\n`);

        // Flush immediately for real-time streaming
        // See: https://github.com/expressjs/compression#server-sent-events
        res.flush();
      }

      const duration = Date.now() - startTime;
      console.log(
        `✅ Message stream completed: ${sessionId}, ${eventCount} events, ${duration}ms`,
      );
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ Message stream error: ${sessionId}, ${errorMessage}`);
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`,
      );
      res.end();
    }
  });

  return router;
}
