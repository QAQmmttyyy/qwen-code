# @qwen-code/web-server

Backend service for Qwen Code web-based agent interaction.

## Features

- 🤖 Agent session management
- 💬 Real-time streaming responses (SSE)
- 🔧 Full tool execution support
- 📁 File operation capabilities
- 🔒 Session isolation and security
- 📊 Session persistence

## Installation

```bash
npm install
npm run build
```

## Usage

### Start the server

```bash
npm start
```

### Development mode

```bash
npm run dev
```

## API Endpoints

### Sessions

- `POST /api/sessions` - Create a new session
- `GET /api/sessions/:id` - Get session info
- `DELETE /api/sessions/:id` - Delete a session
- `GET /api/sessions/:id/history` - Get conversation history

### Messages

- `POST /api/sessions/:id/messages` - Send a message (streaming via SSE)

### Health

- `GET /health` - Health check endpoint

## Configuration

Set environment variables:

```bash
PORT=3000
SESSION_SECRET=your-secret-key
OPENROUTER_API_KEY=your-api-key
WORKSPACE_ROOT=/path/to/workspace
```

## Streaming Events

The message endpoint streams `ServerGeminiStreamEvent` objects via Server-Sent Events (SSE).
These events use the same format as the CLI client, making it easy to build a consistent UI.

Event types from `@qwen-code/qwen-code-core`:

- `Content` - Text content chunks
- `ToolCallRequest` - Tool execution requests
- `ToolCallResponse` - Tool execution results
- And more...

See the CLI implementation for reference on handling these events.

## Architecture

```
┌──────────────┐
│  Web Client  │
└──────┬───────┘
       │ HTTP/SSE
┌──────▼───────┐
│ Express API  │
├──────────────┤
│ Session Mgr  │
├──────────────┤
│ Agent Service│
└──────┬───────┘
       │
┌──────▼───────┐
│  Core Agent  │
└──────────────┘
```
