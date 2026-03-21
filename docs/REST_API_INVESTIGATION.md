# Grabby REST API Investigation
**Local-First Control Plane for Contracts, Rules, and Agent Execution**

**Date:** 2026-03-21
**Status:** Investigation / Design Proposal
**Version:** 1.0

---

## Executive Summary

This document investigates a **local-first REST API layer** for Grabby that transforms it from a CLI-only tool into a stable runtime with:

1. **API Control Plane** - RESTful endpoints for contract management, validation, and execution
2. **Rules Repository Integration** - Automated sync, version pinning, drift detection
3. **Context Reduction** - Smart caching and compression to minimize LLM token usage
4. **Deterministic Execution** - Structured input/output for consistent agent behavior
5. **Local Runtime** - Developer machine service with offline support
6. **Agent Orchestration** - Workflow execution and state management

**Core Philosophy**: The API is not just transport—it's a **control plane** that pre-loads contracts, caches rules, validates versions, and sends only minimal context to the LLM.

---

## 1. API Surface Design

### 1.1 Core Principles

**Local-First**
- Runs on `localhost` (default port: `3456`)
- No cloud dependencies for core functionality
- Offline-capable with cached rules/contracts
- Hot-reload on config changes

**Minimal & Focused**
- Small surface area (< 30 endpoints)
- RESTful conventions
- JSON request/response
- Streaming support for long-running operations

**Versioned**
- API version in URL: `/v1/`
- Backward compatibility guarantee
- Deprecation warnings

### 1.2 Proposed Endpoint Structure

```
/v1/
├── /health                      # Health check
├── /config                      # Runtime configuration
│
├── /contracts                   # Contract CRUD
│   ├── GET    /                # List contracts
│   ├── POST   /                # Create contract
│   ├── GET    /:id             # Get contract details
│   ├── PUT    /:id             # Update contract
│   ├── DELETE /:id             # Delete contract
│   ├── POST   /:id/validate    # Validate contract
│   ├── POST   /:id/plan        # Generate plan (Phase 1)
│   ├── POST   /:id/approve     # Approve for execution
│   ├── POST   /:id/execute     # Execute (Phase 2)
│   └── POST   /:id/audit       # Audit implementation
│
├── /rules                       # Rules repository management
│   ├── GET    /                # List active rulesets
│   ├── POST   /sync            # Sync with central repo
│   ├── GET    /status          # Check sync status & drift
│   ├── POST   /validate        # Validate local rulesets
│   ├── GET    /:category/:name # Get specific ruleset
│   └── POST   /pin             # Pin versions
│
├── /agents                      # Agent management
│   ├── GET    /                # List available agents
│   ├── POST   /:name/run       # Run agent workflow
│   ├── GET    /:name/status    # Get agent status
│   ├── POST   /:name/cancel    # Cancel running workflow
│   └── POST   /:name/resume    # Resume paused workflow
│
├── /context                     # Context resolution
│   ├── GET    /refs            # List available context refs
│   ├── POST   /resolve         # Resolve context with budget
│   ├── GET    /cache           # Get cached context
│   └── DELETE /cache           # Clear context cache
│
├── /workflows                   # Workflow orchestration
│   ├── GET    /                # List workflows
│   ├── POST   /:id/start       # Start workflow
│   ├── GET    /:id/status      # Get workflow status
│   ├── POST   /:id/step        # Execute single step
│   └── POST   /:id/response    # Respond to prompt
│
├── /llm                         # LLM integration
│   ├── POST   /complete        # Direct LLM invocation
│   ├── GET    /providers       # List available providers
│   └── POST   /test-connection # Test provider
│
└── /analytics                   # Metrics & insights
    ├── GET    /metrics         # Contract metrics
    ├── GET    /complexity/:id  # Complexity analysis
    └── GET    /workspace       # Workspace overview
```

### 1.3 Example Request/Response Patterns

#### POST `/v1/contracts/:id/plan`

**Request:**
```json
{
  "contractId": "FC-1234567890",
  "options": {
    "tokenBudget": 1200,
    "explicitContextOnly": false,
    "dryRun": false
  }
}
```

**Response (202 Accepted):**
```json
{
  "status": "planning",
  "jobId": "plan-abc123",
  "estimatedTime": 45,
  "statusUrl": "/v1/jobs/plan-abc123"
}
```

**Streaming Response (SSE):**
```
event: progress
data: {"stage": "resolving_context", "progress": 0.2}

event: progress
data: {"stage": "invoking_llm", "progress": 0.5}

event: complete
data: {"planPath": ".artifacts/FC-1234567890.plan.yaml", "tokenUsage": 987}
```

#### POST `/v1/rules/sync`

**Request:**
```json
{
  "force": false,
  "validateAfter": true,
  "updateLock": true
}
```

**Response:**
```json
{
  "status": "synced",
  "version": "1.2.0",
  "commit": "a1b2c3d",
  "syncedAt": "2026-03-21T00:00:00Z",
  "changes": {
    "added": ["testing/e2e"],
    "updated": ["languages/typescript"],
    "removed": []
  },
  "drift": {
    "detected": false,
    "breaking": false,
    "changes": []
  }
}
```

