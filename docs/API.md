# Grabby REST API Documentation

## Overview

The Grabby REST API is a local-first HTTP server that provides programmatic access to contract management and rules repository features. It enables editor integrations, automation scripts, and web UIs to interact with Grabby.

**Base URL**: `http://127.0.0.1:3456`
**Documentation**: `http://127.0.0.1:3456/v1/docs` (Swagger UI)
**OpenAPI Spec**: `http://127.0.0.1:3456/v1/openapi.yaml`

## Quick Start

### Starting the Server

```bash
# Start on default port (3456)
grabby serve

# Start on custom port
grabby serve --port=4000

# Set log level
grabby serve --log-level=debug
```

The server will automatically find an available port in the range 3456-3466 if the default is in use.

### Testing the API

```bash
# Get API info
curl http://127.0.0.1:3456/

# List all contracts
curl http://127.0.0.1:3456/v1/contracts

# Check health
curl http://127.0.0.1:3456/v1/health
```

## Authentication

**Phase 1**: No authentication required. The server binds to `127.0.0.1` only and is intended for local development use.

## Rate Limiting

- **Limit**: 100 requests per minute per IP address
- **Headers**: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- **Response**: HTTP 429 when exceeded

## Response Format

All endpoints return JSON in a standard envelope format:

### Success Response

```json
{
  "status": "success",
  "data": {
    // Response data here
  },
  "metadata": {
    "timestamp": "2026-03-21T00:00:00.000Z",
    "version": "3.7.0",
    "requestId": "uuid"
  }
}
```

### Error Response

```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  },
  "metadata": {
    "timestamp": "2026-03-21T00:00:00.000Z",
    "version": "3.7.0",
    "requestId": "uuid"
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate ID) |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | External service (Git, LLM) unavailable |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

## Endpoints

### Root

#### `GET /`

Returns API information and available endpoints.

**Response**:
```json
{
  "name": "Grabby REST API",
  "version": "3.7.0",
  "documentation": "/v1/docs",
  "endpoints": {
    "contracts": "/v1/contracts",
    "rules": "/v1/rules",
    "health": "/v1/health",
    "config": "/v1/config"
  }
}
```

---

### Contracts

#### `GET /v1/contracts`

List all feature contracts.

**Response**:
```json
{
  "status": "success",
  "data": {
    "contracts": [
      {
        "id": "FC-123",
        "title": "Add user authentication",
        "status": "draft",
        "type": "FEATURE_CONTRACT",
        "lastModified": "2026-03-21T00:00:00.000Z",
        "path": "contracts/FC-123.fc.md",
        "planPath": "contracts/FC-123.plan.yaml",
        "auditPath": null
      }
    ],
    "total": 1
  }
}
```

#### `POST /v1/contracts`

Create a new contract.

**Request Body**:
```json
{
  "title": "Add user authentication",
  "objective": "Implement JWT-based authentication for API endpoints",
  "type": "feat"
}
```

**Response**: HTTP 201 with created contract details.

#### `GET /v1/contracts/:id`

Get contract details.

**Query Parameters**:
- `validate` (boolean): Include validation results

**Response**:
```json
{
  "status": "success",
  "data": {
    "contract": {
      "id": "FC-123",
      "title": "Add user authentication",
      "content": "# FC: Add user authentication\n...",
      "validation": {
        "valid": true,
        "errors": [],
        "warnings": []
      }
    }
  }
}
```

#### `PUT /v1/contracts/:id`

Update contract content or status.

**Request Body**:
```json
{
  "content": "# Updated content",
  "status": "approved"
}
```

#### `DELETE /v1/contracts/:id`

Delete a contract and its artifacts.

**Response**: HTTP 200 with confirmation.

#### `POST /v1/contracts/:id/validate`

Run validation on a contract.

**Response**:
```json
{
  "status": "success",
  "data": {
    "valid": true,
    "errors": [],
    "warnings": [],
    "suggestions": []
  }
}
```

#### `POST /v1/contracts/:id/plan`

Generate an implementation plan.

**Response**:
```json
{
  "status": "success",
  "data": {
    "planPath": "contracts/FC-123.plan.yaml",
    "plan": "contract: FC-123.fc.md\n..."
  }
}
```

---

### Rules

#### `GET /v1/rules`

List active rulesets.

**Response**:
```json
{
  "status": "success",
  "data": {
    "rulesets": [
      {
        "path": "languages/typescript",
        "category": "languages",
        "name": "typescript",
        "version": "1.0.0",
        "description": "TypeScript coding standards"
      }
    ],
    "total": 1,
    "lastSync": "2026-03-21T00:00:00.000Z",
    "manifestVersion": "1.0.0"
  }
}
```

#### `POST /v1/rules/sync`

Sync rulesets from central repository.

**Response**:
```json
{
  "status": "success",
  "data": {
    "synced": true,
    "timestamp": "2026-03-21T00:00:00.000Z",
    "version": "1.0.0",
    "commit": "abc123",
    "rulesets": ["languages/typescript", "policies/security"]
  }
}
```

**Error**: HTTP 503 if Git is unavailable.

#### `GET /v1/rules/status`

Check ruleset sync status and drift.

**Response**:
```json
{
  "status": "success",
  "data": {
    "lastSync": "2026-03-21T00:00:00.000Z",
    "isStale": false,
    "hasDrift": false,
    "source": {
      "repo": "https://github.com/org/rulesets.git",
      "branch": "main",
      "commit": "abc123",
      "version": "1.0.0"
    },
    "activeRulesets": 6
  }
}
```

#### `GET /v1/rules/:category/:name`

Get specific ruleset details.

**Example**: `GET /v1/rules/languages/typescript`

**Response**:
```json
{
  "status": "success",
  "data": {
    "ruleset": {
      "category": "languages",
      "name": "typescript",
      "version": "1.0.0",
      "description": "TypeScript coding standards",
      "content": "# TypeScript Rules\n..."
    }
  }
}
```

---

### Health & Configuration

#### `GET /v1/health`

System health check.

**Response**:
```json
{
  "status": "success",
  "data": {
    "status": "healthy",
    "services": {
      "filesystem": { "status": "ok" },
      "git": { "status": "ok" },
      "rulesets": { "status": "ok" }
    },
    "system": {
      "uptime": 123.45,
      "memory": {
        "used": 50000000,
        "total": 100000000
      },
      "platform": "win32",
      "nodeVersion": "v18.0.0"
    },
    "version": "3.7.0",
    "responseTime": 5
  }
}
```

**Status Codes**:
- HTTP 200: All services healthy
- HTTP 503: One or more services degraded

#### `GET /v1/config`

Get runtime configuration (secrets redacted).

**Response**:
```json
{
  "status": "success",
  "data": {
    "config": {
      "ai": {
        "provider": "anthropic",
        "apiKey": "***REDACTED***"
      },
      "contracts": {
        "directory": "contracts"
      }
    }
  }
}
```

#### `PUT /v1/config`

Update runtime configuration.

**Request Body**:
```json
{
  "updates": {
    "features": {
      "menuMode": false
    }
  }
}
```

**Response**: HTTP 200 with confirmation.

---

## Interactive Documentation

Visit `http://127.0.0.1:3456/v1/docs` for interactive Swagger UI documentation where you can:

