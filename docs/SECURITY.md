# Security Guidelines

## Overview

All feature contracts must consider security implications. This document outlines security requirements, common vulnerabilities to avoid, and security review checklists.

## OWASP Top 10 Awareness

Every contract should consider these common vulnerability categories:

### 1. Injection (A03:2021)
- **SQL Injection**: Use parameterized queries, never concatenate user input
- **Command Injection**: Avoid shell execution with user input, use safe APIs
- **XSS**: Sanitize all user input before rendering

```typescript
// BAD
const query = `SELECT * FROM users WHERE id = ${userId}`;

// GOOD
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
```

### 2. Broken Authentication (A07:2021)
- Use established auth libraries (NextAuth, Passport)
- Implement proper session management
- Never store passwords in plain text

### 3. Sensitive Data Exposure (A02:2021)
- Never commit secrets (.env, API keys, credentials)
- Use environment variables for configuration
- Encrypt sensitive data at rest and in transit

### 4. Security Misconfiguration (A05:2021)
- Remove default credentials
- Disable unnecessary features
- Keep dependencies updated

### 5. Insecure Dependencies (A06:2021)
- Run `npm audit` before adding packages
- Check CVE databases for known vulnerabilities
- Pin dependency versions

## Security Checklist for Contracts

Add this section to contracts handling sensitive operations:

```markdown
## Security Considerations
- [ ] Input validation on all user inputs
- [ ] Output encoding/escaping
- [ ] Authentication required for sensitive operations
- [ ] Authorization checks (user can perform action)
- [ ] No secrets in code
- [ ] Dependencies audited (npm audit)
- [ ] Error messages don't leak sensitive info
- [ ] Logging doesn't include sensitive data
```

## CVE Awareness

### Checking for Vulnerabilities

Before implementation:
```bash
# Check npm packages
npm audit

# Check for specific CVEs
npm audit --json | jq '.vulnerabilities'

# Fix automatically where possible
npm audit fix
```

### Common CVE Categories to Watch

1. **Prototype Pollution** - Avoid lodash < 4.17.21, use Object.create(null)
2. **ReDoS** - Avoid complex regex on user input
3. **Path Traversal** - Validate file paths, use path.resolve()
4. **SSRF** - Validate URLs before fetching

### Dependency Scanning

```yaml
# Add to CI/CD
- name: Security Scan
  run: |
    npm audit --audit-level=high
    npx snyk test
```

## Banned Patterns

These patterns are automatically flagged:

| Pattern | Risk | Alternative |
|---------|------|-------------|
| `eval()` | Code injection | Use JSON.parse, Function constructor |
| `innerHTML` | XSS | Use textContent, sanitize-html |
| `dangerouslySetInnerHTML` | XSS | Use DOMPurify |
| `child_process.exec` | Command injection | Use execFile with args array |
| `fs.readFile(userInput)` | Path traversal | Validate/sanitize paths |
| `new Function()` | Code injection | Avoid dynamic code |
| `document.write` | XSS | Use DOM APIs |
| `$.html()` | XSS | Use $.text() |

## Security Review Workflow

1. **Pre-Implementation**
   - Review contract for security implications
   - Check dependencies for CVEs
   - Identify sensitive data flows

2. **During Implementation**
   - Follow secure coding patterns
   - Add input validation
   - Use security linting rules

3. **Post-Implementation**
   - Run security audit (`afc agent auditor AU`)
   - Run npm audit
   - Manual security review for high-risk features

## Environment Variables

Required security-related env vars:
```
NODE_ENV=production          # Disable dev features
SECURE_COOKIES=true          # Secure cookie flag
SESSION_SECRET=<random>      # Strong session secret
CORS_ORIGIN=https://...     # Restrict CORS
RATE_LIMIT=100              # Requests per minute
```

## Reporting Security Issues

If you discover a security vulnerability:
1. Do NOT open a public issue
2. Email security findings privately
3. Include steps to reproduce
4. Allow time for fix before disclosure