#### POST `/v1/agents/contract-architect/run`

**Request:**
```json
{
  "workflow": "create-contract",
  "input": {
    "featureName": "User authentication",
    "objective": "Add JWT-based authentication to the API",
    "scope": ["Login endpoint", "Token validation middleware"]
  },
  "options": {
    "interactive": false,
    "autoApprove": false
  }
}
```

**Response:**
```json
{
  "status": "running",
  "workflowId": "wf-xyz789",
  "agentId": "contract-architect",
  "currentStep": "requirements-gathering",
  "progress": 0.3,
  "output": null
}
```

---

## 2. Rules Repository Integration

### 2.1 Repository Management

**Read-Only Access**
- Central rules repo is **never modified** by Grabby runtime
- Clone on first sync, pull on subsequent syncs
- Git operations run in isolated subprocess
- Cache located at `.grabby/rulesets/cache/central-repo/`

**Version Pinning Strategies**

```json
{
  "rulesets": {
    "source": {
      "repo": "https://github.com/Raccoon-King/grabby-contracts.git",
      "branch": "master",           // Branch pinning
      "commit": "a1b2c3d4",         // Commit SHA pinning (optional)
      "version": "1.2.0"            // Manifest version
    },
    "pinning": {
      "strategy": "branch" | "commit" | "tag" | "manifest-version",
      "allowAutoUpdate": false,     // Auto-update on sync
      "updatePolicy": "manual" | "patch" | "minor" | "major"
    }
  }
}
```

**Pinning Strategies**:
1. **Branch** (default) - Track latest on branch (`master`)
2. **Commit** - Lock to specific commit SHA
3. **Tag** - Use git tags for releases (`v1.2.0`)
4. **Manifest Version** - Pin to manifest version field

### 2.2 Sync Operations

**API Endpoint**: `POST /v1/rules/sync`

**Sync Flow**:
```
1. Check if cache exists
   └─> No: Clone repo
   └─> Yes: Fetch latest

2. Checkout pinned version
   └─> Branch: git checkout {branch} && git pull
   └─> Commit: git checkout {commit}
   └─> Tag: git checkout tags/{tag}

3. Parse manifest.yaml
   └─> Validate structure
   └─> Extract rulesets

4. Detect drift
   └─> Compare lock file vs manifest
   └─> Check version changes
   └─> Compute content hashes

5. Update lock file
   └─> Record sync timestamp
   └─> Save active ruleset versions
   └─> Store content checksums

6. Validate rulesets
   └─> Check for missing files
   └─> Validate markdown structure
   └─> Verify dependencies
```

**Lock File Structure** (`.grabby/rulesets/sync.lock.yaml`):
```yaml
version: 1
lastSync: "2026-03-21T00:00:00Z"

source:
  repo: "https://github.com/Raccoon-King/grabby-contracts.git"
  branch: "master"
  commit: "a1b2c3d4e5f6"
  version: "1.2.0"

active:
  - category: "languages/typescript"
    version: "1.0.0"
    hash: "sha256:abc123..."
    file: "languages/typescript.md"

  - category: "policies/security"
    version: "1.0.0"
    hash: "sha256:def456..."
    file: "policies/security.md"

checksums:
  manifest: "sha256:manifest-hash..."
```

### 2.3 Drift Detection

**Drift Types**:
1. **Version Drift** - Manifest version changed
2. **Content Drift** - File hash mismatch (manual edits)
3. **Structural Drift** - Rulesets added/removed
4. **Breaking Drift** - Major version changes

**Detection Algorithm**:
```javascript
function detectDrift(lock, manifest) {
  const drift = {
    detected: false,
    breaking: false,
    changes: []
  };

  // Compare versions
  for (const activeRuleset of lock.active) {
    const manifestRuleset = findInManifest(manifest, activeRuleset.category);

    if (!manifestRuleset) {
      drift.changes.push({
        type: 'removed',
        category: activeRuleset.category,
        breaking: true
      });
      continue;
    }

    if (activeRuleset.version !== manifestRuleset.version) {
      const breaking = isBreakingChange(activeRuleset.version, manifestRuleset.version);
      drift.changes.push({
        type: 'version',
        category: activeRuleset.category,
        from: activeRuleset.version,
        to: manifestRuleset.version,
        breaking
      });
    }

    // Check content hash
    const currentHash = computeHash(manifestRuleset.file);
    if (activeRuleset.hash !== currentHash) {
      drift.changes.push({
        type: 'content',
        category: activeRuleset.category,
        breaking: false
      });
    }
  }

  drift.detected = drift.changes.length > 0;
  drift.breaking = drift.changes.some(c => c.breaking);

  return drift;
}
```

**Sync Mode Handling**:

| Mode | Behavior on Drift | API Response |
|------|-------------------|--------------|
| `strict` | Block execution | 400 error with drift details |
| `warn` | Log warning, continue | 200 with `warnings` array |
| `auto` | Auto-sync if non-breaking | 200 with sync confirmation |
| `manual` | Notify only | 200 with drift report |