- Browse all endpoints
- View request/response schemas
- Try out API calls directly
- See example requests/responses

## Client Libraries

### cURL Examples

```bash
# Create contract
curl -X POST http://127.0.0.1:3456/v1/contracts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add authentication",
    "objective": "Implement JWT auth"
  }'

# Validate contract
curl -X POST http://127.0.0.1:3456/v1/contracts/FC-123/validate

# Sync rulesets
curl -X POST http://127.0.0.1:3456/v1/rules/sync
```

### JavaScript/Node.js

```javascript
const baseURL = 'http://127.0.0.1:3456';

// List contracts
const contracts = await fetch(`${baseURL}/v1/contracts`)
  .then(r => r.json());

// Create contract
const newContract = await fetch(`${baseURL}/v1/contracts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Add authentication',
    objective: 'Implement JWT auth'
  })
}).then(r => r.json());
```

### Python

```python
import requests

base_url = 'http://127.0.0.1:3456'

# List contracts
contracts = requests.get(f'{base_url}/v1/contracts').json()

# Create contract
new_contract = requests.post(
    f'{base_url}/v1/contracts',
    json={
        'title': 'Add authentication',
        'objective': 'Implement JWT auth'
    }
).json()
```

## Logging

Logs are written to `.grabby/logs/`:

- `api-combined.log` - All requests
- `api-error.log` - Errors only

Each log entry includes:
- Request ID (UUID)
- Timestamp
- Method and path
- Status code
- Response time
- IP address
- User agent

## Security

### Localhost Only

The server binds to `127.0.0.1` and is **not accessible** from external networks. This is a security feature for Phase 1.

### Rate Limiting

Default: 100 requests per minute per IP. Protects against accidental abuse.

### Input Validation

All endpoints validate input using `express-validator`. Invalid requests return HTTP 400 with detailed error messages.

### No Code Execution

The API does not execute arbitrary code. All operations are read-only or modify only data files.

## Troubleshooting

### Server Won't Start

**Port already in use**:
```bash
# Server auto-increments port
# Check actual port in startup message
```

**Permission denied**:
```bash
# Make sure you have write access to .grabby/logs/
mkdir -p .grabby/logs
```

### Endpoints Return 503

**Git unavailable**:
```bash
# Install Git or fix PATH
git --version
```

**Rulesets not synced**:
```bash
grabby rules sync
```

### Swagger UI Not Loading

**OpenAPI spec missing**:
```bash
# Make sure docs/openapi.yaml exists
ls docs/openapi.yaml
```

## Changelog

### v1.0.0 (Phase 1)
- Initial release
- Contract CRUD endpoints
- Rules sync integration
- Health monitoring
- Swagger UI documentation
- Rate limiting
- Request logging

## Future Phases

- **Phase 2**: Context optimization, caching
- **Phase 3**: Agent runtime, SSE streaming
- **Phase 4**: Authentication, webhooks, multi-user

---

**Documentation Version**: 1.0.0
**Last Updated**: 2026-03-21
