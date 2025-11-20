/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import {
  Config,
  ApprovalMode,
  type ServerGeminiStreamEvent,
  AuthType,
} from '@qwen-code/qwen-code-core';
import { SessionManager } from './session-manager.js';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionHistoryResponse,
  SessionInfoResponse,
} from './types.js';

/**
 * Core agent service that manages AI conversations and tool execution
 */
export class AgentService {
  private sessionManager: SessionManager;

  constructor(
    private readonly defaultWorkspaceRoot: string,
    maxSessions: number = 100,
    sessionTimeout: number = 3600000,
  ) {
    this.sessionManager = new SessionManager(maxSessions, sessionTimeout);
    this.sessionManager.startCleanupTimer();
  }

  /**
   * Create a new agent session
   */
  async createSession(
    request: CreateSessionRequest,
  ): Promise<CreateSessionResponse> {
    const sessionId = randomUUID();
    const workspaceRoot = request.workspaceRoot || this.defaultWorkspaceRoot;

    try {
      // Initialize configuration
      const config = new Config({
        sessionId,
        targetDir: workspaceRoot,
        cwd: workspaceRoot,
        model: request.model || 'qwen-max',
        approvalMode: ApprovalMode.YOLO,
        debugMode: false,
        generationConfig: {
          apiKey:
            request.apiKey ||
            process.env['OPENROUTER_API_KEY'] ||
            process.env['OPENAI_API_KEY'],
          baseUrl: request.baseUrl || process.env['OPENROUTER_BASE_URL'],
        },
      });

      // Initialize config first (this initializes toolRegistry and internal client)
      await config.initialize();

      // Initialize content generator with appropriate auth type
      await config.refreshAuth(AuthType.USE_OPENAI);

      // Get the initialized client from config
      const client = config.getGeminiClient();

      // Add to session manager
      this.sessionManager.addSession(sessionId, client, {
        userId: request.userId,
        workspaceRoot,
        createdAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
      });

      console.log(
        `✅ Created session: ${sessionId} (workspace: ${workspaceRoot})`,
      );

      return {
        sessionId,
        workspaceRoot,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`❌ Failed to create session:`, error);
      throw new Error(
        `Failed to create session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send a message and stream the response (returns raw ServerGeminiStreamEvent)
   */
  async *streamMessage(
    sessionId: string,
    message: string,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      this.sessionManager.incrementMessageCount(sessionId);

      // Create abort controller for cancellation support
      const abortController = new AbortController();

      // Stream the response using sendMessageStream
      const streamEvents = session.client.sendMessageStream(
        message,
        abortController.signal,
        sessionId,
      );

      // Directly yield raw events without conversion
      for await (const event of streamEvents) {
        yield event;
      }
    } catch (error) {
      console.error(
        `❌ Error streaming message in session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  getHistory(sessionId: string): SessionHistoryResponse {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const history = session.client.getHistory();
    const metadata = this.sessionManager.getSessionMetadata(sessionId);

    return {
      sessionId,
      history,
      messageCount: metadata?.messageCount || 0,
    };
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string): SessionInfoResponse {
    const metadata = this.sessionManager.getSessionMetadata(sessionId);
    if (!metadata) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return {
      sessionId: metadata.sessionId,
      workspaceRoot: metadata.workspaceRoot,
      createdAt: metadata.createdAt.toISOString(),
      lastActivity: metadata.lastActivity.toISOString(),
      messageCount: metadata.messageCount,
      isActive: true,
    };
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const removed = this.sessionManager.removeSession(sessionId);
    if (removed) {
      console.log(`🗑️  Deleted session: ${sessionId}`);
    }
    return removed;
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return this.sessionManager.getAllSessionIds();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeSessions: this.sessionManager.getSessionCount(),
      sessionIds: this.sessionManager.getAllSessionIds(),
    };
  }

  /**
   * Cleanup all sessions (for shutdown)
   */
  cleanup(): void {
    console.log('🧹 Cleaning up agent service...');
    this.sessionManager.cleanup();
  }
}