### 2.4 Pre-Execution Sync Checks

**Before Contract Commands** (`validate`, `plan`, `execute`):

```javascript
// Middleware for contract operations
app.use('/v1/contracts/:id/:action(validate|plan|execute)', async (req, res, next) => {
  const syncStatus = await checkRulesetSync();

  if (syncStatus.drift.detected) {
    const mode = config.rulesets.sync.mode;

    if (mode === 'strict' && syncStatus.drift.breaking) {
      return res.status(400).json({
        error: 'Ruleset drift detected in strict mode',
        drift: syncStatus.drift,
        action: 'Run POST /v1/rules/sync to update'
      });
    }

    if (mode === 'warn') {
      req.rulesetWarnings = syncStatus.drift.changes;
    }
  }

  next();
});
```

---

## 3. Context Reduction

### 3.1 Problem Statement

**Current State**:
- Contract markdown files: 500-2000 tokens
- Context refs (ARCH, RULESET, ENV): 1000-5000 tokens each
- Full manifest: 500+ tokens
- Plan artifacts: 300-800 tokens
- **Total**: Can exceed 10,000 tokens per operation

**Goal**:
- Reduce context sent to LLM by 60-80%
- Pre-load and cache reusable context
- Send only minimal, relevant snippets
- Maintain accuracy and completeness

### 3.2 Context Caching Strategy

**Multi-Level Cache**:

```
Level 1: In-Memory Cache (Hot)
  ├─ Parsed contracts (last 10 accessed)
  ├─ Resolved context refs (ARCH, RULESET, ENV)
  └─ Active rulesets (markdown parsed)

Level 2: Disk Cache (Warm)
  ├─ .grabby/cache/context/
  │   ├─ {ref-hash}.json      # Resolved context
  │   └─ {ref-hash}.meta.json # Metadata + tokens
  └─ .grabby/cache/rulesets/
      └─ {ruleset-hash}.parsed.json

Level 3: Source (Cold)
  ├─ docs/ directory
  ├─ contracts/ directory
  └─ .grabby/rulesets/cache/central-repo/
```

**Cache Invalidation**:
- Context refs: On file modification (watch mode)
- Rulesets: On sync operation
- Contracts: On save/update
- TTL: 1 hour for in-memory, 24 hours for disk

### 3.3 Context Resolution API

**Endpoint**: `POST /v1/context/resolve`

**Request**:
```json
{
  "refs": ["ARCH:stack@v1", "RULESET:typescript@v1"],
  "tokenBudget": 1200,
  "strategy": "summarize" | "extract-sections" | "full",
  "contract": "FC-1234567890",
  "phase": "plan" | "execute"
}
```

**Response**:
```json
{
  "resolved": [
    {
      "ref": "ARCH:stack@v1",
      "strategy": "extract-sections",
      "sections": [
        {
          "title": "Backend Stack",
          "content": "Node.js 18, Express 4.x, PostgreSQL 14...",
          "tokens": 87
        },
        {
          "title": "Frontend Stack",
          "content": "React 18, TypeScript 5.x, Vite...",
          "tokens": 72
        }
      ],
      "totalTokens": 159,
      "cacheHit": true
    },
    {
      "ref": "RULESET:typescript@v1",
      "strategy": "summarize",
      "summary": "- Strict mode required\n- No any types\n- Explicit return types...",
      "totalTokens": 134,
      "cacheHit": false
    }
  ],
  "totalTokens": 293,
  "budgetUsed": 0.24,
  "budgetRemaining": 907
}
```

### 3.4 Context Reduction Strategies

**1. Smart Sectioning**

Extract only relevant sections from large documents:

```javascript
function extractRelevantSections(doc, keywords, maxTokens) {
  const sections = parseMarkdownSections(doc);
  const scored = sections.map(s => ({
    section: s,
    score: calculateRelevance(s, keywords),
    tokens: estimateTokens(s.content)
  }));

  // Sort by relevance, take top sections within budget
  const selected = [];
  let tokenCount = 0;

  for (const item of scored.sort((a, b) => b.score - a.score)) {
    if (tokenCount + item.tokens <= maxTokens) {
      selected.push(item.section);
      tokenCount += item.tokens;
    }
  }

  return { sections: selected, tokens: tokenCount };
}
```

**2. Compression & Summarization**

For large rulesets, generate compressed summaries:

```javascript
function compressRuleset(ruleset) {
  return {
    name: ruleset.name,
    version: ruleset.version,
    keyRules: ruleset.rules
      .filter(r => r.priority === 'High' || r.priority === 'Critical')
      .map(r => `- ${r.title}: ${r.rationale}`)
      .join('\n'),
    fullPath: `.grabby/rulesets/cache/${ruleset.category}/${ruleset.name}.md`
  };
}
```

**3. Diff-Based Context**

For updates, send only changes:

