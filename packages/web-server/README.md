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

- `POST /api/sessions/:id/messages` - Send a message (streaming)
- `GET /api/sessions/:id/messages` - Get message history

### Health

- `GET /health` - Health check endpoint

## Configuration

Set environment variables:

```bash
PORT=3000
SESSION_SECRET=your-secret-key
QWEN_API_KEY=your-api-key
WORKSPACE_ROOT=/path/to/workspace
```

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
