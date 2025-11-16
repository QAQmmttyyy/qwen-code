/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerConfig } from './types.js';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

/**
 * Get server configuration from environment variables
 */
export function getServerConfig(): ServerConfig {
  const port = parseInt(process.env['PORT'] || '3000', 10);
  const host = process.env['HOST'] || '0.0.0.0';
  const sessionSecret =
    process.env['SESSION_SECRET'] ||
    'qwen-code-secret-' + Math.random().toString(36);
  const workspaceRoot = process.env['WORKSPACE_ROOT'] || process.cwd();
  const maxSessions = parseInt(process.env['MAX_SESSIONS'] || '100', 10);
  const sessionTimeout = parseInt(
    process.env['SESSION_TIMEOUT'] || '3600000',
    10,
  ); // 1 hour default
  const corsOrigins = process.env['CORS_ORIGINS']?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  return {
    port,
    host,
    sessionSecret,
    workspaceRoot,
    maxSessions,
    sessionTimeout,
    corsOrigins,
  };
}

/**
 * Validate server configuration
 */
export function validateConfig(config: ServerConfig): void {
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port: ${config.port}`);
  }

  if (config.maxSessions < 1) {
    throw new Error(`maxSessions must be at least 1`);
  }

  if (config.sessionTimeout < 1000) {
    throw new Error(`sessionTimeout must be at least 1000ms`);
  }

  if (!config.sessionSecret || config.sessionSecret.length < 10) {
    console.warn(
      '⚠️  Warning: SESSION_SECRET is not set or too short. Using a random value.',
    );
  }
}
