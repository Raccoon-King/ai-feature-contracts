# FC: [NAME]
**ID:** [ID] | **Status:** draft
CONTRACT_TYPE: ARCH_CHANGE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1
REQUIRES_ARCH_APPROVAL: true
ARCH_APPROVED: false

## Objective
[Boundary-level change summary]

## Architectural Justification
[Required: why boundary/rule exception is needed]

## Expanded Plan Review
- [ ] Cross-module impact listed
- [ ] Compatibility strategy listed
- [ ] Rollback strategy listed

## Scope
- [Module boundary change]

## Directories
**Allowed:** `src/`, `docs/`
**Restricted:** `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `src/[module]/index.ts` | Boundary update |

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1

## AI Assistant Handoff
- Generate prompt bundle: `grabby prompt [CONTRACT_FILE]`
- Prompt file: `contracts/[PROMPT_FILE]`
- Copy/paste flow:
  1. Open `contracts/[PROMPT_FILE]`
  2. Paste all contents into your AI assistant
  3. Ask it to execute only within this contract's scope and files
- File reference flow:
  - Tell your AI assistant: "Read and process `contracts/[PROMPT_FILE]` exactly, then implement only approved contract scope."
