const {
  parseRuleset,
  parseExtends,
  mergeRulesets,
  validateRulesetContent,
  resolveLocalRuleset,
  listRulesets,
  generateContractGuidance,
} = require('../lib/ruleset-registry.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('ruleset-registry', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruleset-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('parseExtends', () => {
    it('parses single extends declaration', () => {
      const content = `# RULESET: my-rules
extends: core-typescript@v1

## Purpose
- Custom rules
`;
      expect(parseExtends(content)).toEqual(['core-typescript@v1']);
    });

    it('parses multiple extends declarations', () => {
      const content = `# RULESET: my-rules
extends: core-typescript@v1, api-safety@v2, security@v1

## Purpose
- Custom rules
`;
      expect(parseExtends(content)).toEqual(['core-typescript@v1', 'api-safety@v2', 'security@v1']);
    });

    it('returns empty array when no extends', () => {
      const content = `# RULESET: standalone
## Purpose
- No inheritance
`;
      expect(parseExtends(content)).toEqual([]);
    });
  });

  describe('parseRuleset', () => {
    it('parses ruleset name', () => {
      const content = `# RULESET: my-project-rules

## Purpose
- Project standards
`;
      const parsed = parseRuleset(content, 'test.md');
      expect(parsed.name).toBe('my-project-rules');
    });

    it('extracts sections as bullet points', () => {
      const content = `# RULESET: test-rules

## Purpose
- Define coding standards
- Ensure consistency

## Standards
- Use TypeScript strict mode
- No any types
- 80% test coverage

## Security
- Validate all user input
- Use parameterized queries

## Quality Gates
- All tests must pass
- ESLint must pass
`;
      const parsed = parseRuleset(content, 'test.md');
      expect(parsed.sections.purpose).toEqual(['Define coding standards', 'Ensure consistency']);
      expect(parsed.sections.standards).toEqual(['Use TypeScript strict mode', 'No any types', '80% test coverage']);
      expect(parsed.sections.security).toEqual(['Validate all user input', 'Use parameterized queries']);
      expect(parsed.sections.quality).toEqual(['All tests must pass', 'ESLint must pass']);
    });

    it('parses extends declaration', () => {
      const content = `# RULESET: child-rules
extends: parent@v1

## Purpose
- Extend parent
`;
      const parsed = parseRuleset(content, 'test.md');
      expect(parsed.extends).toEqual(['parent@v1']);
    });

    it('extracts contract guidance section', () => {
      const content = `# RULESET: guided-rules

## Contract Guidance
- Always include security section for auth features
- Require API impact section for endpoint changes
- Maximum 10 files per contract
`;
      const parsed = parseRuleset(content, 'test.md');
      expect(parsed.sections.contractGuidance).toEqual([
        'Always include security section for auth features',
        'Require API impact section for endpoint changes',
        'Maximum 10 files per contract',
      ]);
    });
  });

  describe('mergeRulesets', () => {
    it('merges parent and child sections', () => {
      const parent = {
        name: 'parent',
        source: 'parent.md',
        extends: [],
        sections: {
          purpose: ['Parent purpose'],
          standards: ['Parent standard 1', 'Parent standard 2'],
          security: ['Parent security'],
          quality: [],
          nonGoals: [],
          references: [],
          contractGuidance: [],
        },
      };

      const child = {
        name: 'child',
        source: 'child.md',
        extends: ['parent@v1'],
        sections: {
          purpose: ['Child purpose'],
          standards: ['Child standard'],
          security: [],
          quality: ['Child quality'],
          nonGoals: [],
          references: [],
          contractGuidance: [],
        },
      };

      const merged = mergeRulesets(parent, child);
      expect(merged.name).toBe('child');
      expect(merged.sections.purpose).toContain('Parent purpose');
      expect(merged.sections.purpose).toContain('Child purpose');
      expect(merged.sections.standards).toContain('Parent standard 1');
      expect(merged.sections.standards).toContain('Child standard');
      expect(merged.sections.security).toContain('Parent security');
      expect(merged.sections.quality).toContain('Child quality');
    });

    it('child overrides parent rules with same prefix', () => {
      const parent = {
        name: 'parent',
        source: 'parent.md',
        extends: [],
        sections: {
          purpose: [],
          standards: ['Max file size: 300 lines', 'Use const'],
          security: [],
          quality: [],
          nonGoals: [],
          references: [],
          contractGuidance: [],
        },
      };

      const child = {
        name: 'child',
        source: 'child.md',
        extends: [],
        sections: {
          purpose: [],
          standards: ['Max file size: 500 lines'],
          security: [],
          quality: [],
          nonGoals: [],
          references: [],
          contractGuidance: [],
        },
      };

      const merged = mergeRulesets(parent, child);
      expect(merged.sections.standards).toContain('Max file size: 500 lines');
      expect(merged.sections.standards).not.toContain('Max file size: 300 lines');
      expect(merged.sections.standards).toContain('Use const');
    });

    it('tracks inheritance chain', () => {
      const grandparent = {
        name: 'grandparent',
        source: 'gp.md',
        extends: [],
        sections: { purpose: [], standards: [], security: [], quality: [], nonGoals: [], references: [], contractGuidance: [] },
        inheritedFrom: [],
      };

      const parent = mergeRulesets(grandparent, {
        name: 'parent',
        source: 'p.md',
        extends: ['grandparent'],
        sections: { purpose: [], standards: [], security: [], quality: [], nonGoals: [], references: [], contractGuidance: [] },
      });

      const child = mergeRulesets(parent, {
        name: 'child',
        source: 'c.md',
        extends: ['parent'],
        sections: { purpose: [], standards: [], security: [], quality: [], nonGoals: [], references: [], contractGuidance: [] },
      });

      expect(child.inheritedFrom).toContain('parent');
      expect(child.inheritedFrom).toContain('grandparent');
    });
  });

  describe('validateRulesetContent', () => {
    it('accepts valid ruleset content', () => {
      const content = `# RULESET: valid
## Standards
- Use TypeScript
`;
      expect(() => validateRulesetContent(content)).not.toThrow();
    });

    it('rejects content with script tags', () => {
      const content = `# RULESET: bad
<script>alert('xss')</script>
## Standards
- Use TypeScript
`;
      expect(() => validateRulesetContent(content)).toThrow(/unsafe content/);
    });

    it('rejects content with javascript: urls', () => {
      const content = `# RULESET: bad
## Standards
- [link](javascript:alert('xss'))
`;
      expect(() => validateRulesetContent(content)).toThrow(/unsafe content/);
    });

    it('rejects content without ruleset structure', () => {
      const content = `# Just a README
This is not a ruleset.
`;
      expect(() => validateRulesetContent(content)).toThrow(/not.*valid ruleset/);
    });
  });

  describe('resolveLocalRuleset', () => {
    it('finds ruleset in .grabby/rulesets', () => {
      const rulesetDir = path.join(tempDir, '.grabby', 'rulesets');
      fs.mkdirSync(rulesetDir, { recursive: true });
      fs.writeFileSync(path.join(rulesetDir, 'my-rules.ruleset.md'), `# RULESET: my-rules
## Standards
- Test rule
`);

      const result = resolveLocalRuleset('my-rules', tempDir);
      expect(result).not.toBeNull();
      expect(result.content).toContain('my-rules');
      expect(result.local).toBe(true);
    });

    it('finds ruleset in docs/rulesets', () => {
      const rulesetDir = path.join(tempDir, 'docs', 'rulesets');
      fs.mkdirSync(rulesetDir, { recursive: true });
      fs.writeFileSync(path.join(rulesetDir, 'shared.ruleset.md'), `# RULESET: shared
## Standards
- Shared rule
`);

      const result = resolveLocalRuleset('shared', tempDir);
      expect(result).not.toBeNull();
      expect(result.content).toContain('shared');
    });

    it('finds built-in RULESET_*.md files', () => {
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'RULESET_API_COMPAT.md'), `# RULESET: api-compat
## Standards
- API compatibility
`);

      const result = resolveLocalRuleset('api-compat', tempDir);
      expect(result).not.toBeNull();
      expect(result.content).toContain('api-compat');
    });

    it('returns null for non-existent ruleset', () => {
      const result = resolveLocalRuleset('non-existent', tempDir);
      expect(result).toBeNull();
    });
  });

  describe('listRulesets', () => {
    it('lists rulesets from all locations', () => {
      // Create local ruleset
      const localDir = path.join(tempDir, '.grabby', 'rulesets');
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(path.join(localDir, 'local.ruleset.md'), `# RULESET: local-rules
## Standards
- Local
`);

      // Create shared ruleset
      const sharedDir = path.join(tempDir, 'docs', 'rulesets');
      fs.mkdirSync(sharedDir, { recursive: true });
      fs.writeFileSync(path.join(sharedDir, 'shared.ruleset.md'), `# RULESET: shared-rules
## Standards
- Shared
`);

      // Create built-in ruleset
      const docsDir = path.join(tempDir, 'docs');
      fs.writeFileSync(path.join(docsDir, 'RULESET_CORE.md'), `# RULESET: core
## Standards
- Core
`);

      const rulesets = listRulesets(tempDir);
      expect(rulesets.length).toBe(3);
      expect(rulesets.some(r => r.type === 'local')).toBe(true);
      expect(rulesets.some(r => r.type === 'shared')).toBe(true);
      expect(rulesets.some(r => r.type === 'builtin')).toBe(true);
    });

    it('includes extends information', () => {
      const localDir = path.join(tempDir, '.grabby', 'rulesets');
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(path.join(localDir, 'child.ruleset.md'), `# RULESET: child
extends: parent@v1, base@v2

## Standards
- Child rules
`);

      const rulesets = listRulesets(tempDir);
      const child = rulesets.find(r => r.name === 'child');
      expect(child.extends).toEqual(['parent@v1', 'base@v2']);
    });
  });

  describe('generateContractGuidance', () => {
    it('generates guidance from resolved ruleset', () => {
      const resolved = {
        name: 'test-rules',
        source: 'test.md',
        sections: {
          purpose: [],
          standards: ['Use TypeScript strict mode', 'No any types'],
          security: ['Validate user input'],
          quality: ['80% test coverage'],
          nonGoals: [],
          references: [],
          contractGuidance: ['Always include security section'],
        },
      };

      const guidance = generateContractGuidance(resolved);
      expect(guidance).toContain('## Required Standards');
      expect(guidance).toContain('Use TypeScript strict mode');
      expect(guidance).toContain('## Security Requirements');
      expect(guidance).toContain('Validate user input');
      expect(guidance).toContain('## Quality Gates');
      expect(guidance).toContain('80% test coverage');
      expect(guidance).toContain('## Contract Guidance');
      expect(guidance).toContain('Always include security section');
    });

    it('omits empty sections', () => {
      const resolved = {
        name: 'minimal',
        source: 'min.md',
        sections: {
          purpose: [],
          standards: ['One rule'],
          security: [],
          quality: [],
          nonGoals: [],
          references: [],
          contractGuidance: [],
        },
      };

      const guidance = generateContractGuidance(resolved);
      expect(guidance).toContain('One rule');
      expect(guidance).not.toContain('## Security Requirements');
      expect(guidance).not.toContain('## Quality Gates');
    });
  });
});
