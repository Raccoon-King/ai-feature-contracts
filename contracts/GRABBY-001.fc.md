# FC: Comprehensive Test Suite for Grabby

ID: GRABBY-001
Type: feat
Status: paused

## Objective

Add comprehensive test coverage across the entire Grabby application, including unit tests, integration tests, and E2E tests for all 31 modules in `/lib`.

## Actors

- AI (primary implementer)
- Grabby system (test target)

## Scope

- Add/enhance unit tests for all modules in `/lib`
- Add integration tests for cross-module interactions
- Add E2E tests for CLI workflows
- Ensure 80%+ coverage threshold is met across all modules
- Test all major code paths, edge cases, and failure scenarios

### Modules to Test (31 total)

| Module | Size | Priority |
|--------|------|----------|
| `core.cjs` | 17KB | High |
| `commands.cjs` | 41KB | High |
| `interactive-workflows.cjs` | 73KB | High |
| `governance-runtime.cjs` | 12KB | High |
| `features.cjs` | 10KB | High |
| `contract-levels.cjs` | 13KB | Medium |
| `api-server.cjs` | 10KB | Medium |
| `jira.cjs` | 10KB | Medium |
| `complexity.cjs` | 7.5KB | Medium |
| `dependency-analyzer.cjs` | 7.5KB | Medium |
| `task-artifacts.cjs` | 9.6KB | Medium |
| `multi-repo.cjs` | 8.2KB | Medium |
| `cicd.cjs` | 8.4KB | Medium |
| `smart-prompts.cjs` | 8KB | Medium |
| `progress.cjs` | 8.5KB | Medium |
| `tui.cjs` | 9.6KB | Medium |
| `ai-complete.cjs` | 12KB | Medium |
| `feature-chat.cjs` | 13KB | Medium |
| `plugins.cjs` | 8.9KB | Medium |
| `metrics.cjs` | 8KB | Low |
| `interactive-shell.cjs` | 10KB | Low |
| `config.cjs` | 4.4KB | Low |
| `governance.cjs` | 4KB | Low |
| `id-utils.cjs` | 2.3KB | Low |
| `agile.cjs` | 3.2KB | Low |
| `watcher.cjs` | 4.8KB | Low |
| `personas.cjs` | 2.8KB | Low |
| `ruleset-builder.cjs` | 5KB | Low |
| `ignore.cjs` | 2KB | Low |
| `graphql.cjs` | 1.4KB | Low |
| `interactive.cjs` | 0.4KB | Low |

## Non-Goals

- No refactoring of source code (tests only)
- No new features or functionality changes
- No dependency updates unless required for testing

## Allowed_Directories

- `/lib` (read-only for source reference)
- `/tests` (primary work area)
- `/contracts` (contract artifacts only)
- `/coverage` (generated output)

## Restricted_Directories

- `/bin` (CLI entry points - no modifications)
- `/node_modules` (dependencies)
- `/.git` (version control)

## Context Refs

- ARCH: module-map@v1
- RULESET: coding@v1
- ENV: local-dev@v1

## Definition of Done

- [x] All 31 modules have corresponding test files
- [ ] Unit tests cover all exported functions (partial - 52% coverage)
- [x] Integration tests verify cross-module workflows
- [x] E2E tests validate CLI commands
- [ ] Coverage meets 80% threshold (lines, functions, statements) - DEFERRED
- [ ] Coverage meets 70% threshold (branches) - DEFERRED
- [x] All tests pass (`npm test`) - 711 passed, 1 skipped
- [x] No regressions in existing tests (fixed 5 broken tests)

## Testing Requirements

### Unit Tests
- Test all exported functions per module
- Test edge cases and boundary conditions
- Test error handling and failure paths
- Mock external dependencies appropriately

### Integration Tests
- Test contract validation → plan generation → execution flow
- Test governance enforcement across modules
- Test persona handoffs in orchestration

### E2E Tests
- Test CLI commands end-to-end
- Test file generation workflows
- Test error reporting and user feedback

## Existing Test Infrastructure

- **Runner:** Jest 29.7.0
- **Pattern:** `**/tests/**/*.test.js`
- **Config:** package.json jest configuration
- **Coverage:** `/coverage` directory
- **Existing tests:** 28 test files

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Large scope (31 modules) | Prioritize by module size/complexity |
| Mocking complexity | Use existing test patterns as reference |
| Coverage gaps in branches | Focus on conditional logic paths |
