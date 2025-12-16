/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {
  Config,
  ApprovalMode,
  type ServerGeminiStreamEvent,
  AuthType,
  ToolConfirmationOutcome,
  CoreToolScheduler,
  type CompletedToolCall,
  type WaitingToolCall,
  type ToolCallRequestInfo,
  type ToolCallConfirmationDetails,
  GeminiEventType,
  type ResumedSessionData,
  type ConversationRecord,
} from '@qwen-code/qwen-code-core';
import type { Part, Content } from '@google/genai';
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
  confirmationDetails: ToolCallConfirmationDetails;
  resolve: (outcome: ToolConfirmationOutcome) => void;
  reject: (error: Error) => void;
}

/**
 * Event queue for injecting events into SSE stream
 */
interface EventQueueItem {
  event: ServerGeminiStreamEvent;
  resolve: () => void;
}

/**
 * Core agent service that manages AI conversations and tool execution
 */
export class AgentService {
  private sessionManager: SessionManager;
  private pendingConfirmations: Map<string, PendingToolConfirmation> =
    new Map();
  // CoreToolScheduler instances per session
  private toolSchedulers: Map<string, CoreToolScheduler> = new Map();
  // Event queues for injecting events into SSE streams
  private eventQueues: Map<string, EventQueueItem[]> = new Map();
  // Track tool execution completion per session
  private toolsCompletePromises: Map<
    string,
    {
      resolve: (completedTools: CompletedToolCall[]) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  constructor(
    private readonly defaultWorkspaceRoot: string,
    maxSessions: number = 100,
    sessionTimeout: number = 3600000,
  ) {
    this.sessionManager = new SessionManager(maxSessions, sessionTimeout);
    this.sessionManager.startCleanupTimer();
  }

  /**
   * Get or create CoreToolScheduler for a session
   */
  private getOrCreateScheduler(sessionId: string): CoreToolScheduler {
    let scheduler = this.toolSchedulers.get(sessionId);
    if (scheduler) {
      return scheduler;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Create scheduler with callbacks
    scheduler = new CoreToolScheduler({
      config: session.config,
      outputUpdateHandler: undefined, // Web server doesn't stream live output for now
      onAllToolCallsComplete: async (completedToolCalls) => {
        console.log(
          `✅ onAllToolCallsComplete called with ${completedToolCalls.length} tools`,
        );
        // Resolve the promise waiting for tools to complete
        const promise = this.toolsCompletePromises.get(sessionId);
        if (promise) {
          console.log(
            `✅ Resolving toolsCompletePromise for session ${sessionId}`,
          );
          promise.resolve(completedToolCalls);
          this.toolsCompletePromises.delete(sessionId);
        } else {
          console.warn(
            `⚠️  No toolsCompletePromise found for session ${sessionId}`,
          );
        }
      },
      onToolCallsUpdate: (toolCalls) => {
        console.log(
          `🔄 onToolCallsUpdate called with ${toolCalls.length} tools`,
        );
        console.log(
          `   Tool statuses:`,
          toolCalls.map((tc) => `${tc.request.name}:${tc.status}`).join(', '),
        );

        // Handle tool calls update - emit events for awaiting_approval
        for (const toolCall of toolCalls) {
          if (toolCall.status === 'awaiting_approval') {
            console.log(
              `⚠️  Tool ${toolCall.request.callId} (${toolCall.request.name}) is awaiting approval`,
            );
            const waitingCall = toolCall as WaitingToolCall;
            this.handleToolAwaitingApproval(sessionId, waitingCall);
          }
        }
      },
      getPreferredEditor: () => undefined, // Web server doesn't support editor
      onEditorClose: () => {
        // No-op for web server
      },
    });

    this.toolSchedulers.set(sessionId, scheduler);
    return scheduler;
  }

  /**
   * Handle tool awaiting approval by emitting confirmation event
   */
  private handleToolAwaitingApproval(
    sessionId: string,
    toolCall: WaitingToolCall,
  ): void {
    const callId = toolCall.request.callId;
    console.log(
      `🔔 handleToolAwaitingApproval called for ${callId} (${toolCall.request.name})`,
    );

    // Check if already pending
    if (this.pendingConfirmations.has(callId)) {
      console.log(
        `⚠️  Tool ${callId} already has pending confirmation, skipping`,
      );
      return;
    }

    // Create a promise that will be resolved when user confirms
    const confirmationPromise = new Promise<ToolConfirmationOutcome>(
      (resolve, reject) => {
        this.pendingConfirmations.set(callId, {
          callId,
          toolName: toolCall.request.name,
          confirmationDetails: toolCall.confirmationDetails,
          resolve,
          reject,
        });
        console.log(`✅ Created pending confirmation for ${callId}`);
      },
    );

    // Queue the confirmation event to be sent to the client
    // Use the proper ServerToolCallConfirmationDetails format
    console.log(`📝 Queueing confirmation event for ${callId}`);
    this.queueEvent(sessionId, {
      type: GeminiEventType.ToolCallConfirmation,
      value: {
        request: toolCall.request,
        details: toolCall.confirmationDetails,
      },
    });

    // Hook up the confirmation promise to the onConfirm callback
    confirmationPromise
      .then((outcome) => {
        console.log(`✅ Confirmation resolved for ${callId}: ${outcome}`);
        return toolCall.confirmationDetails.onConfirm(outcome);
      })
      .catch((error) => {
        console.error(`❌ Error handling confirmation for ${callId}:`, error);
      });
  }

  /**
   * Queue an event to be injected into the SSE stream
   */
  private queueEvent(
    sessionId: string,
    event: ServerGeminiStreamEvent,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      let queue = this.eventQueues.get(sessionId);
      if (!queue) {
        queue = [];
        this.eventQueues.set(sessionId, queue);
      }
      queue.push({ event, resolve });
    });
  }

