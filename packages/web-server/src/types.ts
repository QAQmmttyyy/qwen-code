/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { GeminiClient, Config } from '@qwen-code/qwen-code-core';

/**
 * Session metadata
 */
export interface SessionMetadata {
  sessionId: string;
  userId?: string;
  workspaceRoot: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
}

/**
 * Active session data
 */
export interface ActiveSession {
  client: GeminiClient;
  config: Config;
  metadata: SessionMetadata;
}

/**
 * Request to create a new session
 */
export interface CreateSessionRequest {
  workspaceRoot?: string;
  userId?: string;
  model?: string;
  authType?: string;
  apiKey?: string;
  baseUrl?: string;
  approvalMode?: 'plan' | 'default' | 'auto-edit' | 'yolo';
}

/**
 * Response for session creation
 */
export interface CreateSessionResponse {
  sessionId: string;
  workspaceRoot: string;
  createdAt: string;
}

/**
 * Request to send a message (always streaming)
 */
export interface SendMessageRequest {
  message: string;
}

/**
 * Note: Message streaming uses ServerGeminiStreamEvent from @qwen-code/qwen-code-core
 * This preserves the same event format as the CLI for consistency
 */

/**
 * Session history response
 */
export interface SessionHistoryResponse {
  sessionId: string;
  history: Content[];
  messageCount: number;
}

/**
 * Session info response
 */
export interface SessionInfoResponse {
  sessionId: string;
  workspaceRoot: string;
  createdAt: string;
  lastActivity: string;
  messageCount: number;
  isActive: boolean;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  port: number;
  host: string;
  sessionSecret: string;
  workspaceRoot: string;
  maxSessions: number;
  sessionTimeout: number; // in milliseconds
  corsOrigins: string[];
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

/**
 * Tool confirmation request
 */
export interface ToolConfirmationRequest {
  outcome: 'proceed_once' | 'proceed_always' | 'cancel' | 'modify';
  modifiedArgs?: Record<string, unknown>;
}

/**
 * Tool confirmation response
 */
export interface ToolConfirmationResponse {
  success: boolean;
  newApprovalMode?: 'plan' | 'default' | 'auto-edit' | 'yolo';
  error?: string;
}
