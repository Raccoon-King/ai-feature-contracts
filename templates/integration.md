# FC: [NAME]
**ID:** [ID] | **Status:** draft

## Objective
Integrate [service/library/API] to enable [capability].

## Scope
- Add integration layer
- Configuration setup
- Error handling
- Type definitions

## Non-Goals
- Full feature implementation (just the integration)
- UI changes
- Refactoring existing code

## Directories
**Allowed:** `src/integrations/`, `src/services/`, `src/types/`, `src/config/`
**Restricted:** `node_modules/`, `.env*`, `backend/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `src/integrations/[NAME].ts` | Integration client |
| create | `src/types/[NAME].types.ts` | Type definitions |
| create | `src/config/[NAME].config.ts` | Configuration |
| create | `src/tests/[NAME].integration.test.ts` | Integration tests |

## Dependencies
- Allowed: [specific package needed, if any]
- Banned: moment, lodash, jquery

## Configuration
- Required env vars: [list any needed]
- Required secrets: [list any needed]

## Done When
- [ ] Integration connects successfully
- [ ] Error handling works
- [ ] Types are correct
- [ ] Config is documented
- [ ] Tests pass
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Integration: `src/tests/[NAME].integration.test.ts`
- Mock service for unit tests

## Security Considerations
- [ ] API keys stored securely
- [ ] No secrets in code
- [ ] Rate limiting considered

## Context Refs
- ARCH_INDEX_v1 §integrations
- RULESET_CORE_v1 §typescript
- ENV_STACK_v1
