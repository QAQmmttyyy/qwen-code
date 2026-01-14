/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { HttpError } from '../middleware/error-handler.js';
import * as fs from 'node:fs/promises';
import { SessionService } from '@qwen-code/qwen-code-core';

/**
 * Create history routes for chat conversation history
 * Uses SessionService from core package for JSONL format sessions
 */
export function createHistoryRoutes(): Router {
  const router = Router();

  /**
   * GET /api/history/conversations
   * Get list of conversation history for a workspace
   * Query params:
   *   - workspaceRoot: The workspace path (required)
   *   - cursor: (optional) Pagination cursor (mtime of last item)
   *   - size: (optional) Maximum number of conversations to return (default: 20)
   */
  router.get('/conversations', async (req: Request, res: Response) => {
    try {
      const { workspaceRoot, cursor, size } = req.query;

      if (!workspaceRoot || typeof workspaceRoot !== 'string') {
        throw new HttpError(400, 'workspaceRoot is required');
      }

      console.log(`📜 Getting conversation history for: ${workspaceRoot}`);

      const sessionService = new SessionService(workspaceRoot);
      const result = await sessionService.listSessions({
        cursor: cursor ? Number(cursor) : undefined,
        size: size ? Number(size) : undefined,
      });

      console.log(`✅ Found ${result.items.length} conversations`);

      res.json({
        conversations: result.items,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      });
    } catch (error) {
      console.error('❌ Error getting conversation history:', error);
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(
        500,
        `Failed to get conversation history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  /**
   * GET /api/history/conversations/:sessionId
   * Get full conversation history for a specific session
   * Query params:
   *   - workspaceRoot: The workspace path (required)
   */
  router.get(
    '/conversations/:sessionId',
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { workspaceRoot } = req.query;

        if (!workspaceRoot || typeof workspaceRoot !== 'string') {
          throw new HttpError(400, 'workspaceRoot is required');
        }

        if (!sessionId) {
          throw new HttpError(400, 'sessionId is required');
        }

        console.log(`📖 Reading conversation: ${sessionId}`);

        const sessionService = new SessionService(workspaceRoot);
        const data = await sessionService.loadSession(sessionId);

        if (!data) {
          throw new HttpError(404, `Session not found: ${sessionId}`);
        }

        console.log(
          `✅ Loaded conversation: ${data.conversation.sessionId} with ${data.conversation.messages?.length || 0} messages`,
        );

        res.json({
          conversation: data.conversation,
          filePath: data.filePath,
          lastCompletedUuid: data.lastCompletedUuid,
        });
      } catch (error) {
        console.error('❌ Error reading conversation:', error);
        if (error instanceof HttpError) {
          throw error;
        }
        throw new HttpError(
          500,
          `Failed to read conversation: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  /**
   * DELETE /api/history/conversations/:sessionId
   * Delete a conversation history
   * Query params:
   *   - workspaceRoot: The workspace path (required)
   */
  router.delete(
    '/conversations/:sessionId',
    async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { workspaceRoot } = req.query;

        if (!workspaceRoot || typeof workspaceRoot !== 'string') {
          throw new HttpError(400, 'workspaceRoot is required');
        }

        if (!sessionId) {
          throw new HttpError(400, 'sessionId is required');
        }

        console.log(`🗑️  Deleting conversation: ${sessionId}`);

        const sessionService = new SessionService(workspaceRoot);
        const data = await sessionService.loadSession(sessionId);

        if (!data) {
          throw new HttpError(404, `Session not found: ${sessionId}`);
        }

        // Delete the session file
        await fs.unlink(data.filePath);

        console.log(`✅ Deleted conversation: ${sessionId}`);
        res.status(204).send();
      } catch (error) {
        console.error('❌ Error deleting conversation:', error);
        if (error instanceof HttpError) {
          throw error;
        }
        throw new HttpError(
          500,
          `Failed to delete conversation: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  return router;
}
