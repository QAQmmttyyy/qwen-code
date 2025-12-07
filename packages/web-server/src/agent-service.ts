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
  ToolConfirmationOutcome,
} from '@qwen-code/qwen-code-core';
import { SessionManager } from './session-manager.js';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionHistoryResponse,
  SessionInfoResponse,
  ToolConfirmationRequest,
  ToolConfirmationResponse,
} from './types.js';

/**
 * Pending tool confirmation (waiting for user input)
 */
interface PendingToolConfirmation {
  callId: string;
  toolName: string;
  resolve: (outcome: ToolConfirmationOutcome) => void;
  reject: (error: Error) => void;
}

/**
 * Core agent service that manages AI conversations and tool execution
 */
export class AgentService {
  private sessionManager: SessionManager;
  private pendingConfirmations: Map<string, PendingToolConfirmation> =
    new Map();

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
      // Parse approvalMode from request (default to YOLO for backward compatibility)
      let approvalMode = ApprovalMode.YOLO;
      if (request.approvalMode) {
        switch (request.approvalMode) {
          case 'plan':
            approvalMode = ApprovalMode.PLAN;
            break;
          case 'default':
            approvalMode = ApprovalMode.DEFAULT;
            break;
          case 'auto-edit':
            approvalMode = ApprovalMode.AUTO_EDIT;
            break;
          case 'yolo':
            approvalMode = ApprovalMode.YOLO;
            break;
          default:
            approvalMode = ApprovalMode.YOLO;
            break;
        }
      }

      // Initialize configuration
      const config = new Config({
        sessionId,
        targetDir: workspaceRoot,
        cwd: workspaceRoot,
        model: request.model || 'qwen-max',
        approvalMode,
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
      this.sessionManager.addSession(sessionId, client, config, {
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
   * Get ApprovalMode for a session
   */
  getApprovalMode(sessionId: string): string {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session.config.getApprovalMode();
  }

  /**
   * Update ApprovalMode for a session
   */
  setApprovalMode(sessionId: string, approvalMode: string): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Map string to ApprovalMode enum
    let mode = ApprovalMode.DEFAULT;
    switch (approvalMode) {
      case 'plan':
        mode = ApprovalMode.PLAN;
        break;
      case 'default':
        mode = ApprovalMode.DEFAULT;
        break;
      case 'auto-edit':
        mode = ApprovalMode.AUTO_EDIT;
        break;
      case 'yolo':
        mode = ApprovalMode.YOLO;
        break;
      default:
        mode = ApprovalMode.DEFAULT;
        break;
    }

    session.config.setApprovalMode(mode);
    console.log(
      `✅ Updated ApprovalMode for session ${sessionId}: ${approvalMode}`,
    );
  }

  /**
   * Confirm a tool execution
   *
   * NOTE: This is a stub implementation. Full implementation requires:
   * 1. CoreToolScheduler integration in streamMessage
   * 2. onToolCallsUpdate callback to capture confirmation handlers
   * 3. Promise-based coordination between streaming and confirmation
   */
  async confirmToolCall(
    sessionId: string,
    callId: string,
    request: ToolConfirmationRequest,
  ): Promise<ToolConfirmationResponse> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const pending = this.pendingConfirmations.get(callId);
    if (!pending) {
      return {
        success: false,
        error: `Tool call ${callId} not found or already confirmed`,
      };
    }

    try {
      // Map outcome string to ToolConfirmationOutcome enum
      let outcome = ToolConfirmationOutcome.ProceedOnce;
      switch (request.outcome) {
        case 'proceed_once':
          outcome = ToolConfirmationOutcome.ProceedOnce;
          break;
        case 'proceed_always':
          outcome = ToolConfirmationOutcome.ProceedAlways;
          break;
        case 'cancel':
          outcome = ToolConfirmationOutcome.Cancel;
          break;
        case 'modify':
          outcome = ToolConfirmationOutcome.ModifyWithEditor;
          break;
        default:
          outcome = ToolConfirmationOutcome.ProceedOnce;
          break;
      }

      // Resolve the pending confirmation
      pending.resolve(outcome);
      this.pendingConfirmations.delete(callId);

      // Update ApprovalMode if ProceedAlways
      let newApprovalMode:
        | 'plan'
        | 'default'
        | 'auto-edit'
        | 'yolo'
        | undefined;
      if (request.outcome === 'proceed_always') {
        const currentMode = session.config.getApprovalMode();
        const EDIT_TOOLS = new Set([
          'write_file',
          'replace',
          'edit',
          'smart_edit',
        ]);

        if (currentMode === ApprovalMode.DEFAULT) {
          if (EDIT_TOOLS.has(pending.toolName)) {
            session.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
            newApprovalMode = 'auto-edit';
          } else {
            session.config.setApprovalMode(ApprovalMode.YOLO);
            newApprovalMode = 'yolo';
          }
        } else if (currentMode === ApprovalMode.AUTO_EDIT) {
          session.config.setApprovalMode(ApprovalMode.YOLO);
          newApprovalMode = 'yolo';
        }
      }

      return {
        success: true,
        newApprovalMode,
      };
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      this.pendingConfirmations.delete(callId);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Cleanup all sessions (for shutdown)
   */
  cleanup(): void {
    console.log('🧹 Cleaning up agent service...');
    this.sessionManager.cleanup();
  }
}
