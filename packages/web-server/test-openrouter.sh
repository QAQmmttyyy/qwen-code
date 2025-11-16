#!/bin/bash

# 测试 OpenRouter 配置脚本
# 
# 使用方法：
# 1. 确保 .env 文件已配置 OPENROUTER_API_KEY
# 2. 运行: chmod +x test-openrouter.sh
# 3. 运行: ./test-openrouter.sh

set -e

echo "🧪 测试 OpenRouter 配置..."
echo ""

# 检查环境变量
if [ -f .env ]; then
    source .env
else
    echo "❌ 错误: .env 文件不存在"
    echo "请复制 .env.openrouter.example 为 .env 并配置你的 API Key"
    exit 1
fi

if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "❌ 错误: OPENROUTER_API_KEY 未设置"
    echo "请在 .env 文件中设置你的 OpenRouter API Key"
    exit 1
fi

echo "✅ 环境变量已配置"
echo ""

# 启动服务（在后台）
echo "🚀 启动服务..."
npm run dev &
SERVER_PID=$!
sleep 5

# 测试健康检查
echo "📡 测试健康检查..."
HEALTH_RESPONSE=$(curl -s http://localhost:${PORT:-3000}/health)
echo "响应: $HEALTH_RESPONSE"
echo ""

# 创建会话
echo "📝 创建测试会话..."
SESSION_RESPONSE=$(curl -s -X POST http://localhost:${PORT:-3000}/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen/qwen-2.5-72b-instruct",
    "workspaceRoot": "."
  }')

SESSION_ID=$(echo $SESSION_RESPONSE | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "会话 ID: $SESSION_ID"
echo ""

# 发送测试消息
if [ -n "$SESSION_ID" ]; then
    echo "💬 发送测试消息..."
    MESSAGE_RESPONSE=$(curl -s -X POST http://localhost:${PORT:-3000}/api/sessions/$SESSION_ID/messages \
      -H "Content-Type: application/json" \
      -d '{
        "message": "你好！请简单介绍一下自己。"
      }')
    echo "响应: $MESSAGE_RESPONSE"
    echo ""
fi

# 清理
echo "🧹 清理..."
kill $SERVER_PID 2>/dev/null || true

echo "✅ 测试完成！"
echo ""
echo "如果看到上述响应，说明 OpenRouter 配置成功！"
