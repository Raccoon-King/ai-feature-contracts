# Grabby Prompt Bundle: FC-002-phase1-manifest-sync.fc.md

## Runtime
- Provider profile: generic
- Agile levels: epic > task > subtask
- Max tasks per epic: 5
- Max subtasks per task: 5

## Rules
- Obey contract scope and non-goals.
- Do not modify restricted directories.
- Explain tradeoffs before expanding scope.
- Prefer minimal, testable changes.

## Guidance
- Treat the Grabby backlog as the execution order.
- Finish subtasks in order unless a dependency forces a re-sequence.
- Keep output deterministic and concise.

## Contract
```markdown
# FC: Modular Ruleset System - Phase 1: Manifest & Sync
**ID:** FC-002-PHASE1 | **Status:** approved
**Data Change:** no
**API Change:** no
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Implement core infrastructure for modular ruleset system:
- Manifest parser for central ruleset registry
- Git-based sync mechanism
- Sync lock file management
- Drift detection (version, hash, content changes)

This is Phase 1 of the modular ruleset system. Future phases will add CLI commands, contract integration, and full sync workflows.

## Business Value
- **Foundation**: Core infrastructure for extensible ruleset management
- **Version Control**: Track exact ruleset versions in sync.lock
- **Drift Detection**: Identify when local rules diverge from central repo
- **Caching**: Reduce network calls with intelligent local caching

## Scope

### Core Components
1. **Manifest Parser** (`lib/manifest-parser.cjs`)
   - Parse and validate manifest.yaml structure
   - Extract category definitions and metadata
   - Support ruleset version tracking
   - Validate preset bundles

2. **Sync Mechanism** (`lib/rules-sync.cjs`)
   - Git-based fetch from central repository
   - Clone/pull operations with error handling
   - Detect drift (version, hash, timestamp)
   - Support multiple sync modes (auto, strict, warn, manual)

3. **Sync Lock Manager** (`lib/sync-lock.cjs`)
   - Read/write sync.lock.yaml file
   - Track active rulesets with versions and hashes
   - Record last sync timestamp
   - Validate lock file integrity

4. **Configuration Schema** (update `lib/config.cjs`)
   - Add rulesets.source configuration
   - Add rulesets.sync configuration
   - Maintain backward compatibility

## Non-Goals (Deferred to Later Phases)
- CLI commands (Phase 2)
- Contract metadata integration (Phase 3)
- Automatic sync checks before commands (Phase 3)
- Preset bundle application (Phase 2)
- Migration tooling (Phase 5)

## Directories
**Allowed:**
- `lib/` - Core logic modules
- `.grabby/schemas/` - JSON schemas
- `templates/` - YAML templates
- `tests/` - Unit tests

**Restricted:**
- `node_modules/`
- `.env*`
- `bin/` - No CLI changes in this phase
- `docs/` - Minimal docs only

## Files

| Action | Path | Reason |
|--------|------|--------|
| **CREATE** | `lib/manifest-parser.cjs` | Parse and validate manifest.yaml |
| **CREATE** | `lib/rules-sync.cjs` | Git sync and drift detection |
| **CREATE** | `lib/sync-lock.cjs` | Manage sync.lock file |
| **MODIFY** | `lib/config.cjs` | Add rulesets config schema |
| **CREATE** | `.grabby/schemas/manifest.schema.json` | JSON schema for manifest |
| **CREATE** | `.grabby/schemas/sync-lock.schema.json` | JSON schema for sync lock |
| **CREATE** | `templates/manifest.yaml` | Example central repo manifest |
| **CREATE** | `templates/sync.lock.yaml` | Example sync lock file |
| **CREATE** | `tests/manifest-parser.test.js` | Unit tests for manifest parser |
| **CREATE** | `tests/rules-sync.test.js` | Unit tests for sync logic |
| **CREATE** | `tests/sync-lock.test.js` | Unit tests for lock manager |

## Dependencies
**No new external dependencies** - Use existing:
- `yaml` - Already bundled for YAML parsing
- Node.js built-ins: `fs`, `path`, `crypto`, `child_process` for git

## Data Impact
**No database changes** - This feature only affects:
- File system (`.grabby/rulesets/` directory for caching)
- Config files (`grabby.config.json` - new optional sections)

### Data Impact Checklist
- [ ] No database schema changes
- [ ] No data migrations required
- [ ] No user data affected
- [ ] File operations limited to `.grabby/` directory
- [ ] No PII or sensitive data handling
- [ ] All file operations have proper error handling

## Security Considerations

### Security Checklist
- [ ] Validate central repo URLs against trusted sources
- [ ] Verify content hash for all fetched rulesets
- [ ] Use read-only git operations (no push)
- [ ] Enforce HTTPS-only for remote fetches
- [ ] Validate all file paths stay within .grabby/
- [ ] No code execution - markdown only
- [ ] Implement timeout limits on git operations
- [ ] Handle git errors gracefully (no credential exposure)
- [ ] Sanitize file names from manifest
- [ ] Rate limiting considerations documented

## Testing Requirements
- **Unit Tests**: 80%+ coverage for all new modules
- **Mock Git Operations**: No actual network calls in tests
- **Edge Cases**: Invalid manifests, network failures, corrupt lock files
- **Integration**: Test full sync flow end-to-end (mocked git)

## Done When
- [ ] Manifest parser validates manifest.yaml structure
- [ ] Manifest parser extracts categories and rulesets
- [ ] Sync mechanism clones/pulls from git repository (mocked in tests)
- [ ] Drift detection identifies version/hash changes
- [ ] Sync lock file tracks active rulesets correctly
- [ ] Config schema updated with new rulesets section
- [ ] JSON schemas created and validated
- [ ] Templates created for manifest and sync.lock
- [ ] Lint passes with no warnings
- [ ] npm audit passes with no high/critical vulnerabilities
- [ ] 80%+ test coverage achieved
- [ ] All tests pass
- [ ] No breaking changes to existing code

## Rollout Plan
This is Phase 1 only. Subsequent phases:
- **Phase 2**: CLI commands (`grabby rules *`)
- **Phase 3**: Contract integration and auto-sync checks
- **Phase 4**: Documentation and examples
- **Phase 5**: Migration tooling

## Context Refs
- ARCH: stack@v1
- RULESET: imports@v1
- ENV: test-runner@v1

## Risk Assessment
- **Git Dependency**: Requires git to be installed
- **Network Dependency**: Sync requires network access
- **Breaking Changes**: Modifying config.cjs may affect existing users

## Mitigation Strategies
- Check for git availability before sync operations
- Graceful degradation if git unavailable (warning only)
- All new config sections are optional with defaults
- Extensive unit tests with mocked git operations

## Rollback Plan

### Rollback Procedure
If issues arise:

1. **Code Rollback**
   ```bash
   git revert <commit-hash>
   ```

2. **Config Cleanup** (if needed)
   - Remove `rulesets` section from grabby.config.json
   - No other cleanup needed (all changes are additive)

3. **Cache Cleanup** (optional)
   ```bash
   rm -rf .grabby/rulesets/sync.lock
   rm -rf .grabby/rulesets/cache
   ```

### Rollback Testing
- [ ] Test rollback on development environment
- [ ] Verify no side effects from cleanup
- [ ] Document rollback time estimate (< 10 minutes)
```

## LLM Instructions
1. Follow the contract exactly.
2. Execute work according to the backlog hierarchy.
3. Do not exceed the allowed directories or add banned dependencies.
4. Report assumptions before changing scope.
5. Prefer minimal diffs with tests and validation.
6. Assess feature complexity using Fibonacci points only: 0.5, 1, 2, 3, 5, 8, 13.
7. Assess delivery time using only these buckets: 0.5 day, 1 day, 3 days, 5 days, 2 weeks.
8. If estimate is over 5 days or complexity is 13, recommend breakdown and require subtasks before implementation.
9. After completion, display a post-feature ticket with: Feature ID, summary, Fibonacci complexity, time bucket, breakdown decision, subtasks, validation results, and follow-up risks.
