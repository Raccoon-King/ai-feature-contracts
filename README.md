# Grabby

Token-efficient feature contract system for AI-assisted development with persona-led CLI workflows.

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

# Let Grabby interview you and prefill a contract
grabby task "create a unit test"

# Or run the full Archie -> Sage -> Dev -> Iris handoff
grabby orchestrate "fix login redirect bug"

# Or create a contract directly
grabby create "user-authentication"

# Validate
grabby validate user-authentication.fc.md

# Generate plan (Phase 1)
grabby plan user-authentication.fc.md

# Approve
grabby approve user-authentication.fc.md

# Execute with Cline/Claude (Phase 2)
grabby execute user-authentication.fc.md

# Post-execution audit
grabby audit user-authentication.fc.md
```

## Commands

| Command | Description |
|---------|-------------|
| `grabby init` | Initialize in current project |
| `grabby create <name>` | Create new contract |
| `grabby task <request>` | Interview-driven task breakdown with persona selection |
| `grabby orchestrate <request>` | Full persona handoff in one CLI session |
| `grabby validate <file>` | Validate contract |
| `grabby plan <file>` | Generate plan (Phase 1) |
| `grabby backlog <file>` | Generate Agile epic/task/subtask backlog |
| `grabby prompt <file>` | Render an LLM instruction bundle |
| `grabby session <file>` | Inspect or regenerate session artifacts |
| `grabby approve <file>` | Approve for execution |
| `grabby execute <file>` | Show execution instructions (Phase 2) |
| `grabby audit <file>` | Post-execution audit |
| `grabby list` | List all contracts |

## Persona Workflow

Grabby uses BMAD-style personalities in the CLI:
- `Archie`: contract shaping and clarification
- `Sage`: planning and backlog decomposition
- `Dev`: execution handoff preparation
- `Iris`: audit preparation and verification
- `Flash`: quick bounded work
- `Conductor`: orchestrates the full handoff

## Generated Artifacts

`grabby task` generates:
- `contracts/<name>.fc.md` - populated feature contract
- `contracts/<name>.brief.md` - developer-facing task brief
- optional `contracts/<name>.session.json|yaml` - machine-readable session summary

`grabby orchestrate` additionally generates:
- `contracts/<name>.plan.yaml`
- `contracts/<name>.backlog.yaml`
- `contracts/<name>.execute.md`
- `contracts/<name>.audit.md`

## Non-Interactive Automation

Use flags when `grabby task` or `grabby orchestrate` should run without prompts:

```bash
grabby task "create a unit test" \
  --task-name "login unit test" \
  --objective "Add focused login test coverage." \
  --scope "add a login unit test,avoid production code changes" \
  --done-when "tests pass,lint passes" \
  --testing "Unit: tests/login-unit-test.test.ts" \
  --session-format json \
  --yes
```

Useful flags:
- `--task-name`
- `--objective`
- `--scope`
- `--non-goals`
- `--directories`
- `--constraints`
- `--dependencies`
- `--done-when`
- `--testing`
- `--yes` or `--non-interactive`
- `--session-format json|yaml`
- `--session-output <path>`

CI/session validation:
```bash
grabby session login-unit-test.fc.md --check
grabby session --check-all
grabby session login-unit-test.fc.md --regenerate --format yaml
```

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

## Done When
- [ ] Feature works
- [ ] Tests pass (80%+)
- [ ] Lint clean

## Context Refs
- ARCH_INDEX_v1 §frontend
- RULESET_CORE_v1 §hooks
```

## Token Efficiency

This system reduces token usage by:
- Compact contracts (<300 tokens)
- Reference-based context (`@context ARCH_INDEX_v1 §frontend`)
- Structured plans instead of prose
- Two-phase separation (plan vs execute)

## Reference Documents

After `grabby init`, your project will have:
- `docs/ARCHITECTURE_INDEX.md` - Module map
- `docs/RULESET_CORE.md` - Coding rules
- `docs/ENV_STACK.md` - Environment config
- `docs/EXECUTION_PROTOCOL.md` - Workflow
- `.grabbyignore` - paths Grabby should ignore for artifact inspection/reporting

`.grabbyignore` supports glob-style patterns such as:
- `**/*.session.json`
- `tmp/*.log`
- `coverage/`
- `!contracts/keep.session.json`

## Recommended Flow

1. Run `grabby task "<request>"` when the task still needs clarification.
2. Run `grabby orchestrate "<request>"` when you want the full multi-persona handoff.
3. Review `contracts/*.fc.md`, `*.brief.md`, and orchestration artifacts before coding.
4. Use `grabby execute <file>` and `grabby audit <file>` during implementation and verification.

## License

MIT