```javascript
function buildDiffContext(currentContract, previousPlan) {
  const diff = {
    scopeChanges: diffArrays(currentContract.scope, previousPlan.scope),
    fileChanges: diffFiles(currentContract.files, previousPlan.files),
    newRules: currentContract.rules.filter(r => !previousPlan.rules.includes(r))
  };

  return {
    type: 'diff',
    baseline: previousPlan.id,
    changes: diff,
    tokens: estimateTokens(JSON.stringify(diff))
  };
}
```

**4. Reference Pointers**

Instead of sending full content, use pointers:

```json
{
  "context": [
    {
      "type": "reference",
      "ref": "ARCH:stack@v1",
      "sections": ["Backend Stack", "Database"],
      "instruction": "You have access to the full architecture doc at {ref}"
    }
  ]
}
```

### 3.5 Pre-Computation Pipeline

**Background Jobs**:
```
┌─────────────────────────────────────────┐
│ On Sync:                                │
│  1. Parse all rulesets                  │
│  2. Extract key rules (High/Critical)   │
│  3. Generate summaries                  │
│  4. Compute token estimates             │
│  5. Cache parsed structures             │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ On Contract Save:                       │
│  1. Parse contract sections             │
│  2. Extract keywords                    │
│  3. Identify relevant context refs      │
│  4. Pre-resolve common refs             │
│  5. Cache for 1 hour                    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ On Startup:                             │
│  1. Load active rulesets                │
│  2. Parse manifest                      │
│  3. Build ruleset index                 │
│  4. Warm cache with common refs         │
└─────────────────────────────────────────┘
```

---

## 4. Deterministic Execution

### 4.1 Structured Input/Output

**Problem**: Raw prompts are unpredictable and hard to test.

**Solution**: Define structured schemas for agent input/output.

**Agent Input Schema**:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "agentId": { "type": "string", "enum": ["contract-architect", "plan-strategist", ...] },
    "workflow": { "type": "string" },
    "input": {
      "type": "object",
      "properties": {
        "featureName": { "type": "string", "maxLength": 100 },
        "objective": { "type": "string", "maxLength": 500 },
        "scope": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["featureName", "objective"]
    },
    "context": {
      "type": "object",
      "properties": {
        "refs": { "type": "array", "items": { "type": "string" } },
        "tokenBudget": { "type": "integer", "minimum": 500, "maximum": 5000 },
        "rulesets": { "type": "array", "items": { "type": "string" } }
      }
    },
    "options": {
      "type": "object",
      "properties": {
        "interactive": { "type": "boolean" },
        "autoApprove": { "type": "boolean" },
        "dryRun": { "type": "boolean" }
      }
    }
  },
  "required": ["agentId", "workflow", "input"]
}
```

**Agent Output Schema**:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["success", "partial", "failed", "needs_input"]
    },
    "workflowId": { "type": "string" },
    "output": {
      "type": "object",
      "properties": {
        "contractId": { "type": "string" },
        "contractPath": { "type": "string" },
        "artifactPaths": { "type": "array", "items": { "type": "string" } },
        "validation": { "type": "object" }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "tokensUsed": { "type": "integer" },
        "duration": { "type": "integer" },
        "llmProvider": { "type": "string" },
        "llmModel": { "type": "string" }
      }
    },
    "nextAction": {
      "type": "object",
      "properties": {
        "command": { "type": "string" },
        "agent": { "type": "string" },
        "description": { "type": "string" }
      }
    }
  },
  "required": ["status", "output", "metadata"]
}
```

### 4.2 Prompt Templates

**Structured Prompt Builder**:
```javascript
class PromptBuilder {
  constructor(template) {
    this.template = template;
    this.sections = [];
  }

  addSection(name, content, options = {}) {
    this.sections.push({
      name,
      content,
      tokens: estimateTokens(content),
      priority: options.priority || 'normal',
      required: options.required !== false
    });
    return this;
  }

  build(tokenBudget) {
    // Sort by priority: required > high > normal > low
    const sorted = this.sections.sort((a, b) => {
      if (a.required !== b.required) return b.required - a.required;
      return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    });

    // Fit within budget
    const included = [];
    let totalTokens = 0;

    for (const section of sorted) {
      if (totalTokens + section.tokens <= tokenBudget) {
        included.push(section);
        totalTokens += section.tokens;
      } else if (section.required) {
        throw new Error(`Required section "${section.name}" exceeds token budget`);
      }
    }

    // Render template
    return this.template.render({
      sections: included.map(s => s.content).join('\n\n'),
      metadata: {
        totalTokens,
        sectionsIncluded: included.length,
        sectionsSkipped: this.sections.length - included.length
      }
    });
  }
}
```

**Example Usage**:
```javascript
const prompt = new PromptBuilder('contract-creation')
  .addSection('objective', contractInput.objective, { required: true, priority: 'high' })
  .addSection('scope', contractInput.scope.join('\n'), { required: true, priority: 'high' })
  .addSection('architecture', archContext, { required: false, priority: 'normal' })
  .addSection('rulesets', rulesetSummary, { required: false, priority: 'low' })
  .build(1200);
```