  /**
   * Wait for tools to complete execution
   */
  private waitForToolsComplete(
    sessionId: string,
  ): Promise<CompletedToolCall[]> {
    return new Promise<CompletedToolCall[]>((resolve, reject) => {
      this.toolsCompletePromises.set(sessionId, { resolve, reject });
    });
  }

  /**
   * Helper: Get project hash from workspace path
   */
  private getProjectHash(projectPath: string): string {
    return crypto.createHash('sha256').update(projectPath).digest('hex');
  }

  /**
   * Helper: Get chats directory for a workspace
   */
  private getChatsDir(workspaceRoot: string): string {
    const hash = this.getProjectHash(workspaceRoot);
    const homeDir = os.homedir();
    const qwenDir = path.join(homeDir, '.qwen');
    return path.join(qwenDir, 'tmp', hash, 'chats');
  }

  /**
   * Helper: Load conversation history from file
   */
  private async loadConversationHistory(
    workspaceRoot: string,
    filename: string,
  ): Promise<ResumedSessionData | null> {
    try {
      const chatsDir = this.getChatsDir(workspaceRoot);
      const filePath = path.join(chatsDir, filename);

      // Check if file exists
      await fs.access(filePath);

      // Read and parse the conversation file
      const content = await fs.readFile(filePath, 'utf-8');
      const conversation: ConversationRecord = JSON.parse(content);

      console.log(
        `✅ Loaded conversation history: ${conversation.sessionId} with ${conversation.messages?.length || 0} messages`,
      );

      return {
        conversation,
        filePath,
      };
    } catch (error) {
      console.error('❌ Error loading conversation history:', error);
      return null;
    }
  }

