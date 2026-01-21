# Qwen Code Web Server - 使用指南

## 快速开始

### 1. 安装依赖

```bash
cd packages/web-server
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
PORT=3000
WORKSPACE_ROOT=/your/workspace/path
QWEN_API_KEY=your-api-key
```

### 3. 启动服务器

```bash
# 开发模式（使用 tsx）
npm run dev

# 生产模式
npm run build
npm start
```

## API 使用示例

### 创建会话

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceRoot": "/path/to/project",
    "model": "qwen-max"
  }'
```

响应：

```json
{
  "sessionId": "uuid-here",
  "workspaceRoot": "/path/to/project",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

### 发送消息（流式）

```bash
curl -X POST http://localhost:3000/api/sessions/{sessionId}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "帮我分析这个项目的结构",
    "stream": true
  }'
```

响应（Server-Sent Events）：

```
data: {"type":"chunk","content":"好的","timestamp":"..."}

data: {"type":"chunk","content":"，我来","timestamp":"..."}

data: [DONE]
```

### 获取对话历史

```bash
curl http://localhost:3000/api/sessions/{sessionId}/history
```

### 删除会话

```bash
curl -X DELETE http://localhost:3000/api/sessions/{sessionId}
```

### 健康检查

```bash
curl http://localhost:3000/health
```

## JavaScript/TypeScript 客户端示例

### 创建会话并发送消息

```typescript
// 创建会话
const createSession = async () => {
  const response = await fetch('http://localhost:3000/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceRoot: process.cwd(),
      model: 'qwen-max',
    }),
  });

  return await response.json();
};

// 发送消息（流式）
const sendMessage = async (sessionId: string, message: string) => {
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

  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          console.log('✅ Stream completed');
          return;
        }

        try {
          const parsed = JSON.parse(data);
          console.log('📦 Chunk:', parsed);
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
};

// 使用示例
const main = async () => {
  const { sessionId } = await createSession();
  console.log('📝 Session created:', sessionId);

  await sendMessage(sessionId, 'Hello, 分析一下当前项目');
};

main();
```

### React Hook 示例

```typescript
import { useState, useEffect } from 'react';

export function useQwenAgent(workspaceRoot: string) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 创建会话
  const createSession = async () => {
    const response = await fetch('http://localhost:3000/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceRoot }),
    });
    const data = await response.json();
    setSessionId(data.sessionId);
    return data.sessionId;
  };

  // 发送消息
  const sendMessage = async (
    message: string,
    onChunk: (chunk: any) => void,
  ) => {
    if (!sessionId) throw new Error('No active session');

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

    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            setLoading(false);
            return;
          }

          try {
            onChunk(JSON.parse(data));
          } catch (e) {
            // Ignore
          }
        }
      }
    }

    setLoading(false);
  };

  return { sessionId, createSession, sendMessage, loading };
}
```

## 错误处理

所有错误响应格式：

```json
{
  "error": "ErrorType",
  "message": "Error description",
  "statusCode": 400
}
```

常见错误码：

- `400` - 请求参数错误
- `404` - 会话不存在
- `500` - 服务器内部错误

## 性能优化建议

1. **使用流式响应**：对于长文本生成，建议使用 `stream: true`
2. **定期清理会话**：不再使用的会话应及时删除
3. **设置合理的超时**：`SESSION_TIMEOUT` 建议设置为 30-60 分钟
4. **限制并发会话**：`MAX_SESSIONS` 根据服务器资源调整

## 安全建议

1. **使用 HTTPS**：生产环境必须使用 HTTPS
2. **配置 CORS**：限制允许的来源域名
3. **添加认证**：为 API 添加 JWT 或其他认证机制
4. **限流**：使用 rate-limiting 中间件防止滥用
5. **输入验证**：对所有用户输入进行严格验证

## 监控

健康检查端点：

- `GET /health` - 整体健康状态
- `GET /health/ready` - 就绪检查
- `GET /health/live` - 存活检查

建议集成到：

- Kubernetes liveness/readiness probes
- 监控系统（Prometheus, Grafana）
- 日志聚合系统（ELK, Loki）