### 4.3 Deterministic Tool Use

**Tool Call Schema**:
```json
{
  "tools": [
    {
      "name": "create_contract",
      "description": "Create a new feature contract",
      "parameters": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "pattern": "^FC-\\d+$" },
          "title": { "type": "string", "minLength": 5, "maxLength": 100 },
          "objective": { "type": "string", "minLength": 10, "maxLength": 500 },
          "scope": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
          "files": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "action": { "enum": ["create", "modify"] },
                "path": { "type": "string" },
                "reason": { "type": "string" }
              },
              "required": ["action", "path", "reason"]
            }
          }
        },
        "required": ["id", "title", "objective", "scope", "files"]
      }
    }
  ]
}
```

### 4.4 Validation Pipeline

**Output Validation**:
```javascript
function validateAgentOutput(output, schema) {
  const validator = new JSONSchemaValidator(schema);
  const result = validator.validate(output);

  if (!result.valid) {
    return {
      valid: false,
      errors: result.errors.map(e => ({
        path: e.dataPath,
        message: e.message,
        value: e.data
      }))
    };
  }

  // Additional business logic validation
  if (output.status === 'success') {
    if (!output.output.contractPath) {
      return {
        valid: false,
        errors: [{ path: '/output/contractPath', message: 'Contract path required on success' }]
      };
    }

    // Verify file exists
    if (!fs.existsSync(output.output.contractPath)) {
      return {
        valid: false,
        errors: [{ path: '/output/contractPath', message: 'Contract file not found' }]
      };
    }
  }

  return { valid: true };
}
```

---

## 5. Local Runtime Concerns

### 5.1 Service Architecture

**Process Model**:
```
grabby-api (Main Process)
  ├─ HTTP Server (Express)
  ├─ Cache Manager (In-Memory + Disk)
  ├─ Git Worker (Subprocess for repo ops)
  ├─ LLM Client Pool (Concurrent requests)
  └─ File Watcher (Contract/rules monitoring)
```

**Port & Service Model**:
```json
{
  "server": {
    "host": "127.0.0.1",        // Localhost only (security)
    "port": 3456,               // Default port
    "portRange": [3456, 3466],  // Auto-increment if in use
    "backlog": 511,             // Connection queue size
    "keepAliveTimeout": 65000   // 65 seconds
  }
}
```

**Startup Sequence**:
```
1. Load Configuration
   └─> grabby.config.json
   └─> Environment variables
   └─> CLI overrides

2. Initialize Services
   └─> Cache Manager (in-memory + disk)
   └─> Git Worker (verify git installation)
   └─> File Watcher (watch contracts/ and .grabby/)

3. Pre-Load Data
   └─> Parse manifest
   └─> Load active rulesets
   └─> Warm cache with common context refs

4. Start HTTP Server
   └─> Bind to localhost:3456
   └─> Register routes
   └─> Install middleware (CORS, rate limit, logging)

5. Health Check
   └─> Test LLM connectivity
   └─> Verify file system access
   └─> Check git availability

6. Ready
   └─> Log startup message
   └─> Open browser (optional)
```

**Shutdown Sequence**:
```
1. Graceful Shutdown Signal (SIGTERM/SIGINT)

2. Stop Accepting New Requests
   └─> Close HTTP server
   └─> Drain existing connections (30s timeout)

3. Complete In-Flight Operations
   └─> Finish active LLM calls
   └─> Complete file writes
   └─> Flush caches to disk

4. Cleanup
   └─> Close file watchers
   └─> Kill git worker subprocess
   └─> Save state

5. Exit
   └─> Log shutdown complete
   └─> Process.exit(0)
```

### 5.2 Authentication

**Localhost Security Model**:
- **Default**: No auth required (localhost-only binding)
- **Optional**: API key for multi-user setups

**API Key Authentication** (if enabled):
```http
Authorization: Bearer grabby-api-key-{random-64-chars}
```

**Key Management**:
```json
{
  "auth": {
    "enabled": false,
    "keys": [
      {
        "name": "default",
        "key": "grabby-api-key-...",
        "createdAt": "2026-03-21T00:00:00Z",
        "expiresAt": null,
        "permissions": ["read", "write"]
      }
    ]
  }
}
```

**CORS Policy**:
```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',      // React dev server
    'http://localhost:5173',      // Vite
    'vscode-file://',             // VS Code extension
    'chrome-extension://*'        // Browser extension
  ],
  credentials: true
}));
```

### 5.3 Cross-Platform Support

**OS-Specific Concerns**:

| Concern | Windows | macOS | Linux |
|---------|---------|-------|-------|
| **Paths** | Normalize with `path.normalize()` | POSIX paths | POSIX paths |
| **Git** | Check `where git` | Check `which git` | Check `which git` |
| **File Watching** | `chokidar` (works on all) | `chokidar` | `chokidar` |
| **Spawning** | `spawn('cmd', ['/c', cmd])` | `spawn('sh', ['-c', cmd])` | `spawn('sh', ['-c', cmd])` |
| **Config Path** | `%APPDATA%\grabby` | `~/.config/grabby` | `~/.config/grabby` |
| **Temp Dir** | `%TEMP%` | `/tmp` | `/tmp` |

