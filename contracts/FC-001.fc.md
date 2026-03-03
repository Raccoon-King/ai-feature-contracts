# FC: Grabby v2 Enhancements
**ID:** FC-001 | **Status:** approved

## Objective
Enhance Grabby with AI auto-complete, improved developer experience (watch mode, TUI, better prompts, progress tracking), stricter validation, CI/CD integration, metrics/reports, plugin system, API server, and multi-repo support.

## Scope

### Phase 1: Developer Experience (Foundation)
- Progress Tracking: Visual progress bars during workflows using `ora` or `cli-progress`
- Watch Mode: Auto-validate on contract file changes using `chokidar`
- Better Prompts: Context-aware interview questions based on project type, existing contracts, and codebase analysis

### Phase 2: Enhanced Validation & Metrics
- Stricter Validation: Complexity scoring, dependency analysis, cyclomatic complexity checks
- Metrics & Reports: Contract completion stats, coverage trends, workflow analytics
- CI/CD Integration: GitHub Actions workflow templates, pre-merge contract checks

### Phase 3: Architecture & Extensibility
- Plugin System: Custom agents/workflows via `.grabby/plugins/` config
- Interactive TUI: Full terminal UI with menus and navigation using `ink` or `blessed`
- AI Auto-Complete: LLM-powered contract field suggestions (OpenAI/Anthropic API integration)

### Phase 4: Enterprise Features
- API Server: REST/GraphQL API for external integrations
- Multi-repo Support: Monorepo and workspace awareness, cross-repo contract linking

## Non-Goals
- Cloud-hosted contract storage (keep file-based)
- Real-time collaboration features
- GUI desktop application
- Breaking changes to existing contract format
- Removing existing CLI commands

## Directories
**Allowed:** `lib/`, `bin/`, `tests/`, `templates/`, `agents/`, `workflows/`, `docs/`, `scripts/`
**Restricted:** `node_modules/`, `.git/`, `.env*`, `coverage/`

## Files

### Phase 1: Developer Experience
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/progress.cjs` | Progress bar utilities (ora/cli-progress wrapper) |
| create | `lib/watcher.cjs` | File watcher for watch mode (chokidar) |
| create | `lib/smart-prompts.cjs` | Context-aware prompt generation |
| modify | `lib/commands.cjs` | Add watch command handler |
| modify | `lib/interactive-workflows.cjs` | Integrate progress bars |
| modify | `bin/index.cjs` | Add `grabby watch` command |
| create | `tests/progress.test.js` | Progress bar unit tests |
| create | `tests/watcher.test.js` | Watch mode unit tests |
| create | `tests/smart-prompts.test.js` | Smart prompts unit tests |

### Phase 2: Validation & Metrics
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/complexity.cjs` | Complexity scoring algorithms |
| create | `lib/dependency-analyzer.cjs` | Dependency graph analysis |
| create | `lib/metrics.cjs` | Metrics collection and reporting |
| create | `lib/cicd.cjs` | CI/CD template generation |
| create | `templates/github-actions.yaml` | GitHub Actions workflow template |
| modify | `lib/core.cjs` | Enhanced validation with complexity checks |
| create | `tests/complexity.test.js` | Complexity scoring tests |
| create | `tests/metrics.test.js` | Metrics unit tests |

### Phase 3: Architecture
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/plugins.cjs` | Plugin loader and registry |
| create | `lib/tui.cjs` | Terminal UI components |
| create | `lib/ai-complete.cjs` | LLM integration for auto-complete |
| modify | `lib/governance.cjs` | Plugin configuration support |
| modify | `bin/index.cjs` | Add TUI mode and plugin commands |
| create | `tests/plugins.test.js` | Plugin system tests |
| create | `tests/tui.test.js` | TUI component tests |
| create | `tests/ai-complete.test.js` | AI auto-complete tests |

### Phase 4: Enterprise
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/api-server.cjs` | Express/Fastify REST API |
| create | `lib/graphql.cjs` | GraphQL schema and resolvers |
| create | `lib/multi-repo.cjs` | Monorepo/workspace detection |
| create | `bin/server.cjs` | API server entrypoint |
| create | `tests/api-server.test.js` | API endpoint tests |
| create | `tests/multi-repo.test.js` | Multi-repo tests |

