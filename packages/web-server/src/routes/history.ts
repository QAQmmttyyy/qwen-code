/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { HttpError } from '../middleware/error-handler.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

/**
 * Create history routes for chat conversation history
 */
export function createHistoryRoutes(): Router {
  const router = Router();

  /**
   * Helper: Get project hash from workspace path
   */
  function getProjectHash(projectPath: string): string {
    return crypto.createHash('sha256').update(projectPath).digest('hex');
  }

  /**
   * Helper: Get chats directory for a workspace
   */
  function getChatsDir(workspaceRoot: string): string {
    const hash = getProjectHash(workspaceRoot);
    const homeDir = os.homedir();
    const qwenDir = path.join(homeDir, '.qwen');
    return path.join(qwenDir, 'tmp', hash, 'chats');
  }

  /**
   * GET /api/history/conversations
   * Get list of conversation history files for a workspace
   * Query params:
   *   - workspaceRoot: The workspace path
   *   - limit: (optional) Maximum number of conversations to return
   */
  router.get('/conversations', async (req: Request, res: Response) => {
    try {
      const { workspaceRoot, limit } = req.query;

      if (!workspaceRoot || typeof workspaceRoot !== 'string') {
        throw new HttpError(400, 'workspaceRoot is required');
      }

      console.log(`📜 Getting conversation history for: ${workspaceRoot}`);
      const chatsDir = getChatsDir(workspaceRoot);

      // Check if chats directory exists
      try {
        await fs.access(chatsDir);
      } catch {
        // No history directory means no conversations
        console.log(`📜 No history directory found for: ${workspaceRoot}`);
        res.json({ conversations: [] });
        return;
      }

      // Read all JSON files in the chats directory
      const files = await fs.readdir(chatsDir);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));

      console.log(`📜 Found ${jsonFiles.length} conversation files`);

      // Read and parse each conversation file
      const conversations = await Promise.all(
        jsonFiles.map(async (filename) => {
          try {
            const filePath = path.join(chatsDir, filename);
            const stat = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);

            // Extract basic info
            return {
              filename,
              sessionId: data.sessionId,
              startTime: data.startTime,
              lastUpdated: data.lastUpdated,
              messageCount: data.messages?.length || 0,
              projectHash: data.projectHash,
              // Include first user message as preview
              preview:
                data.messages?.find((m: { type: string }) => m.type === 'user')
                  ?.content || 'No messages',
              fileSize: stat.size,
              modifiedTime: stat.mtime,
            };
          } catch (error) {
            console.error(
              `Error reading conversation file ${filename}:`,
              error,
            );
            return null;
          }
        }),
      );

      // Filter out null values (failed reads) and sort by last updated
      const validConversations = conversations
        .filter((c) => c !== null)
        .sort(
          (a, b) =>
            new Date(b!.lastUpdated).getTime() -
            new Date(a!.lastUpdated).getTime(),
        );

      // Apply limit if specified
      const limitNum = limit ? parseInt(limit as string, 10) : undefined;
      const result = limitNum
        ? validConversations.slice(0, limitNum)
        : validConversations;

      console.log(`✅ Returning ${result.length} conversations`);
      res.json({ conversations: result });
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
   * GET /api/history/conversations/:filename
   * Get full conversation history from a specific file
   * Query params:
   *   - workspaceRoot: The workspace path
   */
  router.get(
    '/conversations/:filename',
    async (req: Request, res: Response) => {
      try {
        const { filename } = req.params;
        const { workspaceRoot } = req.query;

        if (!workspaceRoot || typeof workspaceRoot !== 'string') {
          throw new HttpError(400, 'workspaceRoot is required');
        }

        if (!filename || !filename.endsWith('.json')) {
          throw new HttpError(400, 'Invalid filename');
        }

        console.log(`📖 Reading conversation: ${filename}`);
        const chatsDir = getChatsDir(workspaceRoot);
        const filePath = path.join(chatsDir, filename);

        // Check if file exists
        try {
          await fs.access(filePath);
        } catch {
          throw new HttpError(404, `Conversation file not found: ${filename}`);
        }

        // Read and parse the conversation file
        const content = await fs.readFile(filePath, 'utf-8');
        const conversation = JSON.parse(content);

        console.log(
          `✅ Loaded conversation: ${conversation.sessionId} with ${conversation.messages?.length || 0} messages`,
        );
        res.json({ conversation });
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
   * DELETE /api/history/conversations/:filename
   * Delete a conversation history file
   * Query params:
   *   - workspaceRoot: The workspace path
   */
  router.delete(
    '/conversations/:filename',
    async (req: Request, res: Response) => {
      try {
        const { filename } = req.params;
        const { workspaceRoot } = req.query;

        if (!workspaceRoot || typeof workspaceRoot !== 'string') {
          throw new HttpError(400, 'workspaceRoot is required');
        }

        if (!filename || !filename.endsWith('.json')) {
          throw new HttpError(400, 'Invalid filename');
        }

        console.log(`🗑️  Deleting conversation: ${filename}`);
        const chatsDir = getChatsDir(workspaceRoot);
        const filePath = path.join(chatsDir, filename);

        // Check if file exists
        try {
          await fs.access(filePath);
        } catch {
          throw new HttpError(404, `Conversation file not found: ${filename}`);
        }

        // Delete the file
        await fs.unlink(filePath);

        console.log(`✅ Deleted conversation: ${filename}`);
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