**Git Detection**:
```javascript
async function detectGit() {
  const command = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = await execAsync(`${command} git`);
    return { available: true, path: result.trim() };
  } catch {
    return { available: false, path: null };
  }
}
```

**Path Normalization**:
```javascript
function normalizePath(p) {
  // Convert backslashes to forward slashes
  const normalized = p.replace(/\\/g, '/');

  // Handle Windows drive letters
  if (process.platform === 'win32') {
    return normalized.replace(/^([A-Z]):/, (match, drive) => `/${drive.toLowerCase()}`);
  }

  return normalized;
}
```

### 5.4 Offline/Failure Handling

**Offline Mode**:
```javascript
class OfflineManager {
  constructor() {
    this.online = true;
    this.cachedRulesets = null;
    this.lastSync = null;
  }

  async checkConnectivity() {
    try {
      await fetch('https://github.com', { timeout: 5000 });
      this.online = true;
    } catch {
      this.online = false;
    }
    return this.online;
  }

  async handleOffline(operation) {
    if (operation === 'rules-sync') {
      // Use cached rulesets
      if (this.cachedRulesets) {
        return {
          status: 'offline',
          message: 'Using cached rulesets (last synced: {lastSync})',
          data: this.cachedRulesets
        };
      } else {
        throw new Error('No cached rulesets available. Please sync while online.');
      }
    }

    if (operation === 'llm-call') {
      throw new Error('LLM calls require internet connection. Please connect and retry.');
    }

    // Other operations can work offline
    return null;
  }
}
```

**Failure Recovery**:
```javascript
// Circuit Breaker for LLM calls
class LLMCircuitBreaker {
  constructor() {
    this.failures = 0;
    this.state = 'closed'; // closed | open | half-open
    this.threshold = 5;
    this.timeout = 60000; // 1 minute
  }

  async call(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open. LLM service unavailable.');
      }
    }

    try {
      const result = await fn();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
      }

      throw error;
    }
  }
}
```

**Graceful Degradation**:
```javascript
// Fallback strategies
const FALLBACK_STRATEGIES = {
  'llm-unavailable': {
    action: 'use-templates',
    message: 'LLM unavailable. Using contract templates instead.'
  },
  'rules-sync-failed': {
    action: 'use-cache',
    message: 'Sync failed. Using cached rulesets from last successful sync.'
  },
  'context-resolution-timeout': {
    action: 'use-minimal-context',
    message: 'Context resolution timed out. Using minimal context.'
  }
};
```

### 5.5 Logging & Monitoring

**Structured Logging**:
```javascript
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: '.grabby/logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: '.grabby/logs/combined.log'
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    })
  ]
});

// Usage
logger.info('Rules sync completed', {
  version: '1.2.0',
  duration: 3450,
  rulesets: 19
});
```

**Health Check Endpoint**:
```http
GET /v1/health

{
  "status": "healthy",
  "version": "3.7.0",
  "uptime": 3600,
  "services": {
    "http": { "status": "up", "port": 3456 },
    "git": { "status": "up", "version": "2.40.0" },
    "llm": { "status": "up", "provider": "anthropic", "latency": 245 },
    "cache": { "status": "up", "size": 15728640, "hitRate": 0.87 },
    "fileWatcher": { "status": "up", "watching": 237 }
  },
  "rulesets": {
    "synced": true,
    "version": "1.2.0",
    "lastSync": "2026-03-21T00:00:00Z",
    "drift": false
  }
}
```

---

## 6. Agent Orchestration

### 6.1 Runtime vs. Router Decision

**Option A: Workflow Router** (Lightweight)
- API routes requests to existing CLI handlers
- Minimal state management
- Relies on file-based artifacts
- No in-memory agent state

**Option B: Agent Runtime** (Full-Featured)
- API manages agent lifecycle and state
- In-memory workflow execution
- Streaming progress updates
- Resumable workflows

**Recommendation: Hybrid Approach**

Start with **Workflow Router** for simplicity, add **Agent Runtime** features incrementally:

1. **Phase 1**: Router
   - API wraps existing `commands.cjs` handlers
   - File-based state (plan.yaml, exec.yaml)
   - Synchronous operation

2. **Phase 2**: Async Execution
   - Background jobs for long-running operations
   - Job status tracking
   - Webhook notifications

3. **Phase 3**: Agent Runtime
   - In-memory agent state
   - Streaming progress (SSE)
   - Workflow pause/resume

### 6.2 Workflow Execution Model

