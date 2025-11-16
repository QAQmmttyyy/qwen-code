# 使用 OpenRouter API 指南

## 前提条件

1. 注册 OpenRouter 账号：https://openrouter.ai/
2. 获取 API Key：https://openrouter.ai/keys
3. 充值账户（根据需要）

## 配置方式

### 方式 1：使用环境变量（推荐）

1. 复制环境变量示例文件：

```bash
cd packages/web-server
cp .env.example .env
```

2. 编辑 `.env` 文件，配置 OpenRouter：

```bash
# OpenRouter API 配置
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

3. 启动服务：

```bash
npm run dev
```

### 方式 2：通过 API 请求传递

创建会话时，在请求体中传递配置：

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen-2.5-72b-instruct",
    "apiKey": "sk-or-v1-your-api-key-here",
    "baseUrl": "https://openrouter.ai/api/v1",
    "workspaceRoot": "/path/to/your/workspace"
  }'
```

## 支持的模型

OpenRouter 支持多种模型，包括：

- `qwen/qwen-2.5-72b-instruct` - Qwen 2.5 72B
- `qwen/qwen-2-72b-instruct` - Qwen 2 72B
- `anthropic/claude-3-5-sonnet` - Claude 3.5 Sonnet
- `openai/gpt-4-turbo` - GPT-4 Turbo
- 更多模型查看：https://openrouter.ai/models

## 使用示例

### 1. 创建会话

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen-2.5-72b-instruct",
    "workspaceRoot": "/Users/yourname/projects"
  }'
```

响应：

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "workspaceRoot": "/Users/yourname/projects",
  "createdAt": "2025-11-16T10:30:00.000Z"
}
```

### 2. 发送消息

```bash
curl -X POST http://localhost:3000/api/sessions/550e8400-e29b-41d4-a716-446655440000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "帮我创建一个 Python 脚本来计算斐波那契数列"
  }'
```

### 3. 流式响应

```bash
curl -X POST http://localhost:3000/api/sessions/550e8400-e29b-41d4-a716-446655440000/messages \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "解释一下这段代码",
    "stream": true
  }'
```

## 费用说明

- OpenRouter 按使用量计费
- 不同模型价格不同，查看：https://openrouter.ai/models
- Qwen 模型通常比 OpenAI 模型便宜很多
- 建议设置使用限额以控制成本

## 常见问题

### Q: 如何查看我的使用量？

A: 访问 https://openrouter.ai/activity

### Q: 支持哪些模型？

A: 查看完整模型列表：https://openrouter.ai/models

### Q: API Key 安全吗？

A:

- 不要将 API Key 提交到代码仓库
- 使用环境变量或 `.env` 文件（已在 `.gitignore` 中）
- 定期轮换 API Key

### Q: 如何切换回 Qwen API？

A: 修改 `.env` 文件，注释掉 OpenRouter 配置，启用 Qwen 配置：

```bash
# OPENROUTER_API_KEY=...
# OPENROUTER_BASE_URL=...

QWEN_API_KEY=your-qwen-api-key
QWEN_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

## 优势

使用 OpenRouter 的优势：

1. **统一接口**：一个 API 访问多个模型提供商
2. **灵活计费**：按使用量付费，无需订阅
3. **自动路由**：自动选择最优的模型实例
4. **负载均衡**：自动处理限流和重试
5. **多模型支持**：轻松切换不同的 AI 模型

## 技术支持

- OpenRouter 文档：https://openrouter.ai/docs
- OpenRouter Discord：https://discord.gg/openrouter
- 项目 Issues：https://github.com/QwenLM/qwen-code/issues
