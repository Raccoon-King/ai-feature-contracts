/**
 * Sample Contract Content for Testing
 * @module tests/fixtures/contracts
 */

const fs = require('fs');
const path = require('path');

/**
 * Minimal valid contract content.
 */
const VALID_CONTRACT = `# FC: Test Feature
**ID:** TEST-001 | **Status:** draft

## Objective
Implement a test feature for unit testing.

## Scope
- Add test functionality
- Write unit tests

## Non-Goals
- No production deployment

## Directories
**Allowed:** \`src/\`, \`tests/\`
**Restricted:** \`node_modules/\`, \`.git/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/test.js\` | Implementation |
| create | \`tests/test.test.js\` | Unit tests |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash

## Security Considerations
- [ ] Input validation reviewed
- [ ] No secrets in code

## Done When
- [ ] Feature implemented
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit: tests/test.test.js

## Context Refs
- ARCH_INDEX_v1
`;

/**
 * Valid contract with approved status.
 */
const APPROVED_CONTRACT = VALID_CONTRACT.replace('**Status:** draft', '**Status:** approved');

/**
 * Valid contract with complete status.
 */
const COMPLETE_CONTRACT = VALID_CONTRACT.replace('**Status:** draft', '**Status:** complete');

/**
 * Invalid contract missing required sections.
 */
const INVALID_CONTRACT_MISSING_SECTIONS = `# FC: Invalid Feature
**ID:** INVALID-001 | **Status:** draft

## Objective
This contract is missing required sections.
`;

/**
 * Invalid contract with scope too large.
 */
const INVALID_CONTRACT_LARGE_SCOPE = `# FC: Large Scope Feature
**ID:** LARGE-001 | **Status:** draft

## Objective
Feature with too many scope items.

## Scope
- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6
- Item 7
- Item 8
- Item 9
- Item 10

## Non-Goals
- None

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/test.js\` | Implementation |

## Done When
- [ ] Done
`;

/**
 * Contract with security-sensitive content.
 */
const SECURITY_CONTRACT = `# FC: Auth Feature
**ID:** AUTH-001 | **Status:** draft

## Objective
Implement authentication with password handling.

## Scope
- Add password validation
- Implement auth tokens

## Non-Goals
- No SSO integration

## Directories
**Allowed:** \`src/\`, \`tests/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/auth.js\` | Auth implementation |
| create | \`tests/auth.test.js\` | Tests |

## Security Considerations
- [ ] Password hashing implemented
- [ ] Token expiry configured
- [ ] Input validation for auth fields
- [ ] No secrets in code

## Done When
- [ ] Auth works
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] npm audit passes

## Testing
- Unit: tests/auth.test.js
`;

/**
 * Write a valid contract to a directory.
 * @param {string} cwd - Working directory
 * @param {string} [name='test-feature.fc.md'] - Contract filename
 * @param {string} [content] - Optional custom content
 * @returns {string} Path to created contract
 */
function writeValidContract(cwd, name = 'test-feature.fc.md', content = VALID_CONTRACT) {
  const contractsDir = path.join(cwd, 'contracts');
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }
  const contractPath = path.join(contractsDir, name);
  fs.writeFileSync(contractPath, content, 'utf8');
  return contractPath;
}

/**
 * Write an invalid contract to a directory.
 * @param {string} cwd - Working directory
 * @param {string} [name='invalid.fc.md'] - Contract filename
 * @returns {string} Path to created contract
 */
function writeInvalidContract(cwd, name = 'invalid.fc.md') {
  return writeValidContract(cwd, name, INVALID_CONTRACT_MISSING_SECTIONS);
}

/**
 * Create a plan file for a contract.
 * @param {string} cwd - Working directory
 * @param {string} contractId - Contract ID (e.g., 'TEST-001')
 * @returns {string} Path to plan file
 */
function writePlanFile(cwd, contractId) {
  const contractsDir = path.join(cwd, 'contracts');
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }
  const planPath = path.join(contractsDir, `${contractId}.plan.yaml`);
  const content = `contract_id: ${contractId}
generated_at: "${new Date().toISOString()}"
files:
  - path: src/test.js
    action: create
    reason: Implementation
  - path: tests/test.test.js
    action: create
    reason: Unit tests
`;
  fs.writeFileSync(planPath, content, 'utf8');
  return planPath;
}

/**
 * Create an audit file for a contract.
 * @param {string} cwd - Working directory
 * @param {string} contractId - Contract ID
 * @returns {string} Path to audit file
 */
function writeAuditFile(cwd, contractId) {
  const contractsDir = path.join(cwd, 'contracts');
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }
  const auditPath = path.join(contractsDir, `${contractId}.audit.md`);
  const content = `# Audit: ${contractId}

## Summary
Implementation complete.

## Checklist
- [x] All files created
- [x] Tests pass
- [x] Lint passes
`;
  fs.writeFileSync(auditPath, content, 'utf8');
  return auditPath;
}

module.exports = {
  // Content
  VALID_CONTRACT,
  APPROVED_CONTRACT,
  COMPLETE_CONTRACT,
  INVALID_CONTRACT_MISSING_SECTIONS,
  INVALID_CONTRACT_LARGE_SCOPE,
  SECURITY_CONTRACT,

  // Helpers
  writeValidContract,
  writeInvalidContract,
  writePlanFile,
  writeAuditFile,
};
