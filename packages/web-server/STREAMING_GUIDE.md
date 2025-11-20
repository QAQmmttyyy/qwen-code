# Streaming Events Guide

本指南说明如何处理 web-server 的流式响应事件。

## 事件格式

web-server 直接返回 `ServerGeminiStreamEvent` 对象，与 CLI 客户端使用相同的事件格式。

### 事件类型

所有事件类型定义在 `@qwen-code/qwen-code-core` 中的 `GeminiEventType`:

```typescript
enum GeminiEventType {
  Content = 'content', // AI 生成的文本内容
  ToolCallRequest = 'toolCall', // 工具调用请求
  ToolCallResponse = 'toolResponse', // 工具执行结果
  // ... 其他事件类型
}
```

### 事件结构

每个事件都有以下基本结构：

```typescript
interface ServerGeminiStreamEvent {
  type: GeminiEventType;
  value: any; // 根据 type 不同而不同
}
```

## 前端使用示例

### 基础 EventSource 用法

```javascript
const sessionId = 'your-session-id';
const eventSource = new EventSource(`/api/sessions/${sessionId}/messages`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: '你好，帮我写一个函数',
  }),
});

eventSource.onmessage = (event) => {
  if (event.data === '[DONE]') {
    eventSource.close();
    return;
  }

  const streamEvent = JSON.parse(event.data);

  switch (streamEvent.type) {
    case 'content':
      // 显示 AI 文本内容
      console.log('Content:', streamEvent.value);
      break;

    case 'toolCall':
      // 显示工具调用
      console.log('Tool call:', streamEvent.value.name, streamEvent.value.args);
      break;

    case 'toolResponse':
      // 显示工具执行结果
      console.log('Tool result:', streamEvent.value.resultDisplay);
      break;

    default:
      console.log('Other event:', streamEvent);
  }
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
};
```

### React 组件示例

```typescript
import { useEffect, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');

  const sendMessage = async (text: string) => {
    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setCurrentResponse('');

    // 使用 fetch 发送请求并处理流
    const response = await fetch(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            // 完成，保存消息
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: currentResponse
            }]);
            setCurrentResponse('');
            return;
          }

          try {
            const event = JSON.parse(data);
            if (event.type === 'content') {
              setCurrentResponse(prev => prev + event.value);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  };

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i} className={msg.role}>
          {msg.content}
        </div>
      ))}
      {currentResponse && (
        <div className="assistant streaming">
          {currentResponse}
        </div>
      )}
    </div>
  );
}
```

## 参考 CLI 实现

CLI 客户端在 `packages/cli/src` 中处理相同的事件流。
你可以参考以下文件：

- CLI 事件处理逻辑
- UI 渲染实现
- 工具调用显示

通过使用相同的事件格式，可以确保 Web 和 CLI 界面的一致性。

## 注意事项

1. **错误处理**: 始终处理 `onerror` 事件
2. **资源清理**: 使用完毕后关闭 EventSource
3. **超时处理**: 考虑添加超时机制
4. **重连逻辑**: EventSource 会自动重连，但你可能需要手动处理
