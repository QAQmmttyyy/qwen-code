/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { AgentService } from './agent-service.js';
import { getServerConfig, validateConfig } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createMessageRoutes } from './routes/messages.js';
import { createHealthRoutes } from './routes/health.js';
import type { ServerConfig } from './types.js';

/**
 * Create and configure Express application
 */
export function createApp(config: ServerConfig): Express {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow for SSE
    }),
  );

  // CORS configuration
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // Initialize agent service
  const agentService = new AgentService(
    config.workspaceRoot,
    config.maxSessions,
    config.sessionTimeout,
  );

  // Health check routes (no /api prefix)
  app.use('/health', createHealthRoutes(agentService));

  // API routes
  app.use('/api/sessions', createSessionRoutes(agentService));
  app.use('/api/sessions', createMessageRoutes(agentService));

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  // Store agent service for cleanup
  app.set('agentService', agentService);

  return app;
}

/**
 * Start the server
 */
export async function startServer(): Promise<void> {
  const config = getServerConfig();
  validateConfig(config);

  const app = createApp(config);

  const server = app.listen(config.port, config.host, () => {
    console.log('');
    console.log('🚀 Qwen Code Web Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📡 Server:        http://${config.host}:${config.port}`);
    console.log(`🏠 Workspace:     ${config.workspaceRoot}`);
    console.log(`📊 Max Sessions:  ${config.maxSessions}`);
    console.log(`⏱️  Timeout:       ${config.sessionTimeout / 1000}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('API Endpoints:');
    console.log('  POST   /api/sessions              Create session');
    console.log('  GET    /api/sessions              List sessions');
    console.log('  GET    /api/sessions/:id          Get session info');
    console.log('  DELETE /api/sessions/:id          Delete session');
    console.log('  GET    /api/sessions/:id/history  Get history');
    console.log('  POST   /api/sessions/:id/messages Send message (SSE)');
    console.log('  GET    /health                    Health check');
    console.log('');
    console.log('✅ Server is ready!');
    console.log('');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down gracefully...');

    const agentService = app.get('agentService') as AgentService;
    agentService.cleanup();

    server.close(() => {
      console.log('👋 Server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('⚠️  Forced shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
