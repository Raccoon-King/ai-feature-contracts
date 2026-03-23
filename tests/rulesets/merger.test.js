const {
  mergeRulesets,
  evaluateConditions,
  extractSection,
  standardKey,
  formatEffectiveRules,
  getEffectiveRules,
} = require('../../lib/rulesets/merger.cjs');

describe('merger', () => {
  describe('extractSection', () => {
    it('extracts standards section', () => {
      const content = `# RULESET: Test

## Standards
- Use strict mode
- Follow naming conventions

## Non-Goals
- Not this`;

      const standards = extractSection(content, 'Standards');

      expect(standards).toHaveLength(2);
      expect(standards).toContain('Use strict mode');
      expect(standards).toContain('Follow naming conventions');
    });

    it('handles missing section', () => {
      const content = '# RULESET: Test\n\n## Purpose\n- Some purpose';
      const standards = extractSection(content, 'Standards');

      expect(standards).toEqual([]);
    });

    it('handles asterisk bullets', () => {
      const content = `## Standards
* Item one
* Item two`;

      const standards = extractSection(content, 'Standards');

      expect(standards).toHaveLength(2);
    });

    it('handles section with suffix', () => {
      const content = `## Security & Quality Gates
- Validate input
- Run tests`;

      const security = extractSection(content, 'Security');

      expect(security).toHaveLength(2);
    });
  });

  describe('standardKey', () => {
    it('creates key from first words', () => {
      expect(standardKey('Use strict mode always')).toBe('use-strict-mode');
      expect(standardKey('Validate: all user input')).toBe('validate');
    });

    it('normalizes case', () => {
      expect(standardKey('Use Strict Mode')).toBe('use-strict-mode');
    });

    it('handles special characters', () => {
      expect(standardKey('Don\'t use eval()')).toBe('dont-use-eval');
    });
  });

  describe('evaluateConditions', () => {
    it('returns true for null/undefined appliesWhen', () => {
      expect(evaluateConditions(null, {})).toBe(true);
      expect(evaluateConditions(undefined, {})).toBe(true);
    });

    it('returns true for empty conditions', () => {
      expect(evaluateConditions({ any: [] }, {})).toBe(true);
    });

    it('evaluates pathPrefix condition', () => {
      const appliesWhen = { any: [{ pathPrefix: 'src/' }] };

      expect(evaluateConditions(appliesWhen, { path: 'src/components' })).toBe(true);
      expect(evaluateConditions(appliesWhen, { path: 'lib/utils' })).toBe(false);
    });

    it('evaluates repoSignal condition', () => {
      const appliesWhen = { any: [{ repoSignal: 'typescript' }] };

      expect(evaluateConditions(appliesWhen, { signals: ['typescript', 'react'] })).toBe(true);
      expect(evaluateConditions(appliesWhen, { signals: ['javascript'] })).toBe(false);
    });

    it('handles any mode (OR)', () => {
      const appliesWhen = {
        any: [{ pathPrefix: 'src/' }, { repoSignal: 'typescript' }],
      };

      expect(evaluateConditions(appliesWhen, { path: 'src/test', signals: [] })).toBe(true);
      expect(evaluateConditions(appliesWhen, { path: 'lib/test', signals: ['typescript'] })).toBe(true);
      expect(evaluateConditions(appliesWhen, { path: 'lib/test', signals: [] })).toBe(false);
    });

    it('handles all mode (AND)', () => {
      const appliesWhen = {
        all: [{ pathPrefix: 'src/' }, { repoSignal: 'typescript' }],
      };

      expect(evaluateConditions(appliesWhen, { path: 'src/test', signals: ['typescript'] })).toBe(true);
      expect(evaluateConditions(appliesWhen, { path: 'src/test', signals: [] })).toBe(false);
    });
  });

  describe('mergeRulesets', () => {
    it('merges standards from multiple rulesets', () => {
      const rulesets = [
        {
          id: 'base/rules',
          priority: 0,
          content: `# RULESET: Base
## Standards
- Base standard`,
          metadata: {},
        },
        {
          id: 'local/rules',
          priority: 100,
          content: `# RULESET: Local
## Standards
- Local standard`,
          metadata: {},
        },
      ];

      const merged = mergeRulesets(rulesets);

      expect(merged.standards).toHaveLength(2);
      expect(merged.sources).toEqual(['base/rules', 'local/rules']);
    });

    it('higher priority overrides lower', () => {
      const rulesets = [
        {
          id: 'base/rules',
          priority: 0,
          content: `# RULESET: Base
## Standards
- Use: old approach`,
          metadata: {},
        },
        {
          id: 'local/rules',
          priority: 100,
          content: `# RULESET: Local
## Standards
- Use: new approach`,
          metadata: {},
        },
      ];

      const merged = mergeRulesets(rulesets);

      // Same key "use" should be overridden
      const useStandard = merged.standards.find(s => s.value.startsWith('Use:'));
      expect(useStandard.source).toBe('local/rules');
    });

    it('tracks conflicts', () => {
      const rulesets = [
        {
          id: 'base/rules',
          priority: 0,
          content: `# RULESET: Base
## Standards
- Use: old approach`,
          metadata: {},
        },
        {
          id: 'local/rules',
          priority: 100,
          content: `# RULESET: Local
## Standards
- Use: new approach`,
          metadata: {},
        },
      ];

      const merged = mergeRulesets(rulesets);

      expect(merged.conflicts).toHaveLength(1);
      expect(merged.conflicts[0].from).toBe('base/rules');
      expect(merged.conflicts[0].to).toBe('local/rules');
    });

    it('respects appliesWhen conditions', () => {
      const rulesets = [
        {
          id: 'always/rules',
          priority: 0,
          content: `# RULESET: Always
## Standards
- Always applied`,
          metadata: {},
        },
        {
          id: 'conditional/rules',
          priority: 100,
          content: `# RULESET: Conditional
## Standards
- Only for src`,
          metadata: {
            appliesWhen: { any: [{ pathPrefix: 'src/' }] },
          },
        },
      ];

      const mergedNoMatch = mergeRulesets(rulesets, { path: 'lib/test' });
      const mergedMatch = mergeRulesets(rulesets, { path: 'src/test' });

      expect(mergedNoMatch.standards).toHaveLength(1);
      expect(mergedMatch.standards).toHaveLength(2);
    });

    it('accumulates purpose and nonGoals', () => {
      const rulesets = [
        {
          id: 'base',
          priority: 0,
          content: `# RULESET: Base
## Purpose
- Base purpose

## Non-Goals
- Base non-goal`,
          metadata: {},
        },
        {
          id: 'local',
          priority: 100,
          content: `# RULESET: Local
## Purpose
- Local purpose`,
          metadata: {},
        },
      ];

      const merged = mergeRulesets(rulesets);

      expect(merged.purpose).toHaveLength(2);
      expect(merged.nonGoals).toHaveLength(1);
    });
  });

  describe('formatEffectiveRules', () => {
    it('formats empty rules', () => {
      const output = formatEffectiveRules({ sources: [], standards: [], conflicts: [] });
      expect(output).toContain('No applicable rulesets');
    });

    it('includes resolution chain', () => {
      const output = formatEffectiveRules({
        sources: ['base/rules', 'local/rules'],
        standards: [{ value: 'Use strict', source: 'local/rules' }],
        securityGates: [],
        conflicts: [],
      });

      expect(output).toContain('Resolution chain');
      expect(output).toContain('base/rules');
      expect(output).toContain('local/rules');
    });

    it('shows standards with sources', () => {
      const output = formatEffectiveRules({
        sources: ['local/rules'],
        standards: [{ value: 'Use strict mode', source: 'local/rules' }],
        securityGates: [],
        conflicts: [],
      });

      expect(output).toContain('Standards');
      expect(output).toContain('Use strict mode');
    });
  });

  describe('getEffectiveRules', () => {
    it('returns structured response', () => {
      const rulesets = [
        {
          id: 'test/rules',
          priority: 0,
          content: '# RULESET: Test\n## Standards\n- Test standard',
          metadata: {},
        },
      ];

      const result = getEffectiveRules(rulesets, { path: 'src/' });

      expect(result.context).toEqual({ path: 'src/' });
      expect(result.resolution).toBeDefined();
      expect(result.resolution.chain).toContain('test/rules');
    });
  });
});