## Dependencies

### Phase 1 (New)
- `ora` - Elegant terminal spinners
- `cli-progress` - Progress bars
- `chokidar` - File watching

### Phase 2 (New)
- `madge` - Dependency graph analysis (optional)

### Phase 3 (New)
- `ink` OR `blessed` - Terminal UI (choose one)
- `openai` OR `@anthropic-ai/sdk` - LLM integration

### Phase 4 (New)
- `fastify` - HTTP server
- `@graphql-tools/schema` - GraphQL support

### Banned
- moment, lodash, jquery (use native)
- electron (no GUI)

### Security
- Run `npm audit` before adding packages
- All LLM API keys via environment variables only
- No secrets in code or config files

## Security Considerations
- [ ] Input validation implemented for all CLI inputs
- [ ] No secrets in code (API keys via env vars)
- [ ] Dependencies CVE-free (`npm audit`)
- [ ] Error messages don't leak sensitive info
- [ ] API server has rate limiting
- [ ] API server validates all inputs
- [ ] Plugin system sandboxes untrusted code
- [ ] File watcher respects `.grabbyignore`

## Code Quality
- [ ] TypeScript strict mode (no `any`) - future migration
- [ ] ESLint passes (no warnings)
- [ ] No console.log/debugger statements (use logger)
- [ ] Error handling complete
- [ ] Functions < 50 lines
- [ ] JSDoc comments for public APIs

## Done When

### Phase 1: Developer Experience
- [ ] `grabby watch` monitors contracts directory
- [ ] Progress bars show during all long operations
- [ ] Interview questions adapt based on project context
- [ ] Tests pass (80%+ coverage)

### Phase 2: Validation & Metrics
- [ ] Validation includes complexity scores
- [ ] `grabby metrics` shows contract stats
- [ ] `grabby cicd` generates GitHub Actions workflow
- [ ] Dependency analysis warns about circular deps
- [ ] Tests pass (80%+ coverage)

### Phase 3: Architecture
- [ ] Plugins can define custom agents
- [ ] `grabby tui` launches interactive mode
- [ ] AI suggestions work for scope/files/done-when
- [ ] Plugin API is documented
- [ ] Tests pass (80%+ coverage)

### Phase 4: Enterprise
- [ ] `grabby serve` starts API server
- [ ] REST endpoints for CRUD operations
- [ ] GraphQL queries work
- [ ] Monorepo detection auto-configures paths
- [ ] Tests pass (80%+ coverage)

### Overall
- [ ] All lint checks pass
- [ ] Build succeeds
- [ ] Security checklist complete
- [ ] Code quality checklist complete
- [ ] Documentation updated

## Testing
- Unit: `tests/*.test.js`
- Coverage: 80%+ lines, branches, functions
- Integration: `tests/integration/*.test.js` (new)
- E2E: Manual CLI testing

## Context Refs
- ARCH_INDEX_v1 §patterns
- RULESET_CORE_v1 §testing
- SECURITY_v1 §input-validation
- BEST_PRACTICES_v1 §testing §error-handling

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| LLM API costs | Optional feature, mock in tests |
| Large dependency footprint | Use lightweight alternatives |
| Breaking existing workflows | Feature flags for new behavior |
| Plugin security | Sandbox execution, code review |
| TUI complexity | Start with simple menu, iterate |

## Implementation Order
1. Progress Tracking (quick win, improves UX)
2. Watch Mode (builds on file handling)
3. Better Prompts (enhances existing flows)
4. Stricter Validation (core improvement)
5. Metrics & Reports (visibility)
6. CI/CD Integration (workflow)
7. Plugin System (extensibility foundation)
8. Interactive TUI (uses plugins)
9. AI Auto-Complete (advanced feature)
10. API Server (external integration)
11. Multi-repo Support (enterprise feature)
