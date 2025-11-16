/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展的 Agent 服务功能
 *
 * 这个文件展示了如何添加更多高级功能到 AgentService
 * 如需使用，可以将这些方法合并到 agent-service.ts 中
 */

import type { Content } from '@google/genai';
import type { AgentService } from './agent-service.js';
import type { ActiveSession } from './types.js';

/**
 * 扩展功能类型定义
 */
export interface ExtendedAgentFunctions {
  // 手动历史管理
  addToHistory(sessionId: string, content: Content): Promise<void>;
  setHistory(sessionId: string, history: Content[]): Promise<void>;

  // 会话控制
  resetSession(sessionId: string): Promise<void>;

  // 上下文管理
  addDirectoryContext(sessionId: string): Promise<void>;

  // 压缩控制
  stripThoughts(sessionId: string): Promise<void>;

  // 工具管理
  getAvailableTools(sessionId: string): string[];
  setTools(sessionId: string): Promise<void>;
}

/**
 * 为 AgentService 添加扩展功能的示例实现
 */
export class AgentServiceExtensions {
  constructor(private agentService: AgentService) {}

  /**
   * 手动添加内容到对话历史
   */
  async addToHistory(sessionId: string, content: Content): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await session.client.addHistory(content);
  }

  /**
   * 设置完整的对话历史（会覆盖现有历史）
   */
  async setHistory(sessionId: string, history: Content[]): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.client.setHistory(history);
  }

  /**
   * 重置会话（清除历史并重新初始化）
   */
  async resetSession(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await session.client.resetChat();
  }

  /**
   * 添加目录上下文到对话
   */
  async addDirectoryContext(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await session.client.addDirectoryContext();
  }

  /**
   * 从历史中移除思考过程（压缩历史）
   */
  async stripThoughts(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.client.stripThoughtsFromHistory();
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    type ClientWithConfig = {
      config: { getToolRegistry: () => { getAllToolNames: () => string[] } };
    };
    const config = (session.client as unknown as ClientWithConfig).config;
    const toolRegistry = config.getToolRegistry();
    return toolRegistry.getAllToolNames();
  }

  /**
   * 重新设置工具（在工具配置变更后）
   */
  async setTools(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await session.client.setTools();
  }

  private getSession(sessionId: string): ActiveSession {
    const session = (
      this.agentService as unknown as {
        sessionManager: {
          getSession: (id: string) => ActiveSession | undefined;
        };
      }
    ).sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }
}

/**
 * 使用示例：
 *
 * // 在 routes/sessions.ts 中添加新的 API 端点
 *
 * router.post('/:id/reset', async (req, res) => {
 *   const extensions = new AgentServiceExtensions(agentService);
 *   await extensions.resetSession(req.params.id);
 *   res.json({ success: true });
 * });
 *
 * router.get('/:id/tools', (req, res) => {
 *   const extensions = new AgentServiceExtensions(agentService);
 *   const tools = extensions.getAvailableTools(req.params.id);
 *   res.json({ tools });
 * });
 *
 * router.post('/:id/history', async (req, res) => {
 *   const extensions = new AgentServiceExtensions(agentService);
 *   const { content } = req.body;
 *   await extensions.addToHistory(req.params.id, content);
 *   res.json({ success: true });
 * });
 */
