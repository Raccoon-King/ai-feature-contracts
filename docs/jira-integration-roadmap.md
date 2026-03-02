# Grabby: Jira Integration & Multi-Provider LLM Roadmap

## Overview

This document outlines the implementation plan for:
1. Full Jira integration for syncing feature contracts with Jira issues
2. Unified configuration system (`grabby.config.json`)
3. AWS Bedrock multi-model support expansion

---

## Configuration System

### Config File: `grabby.config.json`

Users create this file in their project root to configure Grabby integrations.

```json
{
  "$schema": "https://grabby.dev/schemas/config.json",
  "version": "1.0",

  "jira": {
    "enabled": true,
    "host": "https://your-company.atlassian.net",
    "email": "your-email@company.com",
    "apiToken": "${JIRA_API_TOKEN}",
    "project": "PROJ",
    "defaults": {
      "issueType": "Story",
      "labels": ["grabby", "feature-contract"],
      "components": ["backend"],
      "priority": "Medium"
    },
    "sync": {
      "autoCreate": true,
      "autoUpdate": true,
      "bidirectional": false,
      "statusMapping": {
        "draft": "To Do",
        "approved": "In Progress",
        "executing": "In Progress",
        "completed": "Done",
        "archived": "Done"
      }
    },
    "customFields": {
      "contractId": "customfield_10001",
      "complexity": "customfield_10002",
      "coverageTarget": "customfield_10003"
    }
  },

  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "apiKey": "${ANTHROPIC_API_KEY}",
    "maxTokens": 4096,
    "temperature": 0.7,

    "providers": {
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}",
        "models": {
          "default": "claude-sonnet-4-20250514",
          "fast": "claude-3-5-haiku-20241022",
          "powerful": "claude-opus-4-20250514"
        }
      },
      "openai": {
        "apiKey": "${OPENAI_API_KEY}",
        "organization": "${OPENAI_ORG_ID}",
        "models": {
          "default": "gpt-4-turbo",
          "fast": "gpt-4o-mini",
          "powerful": "gpt-4o"
        }
      },
      "bedrock": {
        "region": "us-east-1",
        "profile": "default",
        "accessKeyId": "${AWS_ACCESS_KEY_ID}",
        "secretAccessKey": "${AWS_SECRET_ACCESS_KEY}",
        "sessionToken": "${AWS_SESSION_TOKEN}",
        "models": {
          "default": "anthropic.claude-3-sonnet-20240229-v1:0",
          "fast": "anthropic.claude-3-haiku-20240307-v1:0",
          "powerful": "anthropic.claude-3-opus-20240229-v1:0",
          "llama": "meta.llama3-70b-instruct-v1:0",
          "mistral": "mistral.mistral-large-2402-v1:0",
          "titan": "amazon.titan-text-premier-v1:0",
          "cohere": "cohere.command-r-plus-v1:0"
        },
        "inferenceProfile": null,
        "crossRegion": false
      },
      "azure": {
        "endpoint": "${AZURE_OPENAI_ENDPOINT}",
        "apiKey": "${AZURE_OPENAI_API_KEY}",
        "apiVersion": "2024-02-01",
        "deploymentName": "gpt-4-turbo"
      },
      "ollama": {
        "host": "http://localhost:11434",
        "model": "llama3:70b"
      }
    }
  },

  "contracts": {
    "directory": "contracts",
    "templates": ".grabby/templates",
    "autoValidate": true,
    "strictMode": false
  },

  "hooks": {
    "preCommit": true,
    "postCreate": ["jira:create"],
    "postApprove": ["jira:transition"],
    "postComplete": ["jira:close"]
  }
}
```

### Environment Variables

For security, sensitive values should use environment variables:

```bash
# .env (add to .gitignore!)
JIRA_API_TOKEN=your-jira-api-token
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...  # Optional, for temporary credentials
```

### Config Initialization

```bash
# Interactive config setup
grabby config init

# Set individual values
grabby config set jira.host "https://company.atlassian.net"
grabby config set ai.provider bedrock
grabby config set ai.providers.bedrock.region us-west-2

# View current config
grabby config show

# Validate config
grabby config validate
```

---

## User Stories: Jira Integration

### Epic: GRAB-100 - Jira Integration

#### Story 1: Configuration & Authentication
**ID:** GRAB-101
**Title:** As a user, I want to configure Jira credentials so that Grabby can sync with my Jira instance

**Acceptance Criteria:**
- [ ] User can run `grabby config init` to set up Jira config interactively
- [ ] Config supports Jira Cloud (Atlassian) and Jira Server/Data Center
- [ ] API token stored securely via environment variable reference
- [ ] Connection test available via `grabby jira test`
- [ ] Clear error messages for authentication failures

