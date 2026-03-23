const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  resolveRuleset,
  resolveRulesetChain,
  loadRulesetById,
  getSourcePriority,
  PRIORITY_LEVELS,
} = require('../../lib/rulesets/resolver.cjs');

describe('resolver', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-resolver-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('loadRulesetById', () => {
    it('loads ruleset from local directory', () => {
      const rulesetDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'languages');
      fs.mkdirSync(rulesetDir, { recursive: true });
      fs.writeFileSync(path.join(rulesetDir, 'dotnet.md'), `---
id: languages/dotnet
scope: global
---
# RULESET: .NET`);

      const result = loadRulesetById('languages/dotnet', testDir);

      expect(result).not.toBeNull();
      expect(result.content).toContain('# RULESET: .NET');
      expect(result.priority).toBe(PRIORITY_LEVELS['repo-local']);
    });

    it('returns null for non-existent ruleset', () => {
      const result = loadRulesetById('nonexistent/ruleset', testDir);
      expect(result).toBeNull();
    });

    it('checks multiple locations', () => {
      const sharedDir = path.join(testDir, '.grabby', 'rulesets', 'shared', 'policies');
      fs.mkdirSync(sharedDir, { recursive: true });
      fs.writeFileSync(path.join(sharedDir, 'security.md'), '# RULESET: Security');

      const result = loadRulesetById('policies/security', testDir);

      expect(result).not.toBeNull();
    });
  });

  describe('resolveRuleset', () => {
    it('resolves single ruleset without dependencies', () => {
      const rulesetDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'languages');
      fs.mkdirSync(rulesetDir, { recursive: true });
      fs.writeFileSync(path.join(rulesetDir, 'typescript.md'), `---
id: languages/typescript
scope: global
kind: language
---
# RULESET: TypeScript

## Standards
- Use strict mode`);

      const { resolved, errors } = resolveRuleset('languages/typescript', testDir);

      expect(errors).toHaveLength(0);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe('languages/typescript');
    });

    it('resolves extends chain', () => {
      const langDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'languages');
      const policyDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'policies');
      fs.mkdirSync(langDir, { recursive: true });
      fs.mkdirSync(policyDir, { recursive: true });

      fs.writeFileSync(path.join(policyDir, 'security.md'), `---
id: policies/security
scope: global
---
# RULESET: Security

## Standards
- Validate input`);

      fs.writeFileSync(path.join(langDir, 'typescript.md'), `---
id: languages/typescript
scope: global
extends:
  - policies/security
---
# RULESET: TypeScript

## Standards
- Use strict mode`);

      const { resolved, errors } = resolveRuleset('languages/typescript', testDir);

      expect(errors).toHaveLength(0);
      expect(resolved).toHaveLength(2);
      expect(resolved.map(r => r.id)).toContain('policies/security');
      expect(resolved.map(r => r.id)).toContain('languages/typescript');
    });

    it('detects circular dependencies', () => {
      const langDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'languages');
      fs.mkdirSync(langDir, { recursive: true });

      fs.writeFileSync(path.join(langDir, 'a.md'), `---
id: languages/a
extends:
  - languages/b
---
# RULESET: A`);

      fs.writeFileSync(path.join(langDir, 'b.md'), `---
id: languages/b
extends:
  - languages/a
---
# RULESET: B`);

      const { errors } = resolveRuleset('languages/a', testDir);

      expect(errors.some(e => e.includes('Circular dependency'))).toBe(true);
    });

    it('reports missing rulesets', () => {
      const langDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'languages');
      fs.mkdirSync(langDir, { recursive: true });

      fs.writeFileSync(path.join(langDir, 'typescript.md'), `---
id: languages/typescript
extends:
  - policies/nonexistent
---
# RULESET: TypeScript`);

      const { errors } = resolveRuleset('languages/typescript', testDir);

      expect(errors.some(e => e.includes('not found'))).toBe(true);
    });

    it('respects max depth limit', () => {
      const langDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'languages');
      fs.mkdirSync(langDir, { recursive: true });

      // Create deep chain
      for (let i = 0; i < 15; i++) {
        const extends_ = i < 14 ? `\nextends:\n  - languages/level${i + 1}` : '';
        fs.writeFileSync(path.join(langDir, `level${i}.md`), `---
id: languages/level${i}${extends_}
---
# RULESET: Level ${i}`);
      }

      const { errors } = resolveRuleset('languages/level0', testDir);

      expect(errors.some(e => e.includes('Maximum resolution depth'))).toBe(true);
    });
  });

  describe('resolveRulesetChain', () => {
    it('resolves multiple rulesets', () => {
      const langDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'languages');
      fs.mkdirSync(langDir, { recursive: true });

      fs.writeFileSync(path.join(langDir, 'typescript.md'), `---
id: languages/typescript
priority: 100
---
# RULESET: TypeScript`);

      fs.writeFileSync(path.join(langDir, 'javascript.md'), `---
id: languages/javascript
priority: 50
---
# RULESET: JavaScript`);

      const { chain, errors } = resolveRulesetChain(
        ['languages/typescript', 'languages/javascript'],
        testDir
      );

      expect(errors).toHaveLength(0);
      expect(chain).toHaveLength(2);
    });

    it('sorts by priority', () => {
      const langDir = path.join(testDir, '.grabby', 'rulesets', 'local', 'languages');
      fs.mkdirSync(langDir, { recursive: true });

      fs.writeFileSync(path.join(langDir, 'high.md'), `---
id: languages/high
priority: 500
---
# RULESET: High Priority`);

      fs.writeFileSync(path.join(langDir, 'low.md'), `---
id: languages/low
priority: 100
---
# RULESET: Low Priority`);

      const { chain } = resolveRulesetChain(
        ['languages/high', 'languages/low'],
        testDir
      );

      // Lower priority first (so higher can override later)
      expect(chain[0].id).toBe('languages/low');
      expect(chain[1].id).toBe('languages/high');
    });
  });

  describe('getSourcePriority', () => {
    it('returns correct priority for local rulesets', () => {
      expect(getSourcePriority('.grabby/rulesets/local/test.md', testDir))
        .toBe(PRIORITY_LEVELS['repo-local']);
    });

    it('returns correct priority for cached rulesets', () => {
      expect(getSourcePriority('.grabby/rulesets/cache/central/test.md', testDir))
        .toBe(PRIORITY_LEVELS['org-central']);
    });

    it('returns correct priority for templates', () => {
      expect(getSourcePriority('templates/rulesets/test.md', testDir))
        .toBe(PRIORITY_LEVELS['built-in']);
    });
  });

  describe('PRIORITY_LEVELS', () => {
    it('has correct ordering', () => {
      expect(PRIORITY_LEVELS['repo-local']).toBeGreaterThan(PRIORITY_LEVELS['user-global']);
      expect(PRIORITY_LEVELS['user-global']).toBeGreaterThan(PRIORITY_LEVELS['org-central']);
      expect(PRIORITY_LEVELS['org-central']).toBeGreaterThan(PRIORITY_LEVELS['built-in']);
    });
  });
});
