# Grabby v2 Roadmap

## Overview

This roadmap outlines the planned enhancements for Grabby, organized into four phases. Each phase builds on the previous, delivering incremental value while maintaining stability.

---

## Phase 1: Developer Experience (Foundation) ✅ COMPLETE

Quick wins that improve daily workflow.

| Feature | Status | Description |
|---------|--------|-------------|
| **Progress Tracking** | ✅ Done | Visual spinners and progress bars during workflows |
| **Watch Mode** | ✅ Done | `grabby watch` - auto-validate on contract file changes |
| **Smart Prompts** | ✅ Done | Context-aware interview questions based on project structure |

### New Commands
```bash
grabby watch              # Auto-validate contracts on file changes
```

### New Modules
- `lib/progress.cjs` - Spinner and progress bar utilities
- `lib/watcher.cjs` - File watching with chokidar
- `lib/smart-prompts.cjs` - Project-aware prompt generation

---

## Phase 2: Enforcement & Quality ✅ COMPLETE

Stricter validation and visibility into contract health.

| Feature | Status | Description |
|---------|--------|-------------|
| **Stricter Validation** | ✅ Done | Complexity scoring, dependency analysis, anti-pattern detection |
| **Metrics & Reports** | ✅ Done | Contract completion stats, coverage trends, workflow analytics |
| **CI/CD Integration** | ✅ Done | GitHub Actions templates, pre-merge contract checks |

### New Commands
```bash
grabby metrics            # Show contract stats and trends
grabby metrics --json     # Output as JSON
grabby metrics --save     # Save snapshot for trend analysis
grabby cicd               # Check CI/CD setup status
grabby cicd --setup       # Generate CI/CD files
grabby cicd --dry-run     # Preview what would be generated
```

### New Modules
- `lib/complexity.cjs` - Complexity scoring algorithms
- `lib/dependency-analyzer.cjs` - Dependency graph analysis
- `lib/metrics.cjs` - Metrics collection and reporting
- `lib/cicd.cjs` - CI/CD template generation
- `templates/github-actions.yaml` - Default GitHub Actions workflow template

---

## Phase 3: Architecture & Extensibility ✅ COMPLETE

Enable customization and advanced features.

| Feature | Status | Description |
|---------|--------|-------------|
| **Plugin System** | ✅ Done | Custom agents/workflows via `.grabby/plugins/` |
| **Interactive TUI** | ✅ Done | Full terminal UI with menus and navigation |
| **AI Auto-Complete** | ✅ Done | LLM-powered contract field suggestions |

### New Commands
```bash
grabby tui                    # Launch interactive terminal UI
grabby plugin list            # List installed plugins
grabby plugin create <name>   # Create a new plugin
grabby plugin validate <name> # Validate a plugin
grabby ai suggest <file>      # Generate AI suggestions for a contract
grabby ai status              # Check AI configuration
```

### New Modules
- `lib/plugins.cjs` - Plugin loader and registry
- `lib/tui.cjs` - Terminal UI components
- `lib/ai-complete.cjs` - LLM integration (OpenAI/Anthropic)

### Plugin API
```javascript
// .grabby/plugins/my-plugin/index.js
module.exports = {
  name: 'my-plugin',
  agents: [{ name: 'custom-agent', prompt: '...' }],
  workflows: [{ name: 'custom-flow', steps: [...] }],
  hooks: { beforeValidate: (contract) => { ... } }
};
```

### AI Configuration
Set one of these environment variables:
- `OPENAI_API_KEY` - Uses GPT-4o-mini
- `ANTHROPIC_API_KEY` - Uses Claude 3 Haiku
- `GEMINI_API_KEY` - Uses Gemini 1.5 Flash
- `OLLAMA_HOST` / `OLLAMA_MODEL` - Uses local Ollama API

---

## Phase 4: Enterprise Features ✅ COMPLETE

External integrations and multi-project support.

| Feature | Status | Description |
|---------|--------|-------------|
| **API Server** | ✅ Done | REST API for external integrations |
| **Multi-repo Support** | ✅ Done | Monorepo and workspace awareness |

### New Commands
```bash
grabby serve                  # Start API server (default: port 3456)
grabby serve --port=8080      # Custom port
grabby workspace info         # Show workspace/monorepo info
grabby workspace contracts    # List all contracts across packages
```

### API Endpoints
```
GET    /api/health                  # Health check
GET    /api/contracts               # List all contracts
GET    /api/contracts/:id           # Get contract details
POST   /api/contracts               # Create contract
PUT    /api/contracts/:id           # Update contract
DELETE /api/contracts/:id           # Delete contract
POST   /api/contracts/:id/validate  # Validate contract
GET    /api/metrics                 # Get metrics
POST   /api/graphql                # Execute GraphQL query
```

### New Modules
- `lib/api-server.cjs` - REST API server (no external dependencies)
- `lib/graphql.cjs` - GraphQL query execution helper
- `bin/server.cjs` - Standalone API server entrypoint
- `lib/multi-repo.cjs` - Monorepo/workspace detection

### Supported Workspace Types
- npm workspaces
- yarn workspaces
- pnpm workspaces
- Lerna
- Nx
- Turborepo
- Rush

---

## Dependencies by Phase

| Phase | New Dependencies |
|-------|------------------|
| 1 | `cli-progress`, `chokidar` |
| 2 | `madge` (optional) |
| 3 | `ink` or `blessed`, `openai` or `@anthropic-ai/sdk` |
| 4 | `fastify`, `@graphql-tools/schema` |

---

## Implementation Priority

Recommended order within each phase:

### Phase 2
1. Stricter Validation (core improvement)
2. Metrics & Reports (visibility)
3. CI/CD Integration (workflow)

### Phase 3
1. Plugin System (foundation for extensibility)
2. Interactive TUI (uses plugin system)
3. AI Auto-Complete (advanced feature)

### Phase 4
1. API Server (external integration foundation)
2. Multi-repo Support (enterprise feature)

---

## Non-Goals

These are explicitly **out of scope**:

- Cloud-hosted contract storage (file-based is intentional)
- Real-time collaboration features
- GUI desktop application
- Breaking changes to existing contract format
- Removing existing CLI commands

---

## Contributing

To work on a feature:

1. Check for existing contract: `grabby list`
2. Create a contract: `grabby task "feature name"`
3. Follow the standard workflow: validate → plan → approve → execute → audit

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| v1.1.0 | Current | Grabby rename, worktree support |
| v2.0.0 | Planned | Phase 1-4 complete |