**Technical Notes:**
- Use `jira.js` npm package for API interactions
- Support both Basic Auth (email + API token) and OAuth 2.0
- Implement credential validation on config save

---

#### Story 2: Create Jira Issues from Contracts
**ID:** GRAB-102
**Title:** As a user, I want to create Jira issues from feature contracts automatically

**Acceptance Criteria:**
- [ ] `grabby jira create <contract>` creates a Jira issue from contract
- [ ] Issue title from contract title, description from Objective/Scope
- [ ] Contract ID stored in Jira custom field
- [ ] Jira issue key stored in contract metadata
- [ ] Support for Epic linking
- [ ] Subtasks created from contract's file changes (optional)
- [ ] Auto-create on `grabby approve` when `sync.autoCreate: true`

**API Mapping:**
```
Contract Field     → Jira Field
─────────────────────────────────
Title              → Summary
Objective          → Description (part 1)
Scope              → Description (bullet list)
Complexity Score   → Custom Field / Labels
Status             → Issue Status (mapped)
Done When          → Acceptance Criteria field
Files (creates)    → Subtasks (optional)
```

---

#### Story 3: Sync Contract Status to Jira
**ID:** GRAB-103
**Title:** As a user, I want contract status changes to sync to Jira automatically

**Acceptance Criteria:**
- [ ] Contract status changes trigger Jira transitions
- [ ] Status mapping configurable in `grabby.config.json`
- [ ] Manual sync via `grabby jira sync <contract>`
- [ ] Bulk sync via `grabby jira sync --all`
- [ ] Conflict detection with user prompt
- [ ] Dry-run mode: `grabby jira sync --dry-run`

**Status Mapping Example:**
```
Contract Status → Jira Status
───────────────────────────
draft           → To Do
approved        → Selected for Development
executing       → In Progress
completed       → Done
archived        → Closed
```

---

#### Story 4: Import Jira Issues as Contracts
**ID:** GRAB-104
**Title:** As a user, I want to import existing Jira issues as feature contracts

**Acceptance Criteria:**
- [ ] `grabby jira import PROJ-123` creates contract from Jira issue
- [ ] Bulk import via JQL: `grabby jira import --jql "project=PROJ AND type=Story"`
- [ ] Interactive field mapping during import
- [ ] Preserve Jira issue key in contract
- [ ] Skip already-imported issues (idempotent)

**Import Mapping:**
```
Jira Field           → Contract Field
─────────────────────────────────────
Summary              → Title
Description          → Objective + Scope (parsed)
Acceptance Criteria  → Done When
Story Points         → Complexity hint
Components           → Directories hint
```

---

#### Story 5: Bidirectional Sync
**ID:** GRAB-105
**Title:** As a user, I want changes in Jira to reflect in my contracts (bidirectional)

**Acceptance Criteria:**
- [ ] Webhook endpoint for Jira → Grabby updates
- [ ] `grabby jira watch` starts local webhook server
- [ ] Status changes in Jira update contract status
- [ ] Description edits in Jira update contract sections
- [ ] Conflict resolution strategy (Jira wins / Contract wins / Manual)
- [ ] Audit log of all sync operations

---

#### Story 6: Jira Dashboard & Reporting
**ID:** GRAB-106
**Title:** As a user, I want to see Jira integration status in Grabby metrics

**Acceptance Criteria:**
- [ ] `grabby jira status` shows sync health
- [ ] `grabby metrics` includes Jira sync stats
- [ ] Contracts linked to closed Jira issues highlighted
- [ ] Orphaned contracts (no Jira link) flagged
- [ ] Orphaned Jira issues (no contract) listed

---

#### Story 7: Sprint Integration
**ID:** GRAB-107
**Title:** As a user, I want to assign contracts to Jira sprints

**Acceptance Criteria:**
- [ ] `grabby jira sprint <contract> <sprint-name>` assigns to sprint
- [ ] View sprint backlog: `grabby jira sprint list`
- [ ] Sprint velocity based on complexity scores
- [ ] Auto-assign to active sprint on approve (optional)

---

#### Story 8: Comments & Activity Sync
**ID:** GRAB-108
**Title:** As a user, I want audit/validation comments synced to Jira

**Acceptance Criteria:**
- [ ] Validation results posted as Jira comments
- [ ] Audit results posted as Jira comments
- [ ] Plan/backlog links added to Jira
- [ ] Contract file link in Jira description
- [ ] Jira comments viewable via `grabby show <contract> --comments`

---

## User Stories: AWS Bedrock Expansion

### Epic: GRAB-200 - Multi-Model Bedrock Support

