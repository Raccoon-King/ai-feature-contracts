# Claude Code Instructions

## Grabby Feature Contract System

This project uses Grabby for all development work. **You MUST follow this workflow.**

### Before Starting ANY Feature Work

1. **Check for existing contract:**
   ```bash
   grabby list
   ```

2. **If no contract exists, create one:**
   ```bash
   grabby task "describe your feature"
   ```
   Or use the interactive agent:
   ```bash
   grabby agent architect CC
   ```
   For quick fixes (< 3 files):
   ```bash
   grabby quick
   ```

3. **Never write code without an approved contract**

### Required Workflow

```
1. grabby task "feature"        # Interview-driven task breakdown with auto persona
2. grabby validate <file>       # Validate contract
3. grabby plan <file>           # Generate plan (Phase 1)
4. grabby backlog <file>        # Generate Agile backlog
5. grabby approve <file>        # Approve for execution
6. grabby execute <file>        # Get execution instructions (Phase 2)
7. [Implement code]             # Follow the plan exactly
8. grabby audit <file>          # Audit implementation
```

### Full Orchestration Mode

For complex features, use orchestration to run the full persona handoff:
```bash
grabby orchestrate "describe your feature"
```
This auto-routes through all agents: Archie → Val → Sage → Dev → Iris

### Rules

- **NEVER** modify files outside the contract's allowed directories
- **NEVER** add dependencies not approved in the contract
- **ALWAYS** write tests (80%+ coverage required)
- **ALWAYS** run `npm audit` before adding packages
- **ALWAYS** complete security checklist for auth/data features

### Quick Reference

| Command | Purpose |
|---------|---------|
| `grabby task "request"` | Interview-driven task breakdown |
| `grabby orchestrate "request"` | Full persona handoff |
| `grabby agent list` | See available agents |
| `grabby agent architect CC` | Create contract interactively |
| `grabby quick` | Quick spec for small changes |
| `grabby validate <file>` | Validate a contract |
| `grabby party` | See full team workflow |
| `grabby init-hooks` | Install git hooks for enforcement |

### Git Hooks (Auto-Enforcement)

Install git hooks to enforce contracts:
```bash
grabby init-hooks
```

This installs:
- **pre-commit**: Warns/blocks commits without approved contracts
- **commit-msg**: Suggests linking commits to contract IDs

Enable strict mode to block commits without contracts:
```bash
export GRABBY_STRICT=1
```

### Security Requirements

All code must:
- Validate user input
- Escape output
- Use parameterized queries (no SQL injection)
- Store no secrets in code
- Pass `npm audit` with no high/critical vulnerabilities

### Code Quality Requirements

- TypeScript strict mode (no `any`)
- ESLint passes (no warnings)
- 80%+ test coverage
- Functions < 50 lines
- No console.log in production code

### When User Asks for Changes

1. First ask: "Should I create a feature contract for this?"
2. If yes, run `grabby task "describe the change"`
3. If it's a tiny fix (< 3 files), use `grabby quick`
4. Never skip the contract for features or refactoring
