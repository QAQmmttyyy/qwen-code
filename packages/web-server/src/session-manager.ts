/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActiveSession, SessionMetadata } from './types.js';
import type { GeminiClient, Config } from '@qwen-code/qwen-code-core';

/**
 * Manages active agent sessions with automatic cleanup
 */
export class SessionManager {
  private sessions = new Map<string, ActiveSession>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private readonly maxSessions: number = 100,
    private readonly sessionTimeout: number = 3600000, // 1 hour
  ) {}

  /**
   * Start the cleanup timer to remove expired sessions
   */
  startCleanupTimer(): void {
    if (this.cleanupInterval) {
      return;
    }

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredSessions();
      },
      5 * 60 * 1000,
    );
  }

  /**
   * Stop the cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Add a new session
   */
  addSession(
    sessionId: string,
    client: GeminiClient,
    config: Config,
    metadata: Omit<SessionMetadata, 'sessionId'>,
  ): void {
    // Check if we've reached the maximum number of sessions
    if (this.sessions.size >= this.maxSessions) {
      // Remove the oldest session
      const oldestSessionId = this.findOldestSession();
      if (oldestSessionId) {
        this.removeSession(oldestSessionId);
      }
    }

    this.sessions.set(sessionId, {
      client,
      config,
      metadata: {
        sessionId,
        ...metadata,
      },
    });
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ActiveSession | undefined {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Update last activity timestamp
      session.metadata.lastActivity = new Date();
    }

    return session;
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Remove a session
   */
  removeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all active session IDs
   */
  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session metadata
   */
  getSessionMetadata(sessionId: string): SessionMetadata | undefined {
    return this.sessions.get(sessionId)?.metadata;
  }

  /**
   * Update session message count
   */
  incrementMessageCount(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata.messageCount++;
      session.metadata.lastActivity = new Date();
    }
  }

  /**
   * Get the number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivityTime = session.metadata.lastActivity.getTime();
      if (now - lastActivityTime > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      console.log(`🗑️  Removing expired session: ${sessionId}`);
      this.removeSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      console.log(`✅ Cleaned up ${expiredSessions.length} expired session(s)`);
    }
  }

  /**
   * Find the oldest session
   */
  private findOldestSession(): string | undefined {
    let oldestSessionId: string | undefined;
    let oldestTime = Infinity;

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivityTime = session.metadata.lastActivity.getTime();
      if (lastActivityTime < oldestTime) {
        oldestTime = lastActivityTime;
        oldestSessionId = sessionId;
      }
    }

    return oldestSessionId;
  }

  /**
   * Cleanup all sessions (for shutdown)
   */
  cleanup(): void {
    this.stopCleanupTimer();
    this.sessions.clear();
  }
}
