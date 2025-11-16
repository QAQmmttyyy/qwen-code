# 快速开始指南

## 5 分钟快速体验

### 第一步：安装依赖

```bash
cd packages/web-server
npm install
```

### 第二步：配置环境

```bash
# 复制环境变量示例
cp .env.example .env

# 编辑 .env 文件，至少设置以下变量：
# QWEN_API_KEY=your-api-key-here
```

最小配置示例：

```env
PORT=3000
WORKSPACE_ROOT=/tmp/qwen-workspace
QWEN_API_KEY=sk-your-api-key
```

### 第三步：启动服务器

```bash
# 开发模式（推荐）
npm run dev

# 或者构建后运行
npm run build
npm start
```

看到以下输出说明启动成功：

```
🚀 Qwen Code Web Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server:        http://0.0.0.0:3000
🏠 Workspace:     /tmp/qwen-workspace
📊 Max Sessions:  100
⏱️  Timeout:       3600s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Server is ready!
```

### 第四步：测试 API

#### 方式一：使用提供的测试脚本

```bash
./test-api.sh
```

#### 方式二：手动测试

**1. 创建会话**

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceRoot": "/tmp/test",
    "model": "qwen-max"
  }'
```

响应：

```json
{
  "sessionId": "abc-123-def",
  "workspaceRoot": "/tmp/test",
  "createdAt": "2025-01-XX..."
}
```

**2. 发送消息（流式）**

```bash
curl -N -X POST http://localhost:3000/api/sessions/{sessionId}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请介绍一下自己",
    "stream": true
  }'
```

**3. 查看历史**

```bash
curl http://localhost:3000/api/sessions/{sessionId}/history
```

## 集成到前端

### React 示例

```typescript
// useQwenChat.ts
import { useState } from 'react';

export function useQwenChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // 创建会话
  const createSession = async () => {
    const res = await fetch('http://localhost:3000/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceRoot: '/tmp/test' }),
    });
    const data = await res.json();
    setSessionId(data.sessionId);
    return data.sessionId;
  };

  // 发送消息
  const sendMessage = async (message: string) => {
    if (!sessionId) throw new Error('No session');

    setLoading(true);
    const response = await fetch(
      `http://localhost:3000/api/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, stream: true }),
      },
    );

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            setLoading(false);
            setMessages([...messages, fullResponse]);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullResponse += parsed.content;
            }
          } catch (e) {}
        }
      }
    }
  };

  return { sessionId, messages, loading, createSession, sendMessage };
}
```

### Vue 示例

```typescript
// useQwenChat.ts
import { ref } from 'vue';

export function useQwenChat() {
  const sessionId = ref<string | null>(null);
  const messages = ref<string[]>([]);
  const loading = ref(false);

  const createSession = async () => {
    const res = await fetch('http://localhost:3000/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceRoot: '/tmp/test' }),
    });
    const data = await res.json();
    sessionId.value = data.sessionId;
    return data.sessionId;
  };

  const sendMessage = async (message: string) => {
    // 类似 React 实现
  };

  return { sessionId, messages, loading, createSession, sendMessage };
}
```

## 常见问题

### Q: 启动失败，提示端口被占用

A: 修改 `.env` 文件中的 `PORT` 变量，或者：

```bash
PORT=8080 npm run dev
```

### Q: 提示找不到 QWEN_API_KEY

A: 确保 `.env` 文件中设置了 `QWEN_API_KEY`，或者：

```bash
export QWEN_API_KEY=your-key
npm run dev
```

### Q: 如何查看详细日志

A: 服务器会自动输出请求日志：

```
📥 POST /api/sessions
✅ POST /api/sessions - 201 (125ms)
```

### Q: 如何限制工作空间访问

A: 在创建会话时设置 `workspaceRoot`，Agent 只能访问该目录下的文件。

### Q: 流式响应在浏览器中不工作

A: 确保：

1. 使用 `fetch` API，不要用 `axios`（不支持流式）
2. 响应头正确设置：`Content-Type: text/event-stream`
3. 浏览器支持 EventSource 或 fetch streams

## 下一步

- 📖 阅读 [USAGE.md](./USAGE.md) 了解更多 API 用法
- 📊 阅读 [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) 了解项目架构
- 🔧 添加认证：参考 Express + JWT 教程
- 💾 添加持久化：参考 Redis/PostgreSQL 集成
- 🎨 开发前端：参考上面的 React/Vue 示例

## 获取帮助

- 查看日志：服务器会输出所有请求和错误
- 使用健康检查：`curl http://localhost:3000/health`
- 查看会话统计：`curl http://localhost:3000/api/sessions`
