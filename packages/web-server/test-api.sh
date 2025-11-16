#!/bin/bash

# Qwen Code Web Server API 测试脚本

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
SESSION_ID=""

echo "🧪 Qwen Code Web Server API 测试"
echo "=================================="
echo "Base URL: $BASE_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试健康检查
echo -e "${YELLOW}1. 测试健康检查${NC}"
echo "GET $BASE_URL/health"
curl -s "$BASE_URL/health" | jq '.'
echo ""

# 创建会话
echo -e "${YELLOW}2. 创建会话${NC}"
echo "POST $BASE_URL/api/sessions"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceRoot": "/tmp/test-workspace",
    "model": "qwen-max"
  }')

echo "$RESPONSE" | jq '.'
SESSION_ID=$(echo "$RESPONSE" | jq -r '.sessionId')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
  echo -e "${RED}❌ 创建会话失败${NC}"
  exit 1
fi

echo -e "${GREEN}✅ 会话已创建: $SESSION_ID${NC}"
echo ""

# 获取会话信息
echo -e "${YELLOW}3. 获取会话信息${NC}"
echo "GET $BASE_URL/api/sessions/$SESSION_ID"
curl -s "$BASE_URL/api/sessions/$SESSION_ID" | jq '.'
echo ""

# 发送消息（非流式）
echo -e "${YELLOW}4. 发送消息（非流式）${NC}"
echo "POST $BASE_URL/api/sessions/$SESSION_ID/messages"
echo "Message: '你好，请介绍一下自己'"
curl -s -X POST "$BASE_URL/api/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请介绍一下自己",
    "stream": false
  }' | jq '.candidates[0].content.parts[0].text' 2>/dev/null || echo "Response received (non-JSON format)"
echo ""

# 发送消息（流式）
echo -e "${YELLOW}5. 发送消息（流式 SSE）${NC}"
echo "POST $BASE_URL/api/sessions/$SESSION_ID/messages"
echo "Message: '说一句话'"
echo "正在接收流式响应..."
curl -s -N -X POST "$BASE_URL/api/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "说一句简短的话",
    "stream": true
  }' | while IFS= read -r line; do
    if [[ $line == data:* ]]; then
      data="${line#data: }"
      if [ "$data" = "[DONE]" ]; then
        echo -e "${GREEN}✅ 流式响应完成${NC}"
        break
      else
        echo "$data" | jq -r 'if .content then .content else empty end' 2>/dev/null || true
      fi
    fi
  done
echo ""

# 获取对话历史
echo -e "${YELLOW}6. 获取对话历史${NC}"
echo "GET $BASE_URL/api/sessions/$SESSION_ID/history"
HISTORY=$(curl -s "$BASE_URL/api/sessions/$SESSION_ID/history")
MESSAGE_COUNT=$(echo "$HISTORY" | jq '.messageCount')
echo "消息数量: $MESSAGE_COUNT"
echo ""

# 列出所有会话
echo -e "${YELLOW}7. 列出所有会话${NC}"
echo "GET $BASE_URL/api/sessions"
curl -s "$BASE_URL/api/sessions" | jq '.'
echo ""

# 删除会话
echo -e "${YELLOW}8. 删除会话${NC}"
echo "DELETE $BASE_URL/api/sessions/$SESSION_ID"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/api/sessions/$SESSION_ID")

if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✅ 会话已删除 (HTTP $HTTP_CODE)${NC}"
else
  echo -e "${RED}❌ 删除失败 (HTTP $HTTP_CODE)${NC}"
fi
echo ""

echo "=================================="
echo -e "${GREEN}✅ 所有测试完成！${NC}"
