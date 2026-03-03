# Chat Session Persistence for Claws

## Summary

This PR adds chat session persistence to the Claws feature, enabling WhatsApp and Slack conversations to maintain context across multiple messages. Previously, each message would start a fresh execution with no knowledge of prior conversations. Now, sessions are persisted to the database and can be resumed.

## Changes

### 1. Database Schema (src/main/lib/db/schema/index.ts)
- Added `chatSessions` table with:
  - `id`: Unique session identifier
  - `clawId`: Reference to the associated claw
  - `externalId`: WhatsApp JID or Slack channel/thread ID
  - `platform`: Enum ("whatsapp" | "slack")
  - `status`: Session status ("idle" | "active" | "completed" | "error")
  - `currentExecutionId`: Link to currently running execution
  - `context`: JSON column for message history and metadata
  - `lastActivityAt`: Timestamp for session cleanup
- Added `sessionId` column to `clawExecutions` table
- Added proper indexes and relations

### 2. Migration (drizzle/0060_add_chat_sessions.sql)
- Creates `chat_sessions` table
- Adds indexes for efficient querying
- Adds `session_id` column to `claw_executions`
- Sets up foreign key constraints

### 3. Session Manager (src/main/lib/claws/session-manager.ts)
New service module providing:
- `getOrCreateSession()`: Get existing or create new session
- `getSession()`: Retrieve session by ID
- `getSessionByExternalId()`: Find session by external chat ID
- `updateSessionStatus()`: Update session status and execution
- `getSessionContext()`: Parse context JSON
- `updateSessionContext()`: Update session context
- `addMessageToSession()`: Append message to history
- `getActiveSessionsForClaw()`: List active sessions
- `getSessionsForClaw()`: List all sessions
- `getSessionWithExecutions()`: Get session with execution history
- `deleteSession()`: Delete a session
- `cleanupOldSessions()`: Cleanup stale sessions
- `formatSessionContextForPrompt()`: Format context for Claude

### 4. Updated ClawDaemon (src/main/lib/claws/index.ts)
- Modified `executeClaw()` to:
  - Accept optional `sessionId` parameter
  - Auto-create sessions for WhatsApp/Slack triggers
  - Include session context in Claude prompt
  - Link executions to sessions
- Modified `executeClaudeSDK()` to:
  - Accept session parameter
  - Update session status on completion/error
  - Add execution results to session history
- Updated `buildInitialMessages()` to include session info

### 5. Updated WhatsApp Trigger (src/main/lib/claws/whatsapp-trigger.ts)
- Added imports for session manager
- Modified `handleMessage()` to:
  - Get or create session for each chat
  - Check for active sessions before executing
  - Add user messages to session
- Modified `monitorExecution()` to:
  - Accept sessionId parameter
  - Update session status on completion
  - Add responses to session history

### 6. Updated Slack Trigger (src/main/lib/claws/slack-trigger.ts)
- Added imports for session manager
- Modified `handleMessage()` to:
  - Get or create session for each thread
  - Check for active sessions before executing
  - Add user messages to session
- Modified `monitorExecution()` to:
  - Accept sessionId parameter
  - Update session status on completion
  - Add responses to session history

### 7. Updated tRPC Router (src/main/lib/trpc/routers/claws.ts)
Added new endpoints:
- `getSessions`: List all sessions for a claw
- `getSession`: Get single session with execution history
- `deleteSession`: Delete a session
- `continueSession`: Continue a session with new message

## How It Works

1. **Session Creation**: When a WhatsApp/Slack message is received, a session is created (or retrieved) using the chat ID as the external ID.

2. **Message History**: Each user message and assistant response is stored in the session's context JSON.

3. **Context Injection**: When executing a claw, the previous conversation history is formatted and prepended to the Claude prompt.

4. **Status Tracking**: Sessions track their status (idle → active → completed/error) to prevent concurrent executions.

5. **Execution Linking**: Each execution is linked to its session via `sessionId`.

## Testing

1. Configure a WhatsApp or Slack claw
2. Send a message to the claw
3. Send a follow-up message referencing the previous one
4. Verify the claw has context from the previous message
5. Check the Claw settings to view session history

## Migration Notes

The migration is backward compatible. Existing claws will work without sessions, and new sessions will be created automatically when needed.
