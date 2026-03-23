const {
  parseFrontmatter,
  validateFrontmatter,
  extractMetadata,
  parseRulesetWithFrontmatter,
  renderFrontmatter,
  DEFAULT_METADATA,
  VALID_SCOPES,
  VALID_KINDS,
} = require('../../lib/rulesets/frontmatter.cjs');

describe('frontmatter', () => {
  describe('parseFrontmatter', () => {
    it('parses valid YAML frontmatter', () => {
      const content = `---
id: languages/dotnet
scope: global
kind: language
---

# RULESET: .NET

## Purpose
- Standards for .NET`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({
        id: 'languages/dotnet',
        scope: 'global',
        kind: 'language',
      });
      expect(result.content).toContain('# RULESET: .NET');
      expect(result.content).not.toContain('id: languages/dotnet');
    });

    it('returns empty data for content without frontmatter', () => {
      const content = `# RULESET: No Frontmatter

## Purpose
- Just markdown`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({});
      expect(result.content).toBe(content);
    });

    it('handles empty frontmatter', () => {
      const content = `---
---

# RULESET: Empty Frontmatter`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({});
      expect(result.content).toContain('# RULESET: Empty Frontmatter');
    });

    it('handles invalid YAML gracefully', () => {
      const content = `---
invalid: yaml: content: here
  bad indentation
---

# RULESET: Bad YAML`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({});
      expect(result.parseError).toBeDefined();
    });

    it('handles non-string input', () => {
      expect(parseFrontmatter(null).data).toEqual({});
      expect(parseFrontmatter(undefined).data).toEqual({});
      expect(parseFrontmatter(123).data).toEqual({});
    });

    it('parses complex frontmatter with arrays and nested objects', () => {
      const content = `---
id: frameworks/react
scope: global
signals:
  any:
    - glob: "**/*.jsx"
      weight: 0.8
    - packageDep: react
extends:
  - languages/typescript
  - policies/security
---

# RULESET: React`;

      const result = parseFrontmatter(content);

      expect(result.data.id).toBe('frameworks/react');
      expect(result.data.signals.any).toHaveLength(2);
      expect(result.data.signals.any[0].glob).toBe('**/*.jsx');
      expect(result.data.extends).toEqual(['languages/typescript', 'policies/security']);
    });
  });

  describe('validateFrontmatter', () => {
    it('validates correct frontmatter', () => {
      const data = {
        id: 'languages/dotnet',
        scope: 'global',
        kind: 'language',
        priority: 100,
      };

      const result = validateFrontmatter(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for empty data', () => {
      expect(validateFrontmatter({}).valid).toBe(true);
      expect(validateFrontmatter(null).valid).toBe(true);
    });

    it('warns on non-standard id format', () => {
      const data = { id: 'invalid-id-format' };
      const result = validateFrontmatter(data);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('id should follow category/name format (e.g., "languages/dotnet")');
    });

    it('errors on invalid scope', () => {
      const data = { scope: 'invalid' };
      const result = validateFrontmatter(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('scope must be one of'))).toBe(true);
    });

    it('errors on invalid kind', () => {
      const data = { kind: 'invalid' };
      const result = validateFrontmatter(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('kind must be one of'))).toBe(true);
    });

    it('errors on non-integer priority', () => {
      const data = { priority: 1.5 };
      const result = validateFrontmatter(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('priority must be an integer'))).toBe(true);
    });

    it('validates signals structure', () => {
      const data = {
        signals: {
          any: [{ glob: '**/*.ts' }, { file: 'tsconfig.json', weight: 0.8 }],
        },
      };

      const result = validateFrontmatter(data);
      expect(result.valid).toBe(true);
    });

    it('errors on invalid signal properties', () => {
      const data = {
        signals: {
          any: [{ unknownProp: 'value' }],
        },
      };

      const result = validateFrontmatter(data);
      expect(result.valid).toBe(false);
    });

    it('errors on invalid extends type', () => {
      const data = { extends: 'not-an-array' };
      const result = validateFrontmatter(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('extends must be an array'))).toBe(true);
    });

    it('validates appliesWhen conditions', () => {
      const data = {
        appliesWhen: {
          any: [{ pathPrefix: 'src/' }, { repoSignal: 'dotnet' }],
        },
      };

      const result = validateFrontmatter(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('extractMetadata', () => {
    it('extracts all metadata fields', () => {
      const data = {
        id: 'local/my-rules',
        scope: 'local',
        kind: 'domain',
        priority: 50,
        signals: { any: [{ file: 'test.txt' }] },
        extends: ['base/rules'],
        include: ['languages/typescript'],
        appliesWhen: { any: [{ pathPrefix: 'src/' }] },
      };

      const metadata = extractMetadata(data);

      expect(metadata.id).toBe('local/my-rules');
      expect(metadata.scope).toBe('local');
      expect(metadata.kind).toBe('domain');
      expect(metadata.priority).toBe(50);
      expect(metadata.signals).toEqual({ any: [{ file: 'test.txt' }] });
      expect(metadata.extends).toEqual(['base/rules']);
      expect(metadata.include).toEqual(['languages/typescript']);
      expect(metadata.appliesWhen).toEqual({ any: [{ pathPrefix: 'src/' }] });
    });

    it('applies defaults for missing fields', () => {
      const metadata = extractMetadata({});

      expect(metadata).toEqual(DEFAULT_METADATA);
    });

    it('applies defaults for null input', () => {
      const metadata = extractMetadata(null);

      expect(metadata).toEqual(DEFAULT_METADATA);
    });

    it('uses defaults for invalid scope/kind', () => {
      const data = { scope: 'invalid', kind: 'invalid' };
      const metadata = extractMetadata(data);

      expect(metadata.scope).toBe('local');
      expect(metadata.kind).toBe('domain');
    });
  });

  describe('parseRulesetWithFrontmatter', () => {
    it('parses complete ruleset with frontmatter', () => {
      const content = `---
id: languages/dotnet
scope: global
kind: language
priority: 100
---

# RULESET: .NET

## Purpose
- Standards for C#`;

      const result = parseRulesetWithFrontmatter(content);

      expect(result.metadata.id).toBe('languages/dotnet');
      expect(result.metadata.scope).toBe('global');
      expect(result.metadata.kind).toBe('language');
      expect(result.metadata.priority).toBe(100);
      expect(result.content).toContain('# RULESET: .NET');
      expect(result.validation.valid).toBe(true);
    });

    it('handles ruleset without frontmatter', () => {
      const content = `# RULESET: Legacy

## Purpose
- Old format`;

      const result = parseRulesetWithFrontmatter(content);

      expect(result.metadata).toEqual(DEFAULT_METADATA);
      expect(result.content).toBe(content);
      expect(result.validation.valid).toBe(true);
    });

    it('reports validation errors', () => {
      const content = `---
scope: invalid-scope
kind: invalid-kind
---

# RULESET: Invalid`;

      const result = parseRulesetWithFrontmatter(content);

      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('renderFrontmatter', () => {
    it('renders metadata to YAML frontmatter', () => {
      const metadata = {
        id: 'languages/dotnet',
        scope: 'global',
        kind: 'language',
      };

      const result = renderFrontmatter(metadata);

      expect(result).toContain('---');
      expect(result).toContain('id: languages/dotnet');
      expect(result).toContain('scope: global');
      expect(result).toContain('kind: language');
    });

    it('returns empty string for empty metadata', () => {
      expect(renderFrontmatter({})).toBe('');
      expect(renderFrontmatter(null)).toBe('');
    });

    it('filters out null and empty values', () => {
      const metadata = {
        id: 'test/rule',
        scope: null,
        extends: [],
      };

      const result = renderFrontmatter(metadata);

      expect(result).toContain('id: test/rule');
      expect(result).not.toContain('scope');
      expect(result).not.toContain('extends');
    });
  });

  describe('constants', () => {
    it('exports valid scopes', () => {
      expect(VALID_SCOPES).toContain('global');
      expect(VALID_SCOPES).toContain('local');
    });

    it('exports valid kinds', () => {
      expect(VALID_KINDS).toContain('language');
      expect(VALID_KINDS).toContain('framework');
      expect(VALID_KINDS).toContain('domain');
      expect(VALID_KINDS).toContain('policy');
    });
  });
});
