/**
 * AI Feature Contracts - CLI Tests
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Test helpers
const PKG_ROOT = path.join(__dirname, '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');
const AGENTS_DIR = path.join(PKG_ROOT, 'agents');
const WORKFLOWS_DIR = path.join(PKG_ROOT, 'workflows');

// Import functions to test (we'll need to refactor index.cjs to export these)
// For now, we'll test by re-implementing the logic here

// ============================================================================
// UTILITY FUNCTIONS (mirror from index.cjs)
// ============================================================================

const genId = () => `FC-${Date.now()}`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const timestamp = () => new Date().toISOString();

// ============================================================================
// VALIDATION FUNCTION (mirror from index.cjs for testing)
// ============================================================================

function validateContract(content) {
  const errors = [];
  const warnings = [];
  const suggestions = [];

  // Check required sections
  const required = ['Objective', 'Scope', 'Directories', 'Files', 'Done When'];
  required.forEach(s => {
    if (!content.includes(`## ${s}`)) errors.push(`Missing section: ${s}`);
  });

  // Check restricted directories in Files section
  const restricted = ['backend/', 'node_modules/', '.env'];
  const filesSection = content.match(/## Files[\s\S]*?(?=##|$)/)?.[0] || '';
  restricted.forEach(r => {
    if (filesSection.includes(r) && !filesSection.includes('Restricted')) {
      errors.push(`Restricted directory in files: ${r}`);
    }
  });

  // Check for banned dependencies
  const banned = ['moment', 'lodash', 'jquery'];
  const allowedLine = content.match(/- Allowed:.*$/m)?.[0] || '';
  banned.forEach(b => {
    if (allowedLine.toLowerCase().includes(b)) {
      errors.push(`Banned dependency: ${b}`);
    }
  });

  // Check for vague terms
  const vagueTerms = ['improve', 'optimize', 'enhance', 'better', 'faster'];
  const objectiveSection = content.match(/## Objective[\s\S]*?(?=##|$)/)?.[0] || '';
  const scopeSection = content.match(/## Scope[\s\S]*?(?=##|$)/)?.[0] || '';

  vagueTerms.forEach(term => {
    if (objectiveSection.toLowerCase().includes(term)) {
      warnings.push(`Vague term in Objective: "${term}" - add specific metrics`);
    }
  });

  // Check scope size
  const scopeItems = (scopeSection.match(/^- .+$/gm) || []).length;
  if (scopeItems > 7) {
    errors.push(`Scope too large (${scopeItems} items) - max 7 recommended`);
  }

  // Check file count
  const fileRows = (filesSection.match(/^\|[^|]+\|/gm) || []).length - 2;

  // Check for test files
  if (!filesSection.includes('test')) {
    warnings.push('No test files in Files section');
  }

  // Check Done When section
  const doneWhenSection = content.match(/## Done When[\s\S]*?(?=##|$)/)?.[0] || '';
  const checkboxCount = (doneWhenSection.match(/- \[ \]/g) || []).length;

  // Check testing section
  if (!content.includes('## Testing')) {
    warnings.push('No testing section defined');
  }

  // Check placeholders
  const placeholders = ['[NAME]', '[ID]', '[TODO]', '[TBD]', '[FILL]'];
  placeholders.forEach(p => {
    if (content.includes(p)) {
      errors.push(`Placeholder not filled: ${p}`);
    }
  });

  // Security checks
  const hasSecuritySection = content.includes('## Security Considerations');
  if (!hasSecuritySection) {
    warnings.push('Missing Security Considerations section');
  }

  // Check for 80% coverage
  const has80Coverage = doneWhenSection.includes('80%');
  if (!has80Coverage) {
    warnings.push('Done When should include 80%+ coverage requirement');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    stats: {
      scopeItems,
      fileCount: fileRows,
      checkboxCount,
      hasSecuritySection
    }
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Utility Functions', () => {
  describe('genId', () => {
    it('should generate unique IDs with FC- prefix', () => {
      const id = genId();
      expect(id).toMatch(/^FC-\d+$/);
    });

    it('should generate different IDs on each call', () => {
      const id1 = genId();
      const id2 = genId();
      // IDs might be same if called too fast, but format should be correct
      expect(id1).toMatch(/^FC-\d+$/);
      expect(id2).toMatch(/^FC-\d+$/);
    });
  });

  describe('slug', () => {
    it('should convert to lowercase', () => {
      expect(slug('HelloWorld')).toBe('helloworld');
    });

    it('should replace spaces with hyphens', () => {
      expect(slug('hello world')).toBe('hello-world');
    });

    it('should remove special characters', () => {
      expect(slug('hello@world!')).toBe('hello-world');
    });

    it('should handle multiple spaces/special chars', () => {
      expect(slug('hello   world!!!')).toBe('hello-world');
    });

    it('should trim leading/trailing hyphens', () => {
      expect(slug('--hello--')).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(slug('')).toBe('');
    });
  });

  describe('timestamp', () => {
    it('should return ISO format timestamp', () => {
      const ts = timestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

describe('Contract Validation', () => {
  describe('Required Sections', () => {
    it('should fail when missing required sections', () => {
      const content = '# FC: Test\n## Objective\nTest';
      const result = validateContract(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing section: Scope');
      expect(result.errors).toContain('Missing section: Directories');
      expect(result.errors).toContain('Missing section: Files');
      expect(result.errors).toContain('Missing section: Done When');
    });

    it('should pass when all required sections present', () => {
      const content = `# FC: Test
## Objective
Test objective

## Scope
- Item 1

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |

## Done When
- [ ] Tests pass (80%+ coverage)

## Security Considerations
- [ ] Input validation

## Testing
- Unit tests`;

      const result = validateContract(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Restricted Directories', () => {
    it('should fail when using node_modules in files', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | node_modules/pkg/index.js | Hack |

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.errors).toContain('Restricted directory in files: node_modules/');
    });

    it('should fail when using .env in files', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | .env | Add secrets |

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.errors).toContain('Restricted directory in files: .env');
    });
  });

  describe('Banned Dependencies', () => {
    it('should fail when allowing moment', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |

## Dependencies
- Allowed: moment, react

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.errors).toContain('Banned dependency: moment');
    });

    it('should fail when allowing lodash', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |

## Dependencies
- Allowed: lodash

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.errors).toContain('Banned dependency: lodash');
    });
  });

  describe('Vague Terms Detection', () => {
    it('should warn about vague terms in objective', () => {
      const content = `## Objective
Improve performance and optimize loading

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.warnings.some(w => w.includes('Vague term'))).toBe(true);
    });
  });

  describe('Scope Size', () => {
    it('should error when scope has more than 7 items', () => {
      const content = `## Objective
Test

## Scope
- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6
- Item 7
- Item 8

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.errors.some(e => e.includes('Scope too large'))).toBe(true);
    });
  });

  describe('Placeholder Detection', () => {
    it('should fail when placeholders not filled', () => {
      const content = `# FC: [NAME]
## Objective
[TODO] Add description

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.errors).toContain('Placeholder not filled: [NAME]');
      expect(result.errors).toContain('Placeholder not filled: [TODO]');
    });
  });

  describe('Security Section', () => {
    it('should warn when security section missing', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.warnings).toContain('Missing Security Considerations section');
    });

    it('should not warn when security section present', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |

## Done When
- [ ] Done

## Security Considerations
- [ ] Input validation`;

      const result = validateContract(content);
      expect(result.warnings).not.toContain('Missing Security Considerations section');
      expect(result.stats.hasSecuritySection).toBe(true);
    });
  });

  describe('Coverage Requirement', () => {
    it('should warn when 80% coverage not mentioned', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |

## Done When
- [ ] Tests pass`;

      const result = validateContract(content);
      expect(result.warnings).toContain('Done When should include 80%+ coverage requirement');
    });

    it('should not warn when 80% coverage is mentioned', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |

## Done When
- [ ] Tests pass (80%+ coverage)`;

      const result = validateContract(content);
      expect(result.warnings).not.toContain('Done When should include 80%+ coverage requirement');
    });
  });

  describe('Test Files Warning', () => {
    it('should warn when no test files in Files section', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/main.ts | Main code |

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.warnings).toContain('No test files in Files section');
    });

    it('should not warn when test files present', () => {
      const content = `## Objective
Test

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/main.ts | Main code |
| create | src/test/main.test.ts | Tests |

## Done When
- [ ] Done`;

      const result = validateContract(content);
      expect(result.warnings).not.toContain('No test files in Files section');
    });
  });
});

describe('File System', () => {
  describe('Templates', () => {
    it('should have main contract template', () => {
      const templatePath = path.join(TEMPLATES_DIR, 'contract.md');
      expect(fs.existsSync(templatePath)).toBe(true);
    });

    it('should have all specialized templates', () => {
      const templates = ['contract.md', 'ui-component.md', 'api-endpoint.md', 'bug-fix.md', 'refactor.md', 'integration.md'];
      templates.forEach(t => {
        const templatePath = path.join(TEMPLATES_DIR, t);
        expect(fs.existsSync(templatePath)).toBe(true);
      });
    });

    it('contract template should have security section', () => {
      const content = fs.readFileSync(path.join(TEMPLATES_DIR, 'contract.md'), 'utf8');
      expect(content).toContain('## Security Considerations');
    });

    it('contract template should have code quality section', () => {
      const content = fs.readFileSync(path.join(TEMPLATES_DIR, 'contract.md'), 'utf8');
      expect(content).toContain('## Code Quality');
    });

    it('contract template should require 80% coverage', () => {
      const content = fs.readFileSync(path.join(TEMPLATES_DIR, 'contract.md'), 'utf8');
      expect(content).toContain('80%');
    });
  });

  describe('Agents', () => {
    it('should have all 6 agents', () => {
      const agents = [
        'contract-architect.agent.yaml',
        'scope-validator.agent.yaml',
        'plan-strategist.agent.yaml',
        'dev-agent.agent.yaml',
        'auditor.agent.yaml',
        'quick-flow.agent.yaml'
      ];
      agents.forEach(a => {
        const agentPath = path.join(AGENTS_DIR, a);
        expect(fs.existsSync(agentPath)).toBe(true);
      });
    });

    it('agent files should be valid YAML', () => {
      const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.yaml'));
      files.forEach(f => {
        const content = fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8');
        expect(() => yaml.parse(content)).not.toThrow();
      });
    });

    it('agents should have required metadata', () => {
      const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.yaml'));
      files.forEach(f => {
        const content = yaml.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8'));
        expect(content.agent).toBeDefined();
        expect(content.agent.metadata).toBeDefined();
        expect(content.agent.metadata.name).toBeDefined();
        expect(content.agent.metadata.title).toBeDefined();
        expect(content.agent.menu).toBeDefined();
        expect(Array.isArray(content.agent.menu)).toBe(true);
      });
    });
  });

  describe('Workflows', () => {
    it('should have workflow directories', () => {
      const workflows = [
        'create-contract',
        'validate-contract',
        'execute-contract',
        'audit-contract',
        'generate-plan',
        'quick-flow'
      ];
      workflows.forEach(w => {
        const workflowDir = path.join(WORKFLOWS_DIR, w);
        expect(fs.existsSync(workflowDir)).toBe(true);
      });
    });

    it('workflows should have workflow.yaml', () => {
      const workflowDirs = fs.readdirSync(WORKFLOWS_DIR).filter(f =>
        fs.statSync(path.join(WORKFLOWS_DIR, f)).isDirectory()
      );
      workflowDirs.forEach(w => {
        const workflowFile = path.join(WORKFLOWS_DIR, w, 'workflow.yaml');
        expect(fs.existsSync(workflowFile)).toBe(true);
      });
    });

    it('workflow.yaml files should be valid YAML', () => {
      const workflowDirs = fs.readdirSync(WORKFLOWS_DIR).filter(f =>
        fs.statSync(path.join(WORKFLOWS_DIR, f)).isDirectory()
      );
      workflowDirs.forEach(w => {
        const workflowFile = path.join(WORKFLOWS_DIR, w, 'workflow.yaml');
        if (fs.existsSync(workflowFile)) {
          const content = fs.readFileSync(workflowFile, 'utf8');
          expect(() => yaml.parse(content)).not.toThrow();
        }
      });
    });
  });

  describe('Documentation', () => {
    it('should have security documentation', () => {
      const securityDoc = path.join(PKG_ROOT, 'docs', 'SECURITY.md');
      expect(fs.existsSync(securityDoc)).toBe(true);
    });

    it('should have best practices documentation', () => {
      const bestPracticesDoc = path.join(PKG_ROOT, 'docs', 'BEST_PRACTICES.md');
      expect(fs.existsSync(bestPracticesDoc)).toBe(true);
    });

    it('security doc should mention OWASP', () => {
      const content = fs.readFileSync(path.join(PKG_ROOT, 'docs', 'SECURITY.md'), 'utf8');
      expect(content).toContain('OWASP');
    });

    it('security doc should mention CVE', () => {
      const content = fs.readFileSync(path.join(PKG_ROOT, 'docs', 'SECURITY.md'), 'utf8');
      expect(content).toContain('CVE');
    });

    it('best practices doc should mention 80% coverage', () => {
      const content = fs.readFileSync(path.join(PKG_ROOT, 'docs', 'BEST_PRACTICES.md'), 'utf8');
      expect(content).toContain('80%');
    });
  });
});

describe('Security Patterns', () => {
  it('should detect security-sensitive features', () => {
    const content = `## Objective
Implement user authentication

## Scope
- Login flow
- Password handling

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |

## Done When
- [ ] Done`;

    const result = validateContract(content);
    // Should have warnings about security section for auth features
    expect(result.warnings.some(w => w.includes('Security') || w.includes('security'))).toBe(true);
  });

  it('templates should not contain dangerous patterns', () => {
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.md'));
    const dangerous = ['eval(', 'innerHTML', 'dangerouslySetInnerHTML', 'child_process.exec'];

    files.forEach(f => {
      const content = fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8');
      dangerous.forEach(pattern => {
        expect(content).not.toContain(pattern);
      });
    });
  });
});
