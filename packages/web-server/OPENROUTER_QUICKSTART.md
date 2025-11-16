# OpenRouter 快速开始 🚀

如果你有 OpenRouter API Key 而没有 Qwen API Key，按照以下步骤快速开始：

## 1️⃣ 配置环境变量

```bash
cd packages/web-server

# 复制 OpenRouter 配置示例
cp .env.openrouter.example .env

# 编辑 .env 文件，替换你的 API Key
# OPENROUTER_API_KEY=your-openrouter-api-key
```

## 2️⃣ 获取 OpenRouter API Key

1. 访问 https://openrouter.ai/
2. 注册/登录账号
3. 前往 https://openrouter.ai/keys 创建 API Key
4. 复制 API Key 到 `.env` 文件

## 3️⃣ 安装依赖并启动

```bash
# 从项目根目录
npm install

# 启动 web-server
cd packages/web-server
npm run dev
```

## 4️⃣ 测试 API

### 创建会话

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen-2.5-72b-instruct"
  }'
```

### 发送消息

```bash
# 替换 SESSION_ID 为上一步返回的 sessionId
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，帮我写一个 Python 冒泡排序"
  }'
```

## 推荐模型

在 OpenRouter 上使用 Qwen 模型：

- `qwen/qwen-2.5-72b-instruct` - 最新 Qwen 2.5 大模型
- `qwen/qwen-2.5-32b-instruct` - 性能与成本平衡
- `qwen/qwen-2.5-7b-instruct` - 快速响应，低成本

查看所有模型：https://openrouter.ai/models

## 费用提示

- Qwen 模型在 OpenRouter 上通常比 GPT-4 便宜 10-20 倍
- 建议先充值少量金额测试（如 $5）
- 在 https://openrouter.ai/activity 查看实时使用情况

## 故障排除

### 错误: "Invalid API Key"

- 检查 `.env` 文件中的 `OPENROUTER_API_KEY` 是否正确
- 确保 API Key 以 `sk-or-v1-` 开头

### 错误: "Model not found"

- 检查模型名称是否正确
- 访问 https://openrouter.ai/models 查看可用模型

### 错误: "Insufficient credits"

- 前往 https://openrouter.ai/credits 充值

## 下一步

- 查看完整 API 文档：[USAGE.md](./USAGE.md)
- 查看 OpenRouter 详细指南：[OPENROUTER_GUIDE.md](./OPENROUTER_GUIDE.md)
- 运行自动化测试：`./test-openrouter.sh`

## 需要帮助？

- OpenRouter 文档：https://openrouter.ai/docs
- OpenRouter Discord：https://discord.gg/openrouter
- 项目 Issues：https://github.com/QwenLM/qwen-code/issues
