/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from './session-manager.js';
import type { GeminiClient } from '@qwen-code/qwen-code-core';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(5, 1000); // 5 max sessions, 1s timeout
  });

  afterEach(() => {
    sessionManager.cleanup();
  });

  it('should add and retrieve a session', () => {
    const mockClient = {} as GeminiClient;
    const sessionId = 'test-session-1';

    sessionManager.addSession(sessionId, mockClient, {
      userId: 'user1',
      workspaceRoot: '/test',
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    });

    expect(sessionManager.hasSession(sessionId)).toBe(true);
    const session = sessionManager.getSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.metadata.sessionId).toBe(sessionId);
  });

  it('should remove a session', () => {
    const mockClient = {} as GeminiClient;
    const sessionId = 'test-session-2';

    sessionManager.addSession(sessionId, mockClient, {
      userId: 'user1',
      workspaceRoot: '/test',
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    });

    expect(sessionManager.hasSession(sessionId)).toBe(true);

    const removed = sessionManager.removeSession(sessionId);
    expect(removed).toBe(true);
    expect(sessionManager.hasSession(sessionId)).toBe(false);
  });

  it('should respect max sessions limit', () => {
    const mockClient = {} as GeminiClient;

    // Add 6 sessions (max is 5)
    for (let i = 0; i < 6; i++) {
      sessionManager.addSession(`session-${i}`, mockClient, {
        workspaceRoot: '/test',
        createdAt: new Date(Date.now() - i * 1000), // Older sessions first
        lastActivity: new Date(Date.now() - i * 1000),
        messageCount: 0,
      });
    }

    // Should only have 5 sessions (oldest should be removed)
    expect(sessionManager.getSessionCount()).toBe(5);
    expect(sessionManager.hasSession('session-0')).toBe(false); // Oldest removed
    expect(sessionManager.hasSession('session-5')).toBe(true); // Newest kept
  });

  it('should increment message count', () => {
    const mockClient = {} as GeminiClient;
    const sessionId = 'test-session-3';

    sessionManager.addSession(sessionId, mockClient, {
      workspaceRoot: '/test',
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    });

    sessionManager.incrementMessageCount(sessionId);
    sessionManager.incrementMessageCount(sessionId);

    const metadata = sessionManager.getSessionMetadata(sessionId);
    expect(metadata?.messageCount).toBe(2);
  });

  it('should get all session IDs', () => {
    const mockClient = {} as GeminiClient;

    sessionManager.addSession('session-1', mockClient, {
      workspaceRoot: '/test',
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    });

    sessionManager.addSession('session-2', mockClient, {
      workspaceRoot: '/test',
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
    });

    const sessionIds = sessionManager.getAllSessionIds();
    expect(sessionIds).toHaveLength(2);
    expect(sessionIds).toContain('session-1');
    expect(sessionIds).toContain('session-2');
  });
});