**Workflow Definition** (YAML):
```yaml
name: create-contract
agent: contract-architect
version: "1.0"

steps:
  - id: requirements
    type: prompt-collection
    prompts:
      - id: feature_name
        question: "Feature name?"
        type: text
        required: true
      - id: objective
        question: "Objective (1-2 sentences)?"
        type: textarea
        required: true

  - id: context-resolution
    type: context-resolve
    refs: ["ARCH:stack@v1"]
    tokenBudget: 500

  - id: llm-generation
    type: llm-call
    template: contract-creation
    input:
      featureName: "{{steps.requirements.feature_name}}"
      objective: "{{steps.requirements.objective}}"
      context: "{{steps.context-resolution.resolved}}"

  - id: validation
    type: validate
    contract: "{{steps.llm-generation.output.contractPath}}"

  - id: save
    type: save-artifact
    path: "contracts/{{steps.requirements.feature_name | slugify}}.fc.md"
    content: "{{steps.llm-generation.output.contract}}"

output:
  contractId: "{{steps.save.contractId}}"
  contractPath: "{{steps.save.path}}"
  validation: "{{steps.validation}}"
```

**Workflow Execution Engine**:
```javascript
class WorkflowEngine {
  async execute(workflowDef, input, options = {}) {
    const state = {
      workflowId: generateId(),
      status: 'running',
      currentStep: 0,
      steps: {},
      errors: []
    };

    for (const [index, step] of workflowDef.steps.entries()) {
      state.currentStep = index;

      try {
        const stepInput = this.resolveVariables(step.input, state.steps);
        const result = await this.executeStep(step, stepInput);

        state.steps[step.id] = {
          status: 'completed',
          output: result,
          duration: result.duration
        };

        // Emit progress event
        this.emit('step-complete', {
          workflowId: state.workflowId,
          step: step.id,
          progress: (index + 1) / workflowDef.steps.length
        });

      } catch (error) {
        state.errors.push({
          step: step.id,
          error: error.message,
          timestamp: new Date()
        });

        if (step.required !== false) {
          state.status = 'failed';
          break;
        }
      }
    }

    if (state.errors.length === 0) {
      state.status = 'success';
    }

    return this.buildOutput(workflowDef.output, state.steps);
  }

  async executeStep(step, input) {
    const executor = STEP_EXECUTORS[step.type];
    if (!executor) {
      throw new Error(`Unknown step type: ${step.type}`);
    }

    return executor(step, input);
  }

  resolveVariables(template, context) {
    // Replace {{variable}} syntax with values from context
    return JSON.parse(JSON.stringify(template).replace(
      /\{\{([^}]+)\}\}/g,
      (match, path) => getNestedValue(context, path)
    ));
  }
}
```

### 6.3 Agent State Management

**Agent Instance State**:
```javascript
class AgentInstance {
  constructor(agentId, workflowId) {
    this.agentId = agentId;
    this.workflowId = workflowId;
    this.status = 'initializing';
    this.currentStep = null;
    this.context = {};
    this.history = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  async step(stepDef, input) {
    this.currentStep = stepDef.id;
    this.status = 'running';
    this.updatedAt = new Date();

    const result = await this.executeStep(stepDef, input);

    this.history.push({
      step: stepDef.id,
      input,
      output: result,
      timestamp: new Date()
    });

    this.context[stepDef.id] = result;
    return result;
  }

  pause() {
    this.status = 'paused';
    this.updatedAt = new Date();
  }

  resume() {
    this.status = 'running';
    this.updatedAt = new Date();
  }

  complete(output) {
    this.status = 'completed';
    this.output = output;
    this.completedAt = new Date();
  }

  fail(error) {
    this.status = 'failed';
    this.error = error;
    this.failedAt = new Date();
  }

  serialize() {
    return {
      agentId: this.agentId,
      workflowId: this.workflowId,
      status: this.status,
      currentStep: this.currentStep,
      context: this.context,
      history: this.history,
      output: this.output,
      error: this.error,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt
    };
  }

  static deserialize(data) {
    const instance = new AgentInstance(data.agentId, data.workflowId);
    Object.assign(instance, data);
    return instance;
  }
}
```

**State Persistence**:
```javascript
// Save agent state to disk for resume capability
class StatePersistence {
  constructor(stateDir = '.grabby/state') {
    this.stateDir = stateDir;
  }

  async saveState(agent) {
    const statePath = path.join(this.stateDir, `${agent.workflowId}.json`);
    await fs.promises.writeFile(
      statePath,
      JSON.stringify(agent.serialize(), null, 2),
      'utf8'
    );
  }

  async loadState(workflowId) {
    const statePath = path.join(this.stateDir, `${workflowId}.json`);
    const data = JSON.parse(await fs.promises.readFile(statePath, 'utf8'));
    return AgentInstance.deserialize(data);
  }

  async deleteState(workflowId) {
    const statePath = path.join(this.stateDir, `${workflowId}.json`);
    await fs.promises.unlink(statePath);
  }
}
```

### 6.4 Streaming Progress (SSE)

**Server-Sent Events for Real-Time Updates**:

