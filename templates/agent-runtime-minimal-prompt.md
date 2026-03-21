# Example: Minimal Prompt for Runtime-Driven Agent

This template demonstrates a reduced prompt format that assumes runtime/tool orchestration has already occurred. The LLM receives only decision-relevant context, not workflow instructions.

---

## Current Prompt (Before - Token Heavy)

```markdown
You are Val, the Scope Validator. Your role is to validate feature contracts
for completeness, consistency, and compliance with project standards.

## Your Responsibilities
1. Parse the contract file and extract all sections
2. Verify the contract has required sections: Objective, Scope, Files, Done When
3. Check that the ID matches the filename
4. Validate file paths don't target restricted directories
5. Ensure dependencies are in the allowed list
6. Check for security concerns
7. Verify test coverage requirements are specified
...
(200+ more lines of instructions)

## Contract Content
<full contract markdown here - 500+ tokens>

## Project Rules
<ruleset content - 300+ tokens>

## Architecture Context
<architecture content - 400+ tokens>

Please validate this contract and report any issues.
```

**Problems:**
- LLM must parse markdown (error-prone)
- Validation logic in prompt (can drift)
- Full context even when not needed
- No output format enforcement
- ~1500+ tokens per call

---

## Minimal Prompt (After - Token Efficient)

```markdown
## Task
Explain validation findings for this contract.

## Contract Summary
- Name: {{ contract_name }}
- ID: {{ contract_id }}
- Objective: {{ contract_objective }}
- Status: {{ contract_status }}

## Validation Findings
{{ #if has_errors }}
Errors ({{ error_count }}):
{{ #each errors }}
- {{ this.code }}: {{ this.message }}
{{ /each }}
{{ /if }}

{{ #if has_warnings }}
Warnings ({{ warning_count }}):
{{ #each warnings }}
- {{ this.code }}: {{ this.message }}
{{ /each }}
{{ /if }}

{{ #if no_issues }}
No issues found.
{{ /if }}

## Instructions
Write a 1-2 sentence summary explaining:
1. The overall validation result (pass/fail)
2. The most critical issue to address (if any)

Be concise. Do not repeat the findings list.
```

**Benefits:**
- Runtime already validated (LLM just explains)
- Pre-structured context (no parsing needed)
- Clear output expectation
- ~150-200 tokens per call
- 85%+ token reduction

---

## Comparison

| Aspect | Before (Prompt-Centric) | After (Runtime-Driven) |
|--------|-------------------------|------------------------|
| Token count | ~1500 | ~200 |
| LLM role | Parse + Validate + Report | Explain only |
| Validation logic | In prompt | In runtime |
| Output format | Unstructured | Constrained |
| Error risk | High (interpretation) | Low (pre-validated) |
| Testability | None | Full unit tests |

---

## Implementation Notes

### Runtime Prepares Context

```javascript
// lib/context-builder.cjs
function buildValidationContext(contract, findings) {
  return {
    contract_name: contract.name,
    contract_id: contract.id,
    contract_objective: truncate(contract.objective, 100),
    contract_status: contract.status,
    has_errors: findings.errors.length > 0,
    error_count: findings.errors.length,
    errors: findings.errors.slice(0, 5), // Limit to top 5
    has_warnings: findings.warnings.length > 0,
    warning_count: findings.warnings.length,
    warnings: findings.warnings.slice(0, 3),
    no_issues: findings.errors.length === 0 && findings.warnings.length === 0
  };
}
```

### Runtime Validates Output

```javascript
// lib/output-validator.cjs
function validateSummaryOutput(output) {
  // Must be 1-2 sentences
  const sentences = output.split(/[.!?]+/).filter(s => s.trim());
  if (sentences.length > 3) {
    return { valid: false, error: 'Summary too long' };
  }
  // Must not just repeat findings
  if (output.includes('Errors:') || output.includes('Warnings:')) {
    return { valid: false, error: 'Summary should not list findings' };
  }
  return { valid: true };
}
```

---

## When to Use Minimal Prompts

Use this pattern when:
- Deterministic logic can be extracted to runtime
- LLM only needs to generate natural language
- Output format can be validated
- Context can be pre-summarized

Avoid this pattern when:
- LLM needs to make architectural decisions
- Open-ended generation is required
- Context cannot be pre-processed