#### Story 9: Bedrock Authentication
**ID:** GRAB-201
**Title:** As a user, I want to authenticate with AWS Bedrock using multiple methods

**Acceptance Criteria:**
- [ ] Support AWS credential chain (env vars, profile, IAM role, EC2 metadata)
- [ ] Support explicit credentials in config
- [ ] Support AWS SSO/Identity Center
- [ ] Support cross-account role assumption
- [ ] `grabby ai test` validates Bedrock access

**Authentication Methods:**
```json
// Method 1: Environment variables (recommended for CI/CD)
{
  "ai": {
    "provider": "bedrock",
    "providers": {
      "bedrock": {
        "region": "us-east-1"
        // Uses AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
      }
    }
  }
}

// Method 2: Named profile
{
  "ai": {
    "provider": "bedrock",
    "providers": {
      "bedrock": {
        "region": "us-east-1",
        "profile": "my-aws-profile"
      }
    }
  }
}

// Method 3: Explicit credentials (use env var references!)
{
  "ai": {
    "provider": "bedrock",
    "providers": {
      "bedrock": {
        "region": "us-east-1",
        "accessKeyId": "${AWS_ACCESS_KEY_ID}",
        "secretAccessKey": "${AWS_SECRET_ACCESS_KEY}"
      }
    }
  }
}

// Method 4: Role assumption
{
  "ai": {
    "provider": "bedrock",
    "providers": {
      "bedrock": {
        "region": "us-east-1",
        "roleArn": "arn:aws:iam::123456789012:role/BedrockAccessRole",
        "roleSessionName": "grabby-session"
      }
    }
  }
}
```

---

#### Story 10: Multi-Model Support
**ID:** GRAB-202
**Title:** As a user, I want to use any Bedrock-supported model

**Acceptance Criteria:**
- [ ] Support all Claude models on Bedrock
- [ ] Support Llama 2/3 models
- [ ] Support Mistral models
- [ ] Support Amazon Titan models
- [ ] Support Cohere Command models
- [ ] Support AI21 Jurassic models
- [ ] Model selection per-command: `grabby task "x" --model llama`
- [ ] Model aliases configurable (fast/default/powerful)

**Supported Models:**
```json
{
  "bedrock": {
    "models": {
      // Anthropic Claude
      "claude-3-opus": "anthropic.claude-3-opus-20240229-v1:0",
      "claude-3-sonnet": "anthropic.claude-3-sonnet-20240229-v1:0",
      "claude-3-haiku": "anthropic.claude-3-haiku-20240307-v1:0",
      "claude-3-5-sonnet": "anthropic.claude-3-5-sonnet-20240620-v1:0",
      "claude-instant": "anthropic.claude-instant-v1",

      // Meta Llama
      "llama3-70b": "meta.llama3-70b-instruct-v1:0",
      "llama3-8b": "meta.llama3-8b-instruct-v1:0",
      "llama2-70b": "meta.llama2-70b-chat-v1",
      "llama2-13b": "meta.llama2-13b-chat-v1",

      // Mistral
      "mistral-large": "mistral.mistral-large-2402-v1:0",
      "mistral-small": "mistral.mistral-small-2402-v1:0",
      "mixtral-8x7b": "mistral.mixtral-8x7b-instruct-v0:1",

      // Amazon Titan
      "titan-premier": "amazon.titan-text-premier-v1:0",
      "titan-express": "amazon.titan-text-express-v1",
      "titan-lite": "amazon.titan-text-lite-v1",

      // Cohere
      "command-r-plus": "cohere.command-r-plus-v1:0",
      "command-r": "cohere.command-r-v1:0",

      // AI21
      "j2-ultra": "ai21.j2-ultra-v1",
      "j2-mid": "ai21.j2-mid-v1"
    }
  }
}
```

---

#### Story 11: Cross-Region Inference
**ID:** GRAB-203
**Title:** As a user, I want to use Bedrock cross-region inference for availability

**Acceptance Criteria:**
- [ ] Support inference profiles
- [ ] Automatic region fallback on throttling
- [ ] Region preference configuration
- [ ] Latency-based routing option

**Config Example:**
```json
{
  "bedrock": {
    "region": "us-east-1",
    "crossRegion": true,
    "inferenceProfile": "us.anthropic.claude-3-sonnet-20240229-v1:0",
    "fallbackRegions": ["us-west-2", "eu-west-1"]
  }
}
```

---

#### Story 12: Model-Specific Parameters
**ID:** GRAB-204
**Title:** As a user, I want to configure model-specific parameters

**Acceptance Criteria:**
- [ ] Per-model temperature settings
- [ ] Per-model token limits
- [ ] Per-model stop sequences
- [ ] Guardrails configuration
- [ ] Content filtering settings

