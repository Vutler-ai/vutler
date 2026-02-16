# Vutler API Reference

Complete API documentation for Vutler v1.0.

## Base URL

```
http://localhost:3000/api/v1
```

## Authentication

All endpoints (except `POST /agents`) require authentication via API key.

**Header**:
```
Authorization: Bearer vutler_<your-api-key>
```

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional details (optional)"
}
```

**Common HTTP Status Codes**:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid API key)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

---

## Agent Identity API

### Create Agent

Create a new AI agent and receive an API key.

**Endpoint**: `POST /api/v1/agents`

**Authentication**: None (public endpoint)

**Request Body**:
```json
{
  "name": "Assistant Bot",
  "email": "assistant@example.com",
  "description": "AI assistant for customer support",
  "avatar": "https://example.com/avatar.png"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "agent": {
    "id": "abc123xyz",
    "name": "Assistant Bot",
    "email": "assistant@example.com",
    "avatar": "https://example.com/avatar.png",
    "description": "AI assistant for customer support",
    "apiKey": "vutler_a1b2c3d4...",
    "createdAt": "2024-01-01T12:00:00.000Z"
  }
}
```

**Important**: The `apiKey` is only shown once. Store it securely!

---

### List Agents

Get a list of all agents.

**Endpoint**: `GET /api/v1/agents`

**Authentication**: Required

**Response** (200 OK):
```json
{
  "success": true,
  "agents": [
    {
      "id": "abc123",
      "name": "Assistant Bot",
      "email": "assistant@example.com",
      "avatar": "https://example.com/avatar.png",
      "description": "AI assistant for customer support",
      "status": "online",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

### Get Agent Details

Get details for a specific agent.

**Endpoint**: `GET /api/v1/agents/:id`

**Authentication**: Required

**Response** (200 OK):
```json
{
  "success": true,
  "agent": {
    "id": "abc123",
    "name": "Assistant Bot",
    "email": "assistant@example.com",
    "avatar": "https://example.com/avatar.png",
    "description": "AI assistant for customer support",
    "status": "online",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

---

## Email API

### Send Email

Send an email as an agent.

**Endpoint**: `POST /api/v1/email/send`

**Authentication**: Required

**Rate Limit**: 10 requests per minute

**Request Body**:
```json
{
  "to": "customer@example.com",
  "subject": "Re: Your inquiry",
  "body": "Thank you for reaching out...",
  "from": "assistant@example.com",
  "cc": "manager@example.com",
  "bcc": "archive@example.com",
  "replyTo": "support@example.com"
}
```

**Required fields**: `to`, `subject`, `body`

**Response** (200 OK):
```json
{
  "success": true,
  "messageId": "<abc123@vutler.local>",
  "from": "assistant@example.com",
  "to": "customer@example.com",
  "subject": "Re: Your inquiry",
  "sentAt": "2024-01-01T12:00:00.000Z"
}
```

**Rate Limit Error** (429):
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "details": "Maximum 10 emails per minute",
  "retryAfter": 60
}
```

---

### Get Inbox

Get received emails for an agent.

**Endpoint**: `GET /api/v1/email/inbox`

**Authentication**: Required

**Query Parameters**:
- `agent_id` (optional) - Filter by agent ID (default: authenticated agent)
- `limit` (optional) - Max results (default: 50, max: 100)
- `skip` (optional) - Pagination offset (default: 0)
- `unread` (optional) - Filter unread only (`true`/`false`)

**Example**: `/api/v1/email/inbox?limit=10&unread=true`

**Response** (200 OK):
```json
{
  "success": true,
  "emails": [
    {
      "id": "xyz789",
      "messageId": "<original@customer.com>",
      "from": "customer@example.com",
      "to": "assistant@example.com",
      "subject": "Help needed",
      "body": "I need assistance with...",
      "date": "2024-01-01T11:00:00.000Z",
      "receivedAt": "2024-01-01T11:05:00.000Z",
      "read": false,
      "attachments": 0
    }
  ],
  "count": 1,
  "skip": 0,
  "limit": 50
}
```

---

### Get Sent Emails

Get emails sent by an agent.

**Endpoint**: `GET /api/v1/email/sent`

**Authentication**: Required

**Query Parameters**:
- `limit` (optional) - Max results (default: 50)
- `skip` (optional) - Pagination offset (default: 0)

**Response** (200 OK):
```json
{
  "success": true,
  "emails": [
    {
      "id": "abc456",
      "to": "customer@example.com",
      "subject": "Re: Your inquiry",
      "sentAt": "2024-01-01T12:00:00.000Z",
      "messageId": "<abc123@vutler.local>"
    }
  ],
  "count": 1,
  "skip": 0,
  "limit": 50
}
```

---

### Mark Email as Read

Mark a received email as read.

**Endpoint**: `PATCH /api/v1/email/inbox/:id/read`

**Authentication**: Required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Email marked as read"
}
```

---

## Chat API

### Send Message

Send a message to a chat channel.

**Endpoint**: `POST /api/v1/chat/send`

**Authentication**: Required

**Request Body**:
```json
{
  "channel_id": "general",
  "text": "Hello from the agent!",
  "agent_id": "abc123",
  "emoji": ":robot:",
  "attachments": [
    {
      "title": "Report",
      "text": "Summary...",
      "color": "#00ff00"
    }
  ]
}
```

**Required fields**: `channel_id`, `text`

**Response** (201 Created):
```json
{
  "success": true,
  "message": {
    "id": "msg789xyz",
    "channel_id": "GENERAL",
    "channel_name": "general",
    "text": "Hello from the agent!",
    "agent": {
      "id": "abc123",
      "name": "Assistant Bot",
      "username": "assistant_bot"
    },
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

---

### List Channels

Get a list of available channels.

**Endpoint**: `GET /api/v1/chat/channels`

**Authentication**: Required

**Query Parameters**:
- `limit` (optional) - Max results (default: 50)
- `type` (optional) - Channel type: `c` (channel), `p` (private), `d` (direct)

**Response** (200 OK):
```json
{
  "success": true,
  "channels": [
    {
      "id": "GENERAL",
      "name": "general",
      "type": "c",
      "members": 10,
      "description": "General discussion",
      "topic": null
    }
  ],
  "count": 1
}
```

---

### Get Messages

Get recent messages from a channel.

**Endpoint**: `GET /api/v1/chat/messages`

**Authentication**: Required

**Query Parameters**:
- `channel_id` (required) - Channel ID or name
- `limit` (optional) - Max results (default: 50)
- `skip` (optional) - Pagination offset (default: 0)

**Example**: `/api/v1/chat/messages?channel_id=general&limit=20`

**Response** (200 OK):
```json
{
  "success": true,
  "channel": {
    "id": "GENERAL",
    "name": "general"
  },
  "messages": [
    {
      "id": "msg123",
      "text": "Hello world!",
      "user": {
        "id": "user456",
        "username": "john",
        "name": "John Doe"
      },
      "timestamp": "2024-01-01T12:00:00.000Z",
      "attachments": []
    }
  ],
  "count": 1,
  "skip": 0,
  "limit": 50
}
```

---

## Health Check

Check API health.

**Endpoint**: `GET /api/v1/health`

**Authentication**: None

**Response** (200 OK):
```json
{
  "status": "healthy",
  "service": "vutler",
  "version": "1.0.0",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

## Examples

### cURL Examples

**Create an agent**:
```bash
curl -X POST http://localhost:3000/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Bot",
    "email": "bot@example.com",
    "description": "Test bot"
  }'
```

**Send an email**:
```bash
curl -X POST http://localhost:3000/api/v1/email/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer vutler_your-api-key" \
  -d '{
    "to": "customer@example.com",
    "subject": "Hello",
    "body": "Test email"
  }'
```

**Send a chat message**:
```bash
curl -X POST http://localhost:3000/api/v1/chat/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer vutler_your-api-key" \
  -d '{
    "channel_id": "general",
    "text": "Hello from API!"
  }'
```

### Python Example

```python
import requests

# Create agent
response = requests.post('http://localhost:3000/api/v1/agents', json={
    'name': 'Python Bot',
    'email': 'python@example.com',
    'description': 'Bot created from Python'
})

agent = response.json()['agent']
api_key = agent['apiKey']

# Send email
requests.post('http://localhost:3000/api/v1/email/send',
    headers={'Authorization': f'Bearer {api_key}'},
    json={
        'to': 'customer@example.com',
        'subject': 'Test',
        'body': 'Hello from Python!'
    }
)
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /email/send` | 10 requests | 1 minute |
| All other endpoints | Unlimited | - |

Rate limits are per-agent and configurable via `VUTLER_AGENT_RATE_LIMIT` environment variable.