  /**
   * Helper: Convert PartListUnion to Part[]
   */
  private partListUnionToParts(content: unknown): Part[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }
    if (Array.isArray(content)) {
      return content.flatMap((item) => {
        if (typeof item === 'string') {
          return [{ text: item }];
        }
        return [item as Part];
      });
    }
    // Single Part object
    return [content as Part];
  }

  /**
   * Helper: Convert ConversationRecord messages to Gemini Content format
   */
  private convertMessagesToHistory(
    conversation: ConversationRecord,
  ): Content[] {
    const history: Content[] = [];

    for (const message of conversation.messages || []) {
      if (message.type === 'user') {
        history.push({
          role: 'user',
          parts: this.partListUnionToParts(message.content),
        });
      } else if (message.type === 'qwen') {
        const parts: Part[] = [];

        // Add text content
        if (message.content) {
          parts.push(...this.partListUnionToParts(message.content));
        }

        // Add tool calls if any
        if ('toolCalls' in message && message.toolCalls) {
          for (const toolCall of message.toolCalls) {
            parts.push({
              functionCall: {
                name: toolCall.name,
                args: toolCall.args,
              },
            });

            // Add tool response if available
            if (toolCall.result) {
              const responseParts = this.partListUnionToParts(toolCall.result);
              const output = responseParts
                .map((part) => ('text' in part ? part.text : ''))
                .join('');
              parts.push({
                functionResponse: {
                  name: toolCall.name,
                  response: { output },
                },
              });
            }
          }
        }

        if (parts.length > 0) {
          history.push({
            role: 'model',
            parts,
          });
        }
      }
    }

    return history;
  }

  /**
   * Create a new agent session
   */
  async createSession(
    request: CreateSessionRequest,
  ): Promise<CreateSessionResponse> {
    const sessionId = randomUUID();
    const workspaceRoot = request.workspaceRoot || this.defaultWorkspaceRoot;

    // Check if resuming from history
    let resumedSessionData: ResumedSessionData | null = null;
    if (request.resumeFromHistory) {
      resumedSessionData = await this.loadConversationHistory(
        workspaceRoot,
        request.resumeFromHistory.filename,
      );

      if (!resumedSessionData) {
        console.warn(
          `⚠️  Failed to load conversation history: ${request.resumeFromHistory.filename}`,
        );
      }
    }

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

      // If resuming from history, load the conversation into the client
      if (resumedSessionData) {
        const history = this.convertMessagesToHistory(
          resumedSessionData.conversation,
        );

        // Set the history in the client
        await client.setHistory(history);

        console.log(
          `✅ Restored ${history.length} history items from conversation`,
        );

        // Also initialize the ChatRecordingService with resumed data
        const chatRecordingService = client.getChatRecordingService();
        if (chatRecordingService) {
          chatRecordingService.initialize(resumedSessionData);
          console.log(
            `✅ Initialized ChatRecordingService with resumed session`,
          );
        }
      }

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
   * Implements tool execution loop with continuation
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

      // Get or create scheduler for this session
      const scheduler = this.getOrCreateScheduler(sessionId);

      // Initialize event queue for this session
      if (!this.eventQueues.has(sessionId)) {
        this.eventQueues.set(sessionId, []);
      }

      let currentMessage: string | Part[] = message;
      let hasMoreTurns = true;

      // Tool execution loop
      while (hasMoreTurns) {
        // Collect tool calls from this turn
        const toolCallsInTurn: ToolCallRequestInfo[] = [];
        let hasToolCalls = false;

        // Stream the response using sendMessageStream
        // Note: turns=1 to handle one AI response at a time
        const streamGenerator = session.client.sendMessageStream(
          currentMessage,
          abortController.signal,
          sessionId,
          1, // Process one turn at a time
        );

        // Process events from AI
        for await (const event of streamGenerator) {
          // Check for queued events and yield them first
          const queue = this.eventQueues.get(sessionId);
          if (queue && queue.length > 0) {
            const queuedItems = queue.splice(0, queue.length);
            for (const item of queuedItems) {
              yield item.event;
              item.resolve();
            }
          }

          // Yield the current event
          yield event;

          // Collect tool calls
          if (event.type === GeminiEventType.ToolCallRequest) {
            hasToolCalls = true;
            toolCallsInTurn.push({
              callId: event.value.callId,
              name: event.value.name,
              args: event.value.args,
              prompt_id: sessionId,
              isClientInitiated: false,
            });
          }

          // Check if turn is complete (error or finished)
          if (
            event.type === GeminiEventType.Finished ||
            event.type === GeminiEventType.Error
          ) {
            hasMoreTurns = false;
          }
        }

        // If no tool calls, we're done with the loop
        if (!hasToolCalls || toolCallsInTurn.length === 0) {
          console.log(`✅ No tool calls in this turn, ending loop`);
          break;
        }

        console.log(
          `🔧 Scheduling ${toolCallsInTurn.length} tool(s):`,
          toolCallsInTurn.map((t) => `${t.name}(${t.callId})`),
        );

        // CRITICAL: Create the waitForToolsComplete promise BEFORE calling schedule()
        // because schedule() may synchronously complete tools and call onAllToolCallsComplete
        console.log(`⏳ Creating waitForToolsComplete promise...`);
        const toolsCompletePromise = this.waitForToolsComplete(sessionId);

        // Schedule tool calls
        await scheduler.schedule(toolCallsInTurn, abortController.signal);

        console.log(`✅ scheduler.schedule() completed`);

        // IMPORTANT: After scheduling, yield any queued events (like confirmation requests)
        // that were added by CoreToolScheduler during schedule()
        // The for-await loop above has ended, so we need to manually yield queued events
        const queueAfterSchedule = this.eventQueues.get(sessionId);
        console.log(
          `📦 Queue after schedule: ${queueAfterSchedule?.length || 0} events`,
        );
        if (queueAfterSchedule && queueAfterSchedule.length > 0) {
          const queuedItems = queueAfterSchedule.splice(
            0,
            queueAfterSchedule.length,
          );
          console.log(`📤 Yielding ${queuedItems.length} queued events`);
          for (const item of queuedItems) {
            yield item.event;
            item.resolve();
          }
        }

        console.log(`⏳ Waiting for tools to complete...`);
        // Wait for all tools to complete (including confirmations)
        const completedTools = await toolsCompletePromise;
        console.log(`✅ Tools completed: ${completedTools.length}`);

        // Check for any queued events after tool completion
        const queue = this.eventQueues.get(sessionId);
        if (queue && queue.length > 0) {
          const queuedItems = queue.splice(0, queue.length);
          for (const item of queuedItems) {
            yield item.event;
            item.resolve();
          }
        }

        // Emit tool completion events
        for (const tool of completedTools) {
          yield {
            type: GeminiEventType.ToolCallResponse,
            value: {
              callId: tool.request.callId,
              responseParts: tool.response.responseParts,
              resultDisplay: tool.response.resultDisplay,
              error: tool.response.error,
              errorType: tool.response.errorType,
              outputFile: tool.response.outputFile,
              contentLength: tool.response.contentLength,
            },
          };
        }

        // Prepare for continuation
        // Tool results are already in history via CoreToolScheduler
        // Send the tool results as the next message
        currentMessage = completedTools.flatMap((tool) =>
          tool.response.responseParts ? tool.response.responseParts : [],
        );

        // Continue to next turn
        hasMoreTurns = true;
      }

      // Clean up event queue
      this.eventQueues.delete(sessionId);
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
    // Clean up scheduler
    this.toolSchedulers.delete(sessionId);

    // Clean up event queue
    this.eventQueues.delete(sessionId);

    // Clean up pending confirmations for this session
    // Note: We reject all pending confirmations when session is deleted
    // This is safe because confirmations are session-specific
    for (const [callId, confirmation] of this.pendingConfirmations.entries()) {
      confirmation.reject(new Error('Session deleted'));
      this.pendingConfirmations.delete(callId);
    }

    // Clean up tools complete promise
    const toolsPromise = this.toolsCompletePromises.get(sessionId);
    if (toolsPromise) {
      toolsPromise.reject(new Error('Session deleted'));
      this.toolsCompletePromises.delete(sessionId);
    }

    // Remove session from manager
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
   * This resolves the promise that CoreToolScheduler is waiting on
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

      // Resolve the pending confirmation promise
      // This will trigger CoreToolScheduler to continue execution
      pending.resolve(outcome);
      this.pendingConfirmations.delete(callId);

      console.log(
        `✅ Confirmed tool ${pending.toolName} (${callId}): ${outcome}`,
      );

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