**Config Example:**
```json
{
  "bedrock": {
    "modelConfig": {
      "anthropic.claude-3-sonnet-20240229-v1:0": {
        "maxTokens": 4096,
        "temperature": 0.7,
        "topP": 0.9,
        "stopSequences": ["Human:", "Assistant:"]
      },
      "meta.llama3-70b-instruct-v1:0": {
        "maxTokens": 2048,
        "temperature": 0.6,
        "topP": 0.9
      }
    },
    "guardrails": {
      "guardrailId": "gr-xxxxxxxx",
      "guardrailVersion": "1"
    }
  }
}
```

---

#### Story 13: Cost Tracking
**ID:** GRAB-205
**Title:** As a user, I want to track Bedrock API costs per contract

**Acceptance Criteria:**
- [ ] Token usage logged per request
- [ ] Cost estimation based on model pricing
- [ ] `grabby metrics --costs` shows spending summary
- [ ] Cost alerts configurable
- [ ] Per-contract cost attribution

---

## Implementation Priority

### Phase 1: Foundation (Sprint 1-2)
1. GRAB-201 - Bedrock Authentication
2. GRAB-202 - Multi-Model Support
3. Configuration system (`grabby.config.json`)

### Phase 2: Jira Core (Sprint 3-4)
4. GRAB-101 - Jira Configuration
5. GRAB-102 - Create Issues from Contracts
6. GRAB-103 - Status Sync

### Phase 3: Jira Advanced (Sprint 5-6)
7. GRAB-104 - Import from Jira
8. GRAB-105 - Bidirectional Sync
9. GRAB-108 - Comments Sync

### Phase 4: Polish (Sprint 7)
10. GRAB-106 - Dashboard & Reporting
11. GRAB-107 - Sprint Integration
12. GRAB-203 - Cross-Region Inference
13. GRAB-204 - Model Parameters
14. GRAB-205 - Cost Tracking

---

## API Reference

### Jira Commands

```bash
# Configuration
grabby jira setup              # Interactive Jira setup
grabby jira test               # Test Jira connection

# Issue Management
grabby jira create <contract>  # Create Jira issue from contract
grabby jira link <contract> <ISSUE-KEY>  # Link existing issue
grabby jira unlink <contract>  # Remove Jira link

# Sync Operations
grabby jira sync <contract>    # Sync single contract
grabby jira sync --all         # Sync all contracts
grabby jira sync --dry-run     # Preview sync changes
grabby jira pull <contract>    # Pull updates from Jira
grabby jira push <contract>    # Push updates to Jira

# Import
grabby jira import <ISSUE-KEY>           # Import single issue
grabby jira import --jql "project=X"     # Import via JQL
grabby jira import --sprint "Sprint 5"   # Import sprint backlog

# Queries
grabby jira status             # Show sync status
grabby jira list               # List linked issues
grabby jira orphans            # Show unlinked contracts/issues

# Sprint
grabby jira sprint assign <contract> <sprint>
grabby jira sprint list
grabby jira sprint velocity
```

### AI Provider Commands

```bash
# Configuration
grabby ai setup                # Interactive AI setup
grabby ai test                 # Test AI connection
grabby ai models               # List available models

# Provider switching
grabby ai use anthropic        # Switch to Anthropic
grabby ai use bedrock          # Switch to Bedrock
grabby ai use openai           # Switch to OpenAI

# Model selection
grabby task "x" --model fast           # Use fast model alias
grabby task "x" --model powerful       # Use powerful model alias
grabby task "x" --model llama3-70b     # Use specific model

# Cost tracking
grabby ai costs                # Show cost summary
grabby ai costs --contract FC-001      # Per-contract costs
grabby ai costs --month 2024-01        # Monthly breakdown
```

---

## Security Considerations

1. **Never commit credentials** - Use environment variables or secret managers
2. **API token rotation** - Support for rotating Jira/AI tokens without config changes
3. **Minimal permissions** - Document minimum required Jira/AWS permissions
4. **Audit logging** - Log all API calls for compliance
5. **Rate limiting** - Respect API rate limits, implement backoff

### Minimum Jira Permissions
```
- Browse Projects
- Create Issues
- Edit Issues
- Transition Issues
- Add Comments
- View Workflow
```

### Minimum AWS Bedrock Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    }
  ]
}
```

---

## Migration Guide

### From v2.x to v3.x (with config file)

1. Create `grabby.config.json`:
   ```bash
   grabby config init
   ```

2. Migrate environment variables:
   ```bash
   # Old
   export GRABBY_AI_KEY=sk-ant-...

   # New
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Update CI/CD pipelines to use new config format

4. Run validation:
   ```bash
   grabby config validate
   ```
