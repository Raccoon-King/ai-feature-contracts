# Grabby Method Router for Codex

This repository uses Grabby for all feature work. The method router ensures that implementation cannot start before proper ticket intake, contract creation, planning, and explicit approval.

## Routing Logic

When receiving a feature/change request:

1. **Detect contract reference**
   - If the request references an existing contract ID (e.g., `GRAB-001`, `contracts/GRAB-001.fc.md`), use that contract.
   - If no contract reference exists, route to ticket intake.

2. **Ticket intake (uncontracted requests)**
   - Collect required fields before proceeding:
     - **Who**: The actor or stakeholder
     - **What**: The requested change or feature
     - **Why**: The business reason or motivation
     - **Definition of Done**: Acceptance criteria (bullet list)
   - Validate the ticket ID format: `[A-Z][A-Z0-9]+-\d+`
   - Create `contracts/<ID>.fc.md` as draft

3. **Plan phase**
   - Generate `contracts/<ID>.plan.yaml`
   - **Do not modify implementation files**
   - Output plan artifacts only

4. **Approval gate**
   - Block execution until `approval_token: Approved` is present in the plan
   - Explicit user approval is required

5. **Execute phase**
   - Modify only files listed in the plan's `files:` section
   - Stay within `Allowed` directories from the contract
   - Never modify `Restricted` directories

## Commands

| Command | Purpose |
|---------|---------|
| `grabby list` | List existing contracts |
| `grabby task "request"` | Create contract with interview |
| `grabby validate <file>` | Validate contract |
| `grabby plan <file>` | Generate plan (Phase 1) |
| `grabby approve <file>` | Approve for execution |
| `grabby execute <file>` | Get execution context (Phase 2) |
| `grabby audit <file>` | Audit implementation |

## Enforcement

- If a file is not in the approved plan, do not modify it.
- If execution is attempted without approval, stop and report.
- If scope drift is detected, stop and report.

---
*Managed by `grabby init`. See `.codex/rules/grabby.md` for full ruleset.*
