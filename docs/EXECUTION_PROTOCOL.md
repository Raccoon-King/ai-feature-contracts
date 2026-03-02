# Execution Protocol v1

## Persona-Led Entry Points

- `grabby task "<request>"`:
  - interviews the developer
  - selects a persona
  - writes a populated contract and a developer brief
  - can optionally emit a machine-readable session artifact
- `grabby orchestrate "<request>"`:
  - runs the interview
  - writes the populated contract
  - validates the contract
  - hands off across Archie -> Val -> Sage -> Dev -> Iris
  - emits plan, backlog, execution, and audit artifacts in one CLI session

## Non-Interactive Mode

For wrappers, CI, or future IDE integrations:
- pass `--output console|file|both` to control where generated content is written
- pass task inputs with flags such as `--objective`, `--scope`, `--done-when`, and `--testing`
- use `--yes` or `--non-interactive` to skip prompts
- use `--session-format json|yaml` to emit a machine-readable session artifact
- use `--session-output <path>` to control where that artifact is written
- use `grabby session <file>` to inspect or regenerate those artifacts later
- use `grabby session <file> --check` for CI-friendly validation
- use `grabby session <file> --regenerate --format json|yaml` to rebuild a session artifact from an existing contract and its related files
- use `grabby session <file> --regenerate --output-path <path>` to write the regenerated artifact somewhere else
- use `grabby session --check-all` to validate every session artifact under `contracts/`
- `.grabbyignore` accepts glob patterns and negation (`!pattern`) for ignored artifact paths

## Orchestrated Handoff

1. `Archie` shapes the request into a bounded contract.
2. `Val` validates that the generated contract is structurally safe.
3. `Sage` generates the backlog and execution plan.
4. `Dev` prepares the execution brief.
5. `Iris` prepares the audit checklist.

## Artifact Flow

1. `grabby task "<request>"` writes:
   - `contracts/<name>.fc.md`
   - `contracts/<name>.brief.md`
   - optional `contracts/<name>.session.json|yaml`
2. `grabby orchestrate "<request>"` additionally writes:
   - `contracts/<name>.plan.yaml`
   - `contracts/<name>.backlog.yaml`
   - `contracts/<name>.execute.md`
   - `contracts/<name>.audit.md`
3. `grabby prompt <file>` writes:
   - `contracts/<name>.prompt.md`

## Init Output

`grabby init` bootstraps the current repo with:
- `contracts/`
- `.grabby/config.json`
- `.grabbyignore`
- `docs/ARCHITECTURE_INDEX.md`
- `docs/RULESET_CORE.md`
- `docs/ENV_STACK.md`
- `docs/EXECUTION_PROTOCOL.md`

## Two-Phase Execution

### Phase 1: PLAN
- Output: files, rules, risks
- No file edits allowed
- Must be approved before Phase 2

### Phase 2: EXECUTE
- Only modify approved files
- No scope expansion
- Follow `RULESET_CORE` patterns
- Before commit, run `grabby guard <contract.fc.md>` to verify plan/contract scope alignment


## Execution Guard and Pre-Commit Enforcement

- `grabby guard <contract.fc.md>` loads the approved plan and checks current git changes against plan files and contract directory scope.
- `grabby execute <contract.fc.md>` runs execution output, then automatically enforces the same guard before completion.
- If violations exist, execution exits non-zero and prints actionable remediation steps.

## Pre-Execution Validation
```
OK Files in allowed directories
OK No restricted directories
OK Dependencies in allowed list
OK Contract status = approved
```

## Post-Execution Audit
```
OK Files changed as specified
OK Rules compliance
OK Lint passes
OK Build succeeds
```

## Context Envelope
```
@context ARCH_INDEX_v1 section frontend
@context RULESET_CORE_v1 section hooks
@context ENV_STACK_v1
```
