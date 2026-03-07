# Grabby Task Brief: Harden API server with input validation, security, and performance fixes

## Request
Secure the API server against path traversal, add input validation, optimize contract lookup

## Ticket
- Ticket ID: GRAB-306
- Who: Grabby operator
- What: Harden API server with input validation, security, and performance fixes
- Why: API lacks path traversal protection, has O(n) lookup, missing input validation
- Definition of Done:
  - Path traversal attacks blocked
  - Contract name validation added
  - O(1) contract lookup via ID index
  - Request size limits enforced
  - Security tests pass

## Facilitator
- Persona: Dev
- Role: Implementation Developer
- Mode: execution
- Why this persona: Security-critical implementation work

## Objective
Secure and optimize API server

## Scope Breakdown
- lib/path-security.cjs (new)
- lib/api-server.cjs (hardening)
- tests/api-server.test.js (security tests)

## Constraints
- No auth system (out of scope)
- Keep existing API contract
- No new dependencies

## Done When
Security tests pass, performance improved, input validated

## Recommended Handoff
`grabby execute GRAB-306.fc.md`
