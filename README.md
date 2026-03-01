# Grabby

Token-efficient feature contract system for AI-assisted development with Cline/Claude Code.

## Installation

```bash
# Global install
npm install -g grabby

# Or link locally for development
git clone https://github.com/yourusername/grabby.git
cd grabby
npm link
```

## Quick Start

```bash
# Initialize in your project
cd your-project
grabby init

# Install git hooks for auto-enforcement
grabby init-hooks

# Create a feature contract (interview-driven)
grabby task "add user authentication"

# Or use full orchestration (all agents in sequence)
grabby orchestrate "add user authentication"

# For quick fixes (< 3 files)
grabby quick
```

## Core Commands

| Command | Description |
|---------|-------------|
| `grabby init` | Initialize in current project |
| `grabby init-hooks` | Install git hooks for enforcement |
| `grabby task <request>` | Interview-driven task breakdown |
| `grabby orchestrate <request>` | Full persona handoff |
| `grabby create <name>` | Create contract from template |
| `grabby validate <file>` | Validate contract |
| `grabby plan <file>` | Generate plan (Phase 1) |
| `grabby backlog <file>` | Generate Agile backlog |
| `grabby approve <file>` | Approve for execution |
| `grabby execute <file>` | Show execution instructions (Phase 2) |
| `grabby audit <file>` | Post-execution audit |
| `grabby list` | List all contracts |

## Agent System

Grabby includes specialized agents with unique personas:

| Agent | Persona | Purpose |
|-------|---------|---------|
| `grabby agent architect` | Archie | Contract creation |
| `grabby agent validator` | Val | Validation & risk analysis |
| `grabby agent strategist` | Sage | Plan generation |
| `grabby agent dev` | Dev | Contract execution |
| `grabby agent auditor` | Iris | Post-execution audit |
| `grabby agent quick` | Flash | Quick flow for small changes |

### Agent Commands

```bash
grabby agent list              # List available agents
grabby agent architect CC      # Create contract interactively
grabby agent validator VC      # Validate contract
grabby agent strategist GP     # Generate plan
grabby agent dev EX            # Execute contract
grabby agent auditor AU        # Audit implementation
```

## Git Hooks (Auto-Enforcement)

```bash
# Install git hooks
grabby init-hooks

# Enable strict mode (block commits without contracts)
export GRABBY_STRICT=1
```

Hooks installed:
- **pre-commit**: Warns/blocks commits without approved contracts
- **commit-msg**: Suggests linking commits to contract IDs

## Two-Phase Execution

### Phase 1: PLAN
- Outputs files to modify, rules, risks
- NO file edits allowed
- Must be approved before Phase 2

### Phase 2: EXECUTE
- Only modify files from approved plan
- NO scope expansion
- Follow RULESET_CORE patterns

## Contract Template

```markdown
# FC: Feature Name
**ID:** FC-xxx | **Status:** draft

## Objective
[1-2 line description]

## Scope
- [In-scope items]

## Non-Goals
- [Excluded items]

## Directories
**Allowed:** `src/components/`, `src/hooks/`
**Restricted:** `backend/`, `node_modules/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `src/hooks/useX.ts` | Logic |

## Security Considerations
- [ ] Input validation implemented
- [ ] No secrets in code
- [ ] Dependencies CVE-free

## Code Quality
- [ ] TypeScript strict mode
- [ ] No console.log left behind
- [ ] Error handling matches patterns

## Done When
- [ ] Feature works
- [ ] Tests pass (80%+)
- [ ] Lint clean
- [ ] Build succeeds

## Context Refs
- ARCH_INDEX_v1 §frontend
- RULESET_CORE_v1 §hooks
```

## CLI Options

```bash
# Output modes
grabby task "request" --output console    # Console only
grabby task "request" --output file       # File only
grabby task "request" --output both       # Both (default)

# Non-interactive mode
grabby task "request" --yes               # Skip confirmations
grabby task "request" --non-interactive   # Use defaults

# Session artifacts
grabby task "request" --session-format json
grabby task "request" --session-output path/to/session.json

# Override values
grabby task "request" --objective "specific goal"
grabby task "request" --scope "item1,item2,item3"
grabby task "request" --directories "src/,tests/"
```

## Token Efficiency

This system reduces token usage by:
- Compact contracts (<300 tokens)
- Reference-based context (`@context ARCH_INDEX_v1 §frontend`)
- Structured plans instead of prose
- Two-phase separation (plan vs execute)
- Agile backlog generation for LLM execution

## Reference Documents

After `grabby init`, your project will have:
- `docs/ARCHITECTURE_INDEX.md` - Module map
- `docs/RULESET_CORE.md` - Coding rules
- `docs/ENV_STACK.md` - Environment config
- `docs/EXECUTION_PROTOCOL.md` - Workflow

## Security & Quality

All contracts enforce:
- 80%+ test coverage requirement
- npm audit for CVE awareness
- Security checklist for auth/payment features
- TypeScript strict mode compliance
- Input validation requirements

## License

MIT