```javascript
// Endpoint: GET /v1/workflows/:id/stream
app.get('/v1/workflows/:id/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const workflowId = req.params.id;

  // Send initial state
  const agent = agentRegistry.get(workflowId);
  res.write(`data: ${JSON.stringify({ type: 'init', state: agent.serialize() })}\n\n`);

  // Listen for updates
  const onUpdate = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  agentRegistry.on(`update:${workflowId}`, onUpdate);

  // Cleanup on client disconnect
  req.on('close', () => {
    agentRegistry.off(`update:${workflowId}`, onUpdate);
  });
});
```

**Client Usage**:
```javascript
const eventSource = new EventSource('/v1/workflows/wf-xyz789/stream');

eventSource.addEventListener('message', (e) => {
  const event = JSON.parse(e.data);

  switch (event.type) {
    case 'init':
      console.log('Workflow started:', event.state);
      break;
    case 'step-start':
      console.log('Step started:', event.step);
      break;
    case 'step-complete':
      console.log('Step completed:', event.step, event.output);
      updateProgressBar(event.progress);
      break;
    case 'complete':
      console.log('Workflow completed:', event.output);
      eventSource.close();
      break;
    case 'error':
      console.error('Workflow error:', event.error);
      eventSource.close();
      break;
  }
});
```

---

## 7. Implementation Roadmap

### 7.1 Phase 1: Foundation (2 weeks)

**Goals**:
- Basic REST API server
- Contract CRUD endpoints
- Rules sync integration
- Health checks

**Deliverables**:
- `lib/api-server-v2.cjs` - New API implementation
- `POST /v1/contracts`, `GET /v1/contracts/:id`
- `POST /v1/rules/sync`, `GET /v1/rules/status`
- `GET /v1/health`

### 7.2 Phase 2: Context Optimization (2 weeks)

**Goals**:
- Context caching system
- Smart context resolution
- Token budget management

**Deliverables**:
- `lib/context-cache.cjs` - Multi-level cache
- `POST /v1/context/resolve`
- Pre-computation pipeline

### 7.3 Phase 3: Agent Runtime (3 weeks)

**Goals**:
- Workflow execution engine
- Agent state management
- Streaming progress (SSE)

**Deliverables**:
- `lib/workflow-engine.cjs`
- `lib/agent-runtime.cjs`
- `POST /v1/agents/:name/run`
- `GET /v1/workflows/:id/stream`

### 7.4 Phase 4: Polish & Stability (2 weeks)

**Goals**:
- Cross-platform testing
- Offline mode
- Error handling & recovery
- Documentation

**Deliverables**:
- Windows/Mac/Linux compatibility
- Offline fallback strategies
- API documentation (OpenAPI spec)
- Integration tests

---

## 8. Risks & Mitigations

### 8.1 Performance Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Large context files** | High token usage | Implement sectioning & compression |
| **Slow git operations** | Sync delays | Background jobs, caching |
| **Memory leaks** | Runtime instability | Bounded caches, monitoring |
| **Concurrent LLM calls** | Rate limits | Connection pooling, queue |

### 8.2 Compatibility Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Git not installed** | Sync failure | Fallback to cached rules |
| **Port conflicts** | Startup failure | Auto-increment port range |
| **Windows path issues** | File operations fail | Path normalization utils |
| **Firewall blocking** | API unreachable | Localhost-only (no firewall) |

### 8.3 Data Integrity Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Concurrent edits** | State corruption | File locking, atomic writes |
| **Cache invalidation** | Stale data | Hash-based validation |
| **Incomplete workflows** | Orphaned state | Cleanup on startup |
| **Version conflicts** | Execution errors | Strict version pinning |

---

## 9. Success Metrics

### 9.1 Performance Targets

- **API Latency**: < 100ms for simple operations (GET, POST)
- **LLM Calls**: < 5s end-to-end (including context resolution)
- **Sync Operations**: < 10s for full sync
- **Cache Hit Rate**: > 80% for context refs
- **Token Reduction**: 60-80% vs. current implementation

### 9.2 Reliability Targets

- **Uptime**: > 99.9% during user sessions
- **Error Rate**: < 0.1% for API calls
- **Offline Capability**: 100% for cached operations
- **Recovery Time**: < 5s from transient failures

---

## 10. Conclusion

This investigation demonstrates that a **local-first REST API** can transform Grabby into a stable runtime with:

1. **Efficient Contract Management** - CRUD operations, validation, versioning
2. **Intelligent Rules Integration** - Auto-sync, drift detection, version pinning
3. **Optimized Context Handling** - 60-80% token reduction through caching/compression
4. **Deterministic Agent Execution** - Structured I/O, validation, reproducibility
5. **Robust Local Runtime** - Cross-platform, offline-capable, production-grade
6. **Flexible Orchestration** - Workflow engine with state management

The hybrid approach (starting with a workflow router, evolving to agent runtime) provides a **low-risk migration path** while delivering immediate value.

**Recommended Next Steps**:
1. Create feature contract for Phase 1 implementation
2. Build proof-of-concept for context caching
3. Design OpenAPI specification
4. Implement basic health check endpoint

This REST API will position Grabby as a **professional development tool** ready for editor integrations, CI/CD pipelines, and team workflows.
