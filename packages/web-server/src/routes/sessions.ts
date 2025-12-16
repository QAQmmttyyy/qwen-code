/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AgentService } from '../agent-service.js';
import type {
  CreateSessionRequest,
  ToolConfirmationRequest,
} from '../types.js';
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
      console.log('🆕 Creating new session...');
      const response = await agentService.createSession(request);
      console.log(`✅ Session created: ${response.sessionId}`);
      res.status(201).json(response);
    } catch (error) {
      console.error('❌ Failed to create session:', error);
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

      console.log(`📋 Getting session info: ${sessionId}`);
      const sessionInfo = agentService.getSessionInfo(sessionId);
      console.log(`✅ Session info retrieved: ${sessionId}`);
      res.json(sessionInfo);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        console.error(`❌ Session not found: ${req.params['id']}`);
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

    console.log(`🗑️  Deleting session: ${sessionId}`);
    const deleted = agentService.deleteSession(sessionId);
    if (!deleted) {
      console.error(`❌ Session not found: ${sessionId}`);
      throw new HttpError(404, `Session not found: ${sessionId}`);
    }

    console.log(`✅ Session deleted: ${sessionId}`);
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

      console.log(`📜 Getting history: ${sessionId}`);
      const history = agentService.getHistory(sessionId);
      console.log(
        `✅ History retrieved: ${sessionId}, ${history.history.length} messages`,
      );
      res.json(history);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        console.error(`❌ Session not found: ${req.params['id']}`);
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
    console.log('📊 Getting all sessions stats');
    const stats = agentService.getStats();
    console.log(`✅ Stats retrieved: ${stats.activeSessions} active sessions`);
    res.json(stats);
  });

  /**
   * POST /api/sessions/:id/tools/:callId/confirm
   * Confirm a tool execution
   */
  router.post(
    '/:id/tools/:callId/confirm',
    async (req: Request, res: Response) => {
      try {
        const sessionId = req.params['id'];
        const callId = req.params['callId'];

        if (!sessionId || !callId) {
          throw new HttpError(400, 'Session ID and Call ID are required');
        }

        const confirmationRequest: ToolConfirmationRequest = req.body;

        if (!confirmationRequest.outcome) {
          throw new HttpError(400, 'Confirmation outcome is required');
        }

        console.log(
          `🔧 Tool confirmation: ${sessionId}/${callId} - ${confirmationRequest.outcome}`,
        );

        const response = await agentService.confirmToolCall(
          sessionId,
          callId,
          confirmationRequest,
        );

        console.log(`✅ Tool confirmed: ${sessionId}/${callId}`);
        res.json(response);
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          console.error(
            `❌ Session or tool not found: ${req.params['id']}/${req.params['callId']}`,
          );
          throw new HttpError(404, error.message);
        }
        console.error('❌ Failed to confirm tool:', error);
        throw error;
      }
    },
  );

  /**
   * GET /api/sessions/:id/approval-mode
   * Get current ApprovalMode for a session
   */
  router.get('/:id/approval-mode', (req: Request, res: Response) => {
    try {
      const sessionId = req.params['id'];
      if (!sessionId) {
        throw new HttpError(400, 'Session ID is required');
      }

      console.log(`🔍 Getting ApprovalMode: ${sessionId}`);
      const approvalMode = agentService.getApprovalMode(sessionId);
      console.log(`✅ ApprovalMode retrieved: ${sessionId} - ${approvalMode}`);
      res.json({ approvalMode });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        console.error(`❌ Session not found: ${req.params['id']}`);
        throw new HttpError(404, error.message);
      }
      throw error;
    }
  });

  /**
   * PUT /api/sessions/:id/approval-mode
   * Update ApprovalMode for a session
   */
  router.put('/:id/approval-mode', (req: Request, res: Response) => {
    try {
      const sessionId = req.params['id'];
      if (!sessionId) {
        throw new HttpError(400, 'Session ID is required');
      }

      const { approvalMode } = req.body;
      if (!approvalMode) {
        throw new HttpError(400, 'ApprovalMode is required');
      }

      console.log(`🔧 Updating ApprovalMode: ${sessionId} - ${approvalMode}`);
      agentService.setApprovalMode(sessionId, approvalMode);
      console.log(`✅ ApprovalMode updated: ${sessionId} - ${approvalMode}`);
      res.json({ success: true, approvalMode });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        console.error(`❌ Session not found: ${req.params['id']}`);
        throw new HttpError(404, error.message);
      }
      throw error;
    }
  });

  /**
   * PUT /api/sessions/:id/history
   * Load conversation history into an existing session
   */
  router.put('/:id/history', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params['id'];
      if (!sessionId) {
        throw new HttpError(400, 'Session ID is required');
      }

      const { filename } = req.body;
      if (!filename) {
        throw new HttpError(400, 'Filename is required');
      }

      console.log(
        `📜 Loading history into session: ${sessionId} from ${filename}`,
      );
      const result = await agentService.loadHistoryIntoSession(
        sessionId,
        filename,
      );
      console.log(`✅ History loaded: ${result.messageCount} messages`);
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        console.error(`❌ Session or file not found: ${req.params['id']}`);
        throw new HttpError(404, error.message);
      }
      console.error('❌ Failed to load history:', error);
      throw new HttpError(
        500,
        `Failed to load history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  return router;
}
