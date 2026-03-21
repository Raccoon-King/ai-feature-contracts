const {
  validateVersion,
  validateISODate,
  validateRulesetMetadata,
  validateCategory,
  validatePreset,
  validateManifest,
  parseManifestString,
  findRuleset,
  getAllRulesets,
  resolvePreset,
  hasCategory,
  getCategory,
  listCategories,
  listPresets
} = require('../lib/manifest-parser.cjs');

describe('manifest-parser', () => {
  describe('validateVersion', () => {
    test('accepts valid semantic version', () => {
      expect(validateVersion('1.0.0')).toBe(true);
      expect(validateVersion('0.1.0')).toBe(true);
      expect(validateVersion('10.20.30')).toBe(true);
    });

    test('rejects invalid version format', () => {
      expect(() => validateVersion('1.0')).toThrow('Invalid version format');
      expect(() => validateVersion('v1.0.0')).toThrow('Invalid version format');
      expect(() => validateVersion(123)).toThrow('version must be a string');
    });
  });

  describe('validateISODate', () => {
    test('accepts valid ISO date', () => {
      expect(validateISODate('2026-03-20T10:30:00Z')).toBe(true);
      expect(validateISODate('2026-03-20T10:30:00.000Z')).toBe(true);
    });

    test('rejects invalid date format', () => {
      expect(() => validateISODate('not a date')).toThrow('Invalid date');
      expect(() => validateISODate('invalid')).toThrow('Invalid date');
      expect(() => validateISODate(123)).toThrow('must be a string');
    });
  });

  describe('validateRulesetMetadata', () => {
    test('accepts valid ruleset', () => {
      const ruleset = {
        name: 'typescript',
        version: '1.0.0',
        tags: ['frontend'],
        extends: ['languages/javascript']
      };
      expect(validateRulesetMetadata(ruleset, 'languages')).toBe(true);
    });

    test('rejects ruleset without name', () => {
      const ruleset = { version: '1.0.0' };
      expect(() => validateRulesetMetadata(ruleset, 'languages')).toThrow('missing required field: name');
    });

    test('rejects ruleset without version', () => {
      const ruleset = { name: 'typescript' };
      expect(() => validateRulesetMetadata(ruleset, 'languages')).toThrow('missing required field: version');
    });

    test('rejects invalid extends format', () => {
      const ruleset = {
        name: 'typescript',
        version: '1.0.0',
        extends: ['invalid-format']
      };
      expect(() => validateRulesetMetadata(ruleset, 'languages')).toThrow('invalid extends reference');
    });
  });

  describe('validateCategory', () => {
    test('accepts valid category', () => {
      const category = {
        description: 'Programming languages',
        rulesets: [
          { name: 'typescript', version: '1.0.0' }
        ]
      };
      expect(validateCategory(category, 'languages')).toBe(true);
    });

    test('rejects category without description', () => {
      const category = {
        rulesets: [{ name: 'typescript', version: '1.0.0' }]
      };
      expect(() => validateCategory(category, 'languages')).toThrow('missing required field: description');
    });

    test('rejects category without rulesets array', () => {
      const category = { description: 'Languages' };
      expect(() => validateCategory(category, 'languages')).toThrow('missing required field: rulesets');
    });
  });

  describe('validatePreset', () => {
    test('accepts valid preset', () => {
      const preset = {
        description: 'Full-stack TypeScript',
        includes: ['languages/typescript', 'frameworks/react']
      };
      expect(validatePreset(preset, 'fullstack-typescript')).toBe(true);
    });

    test('rejects preset without description', () => {
      const preset = { includes: ['languages/typescript'] };
      expect(() => validatePreset(preset, 'test')).toThrow('missing required field: description');
    });

    test('rejects preset without includes', () => {
      const preset = { description: 'Test preset' };
      expect(() => validatePreset(preset, 'test')).toThrow('missing required field: includes');
    });

    test('rejects invalid includes format', () => {
      const preset = {
        description: 'Test',
        includes: ['invalid-format']
      };
      expect(() => validatePreset(preset, 'test')).toThrow('invalid includes reference');
    });
  });

  describe('validateManifest', () => {
    test('accepts valid manifest', () => {
      const manifest = {
        version: '1.0.0',
        lastUpdated: '2026-03-20T10:30:00Z',
        categories: {
          languages: {
            description: 'Programming languages',
            rulesets: [
              { name: 'typescript', version: '1.0.0' }
            ]
          }
        }
      };
      expect(validateManifest(manifest)).toBe(true);
    });

    test('rejects manifest without version', () => {
      const manifest = {
        lastUpdated: '2026-03-20T10:30:00Z',
        categories: {}
      };
      expect(() => validateManifest(manifest)).toThrow('missing required field: version');
    });

    test('rejects manifest without lastUpdated', () => {
      const manifest = {
        version: '1.0.0',
        categories: {}
      };
      expect(() => validateManifest(manifest)).toThrow('missing required field: lastUpdated');
    });

    test('rejects manifest without categories', () => {
      const manifest = {
        version: '1.0.0',
        lastUpdated: '2026-03-20T10:30:00Z'
      };
      expect(() => validateManifest(manifest)).toThrow('missing required field: categories');
    });
  });

  describe('parseManifestString', () => {
    test('parses valid YAML manifest', () => {
      const yaml = `
version: "1.0.0"
lastUpdated: "2026-03-20T10:30:00Z"
categories:
  languages:
    description: "Programming languages"
    rulesets:
      - name: typescript
        version: "1.0.0"
`;
      const manifest = parseManifestString(yaml);
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.categories.languages).toBeDefined();
    });

    test('rejects invalid YAML', () => {
      const invalidYaml = '{ invalid yaml: [';
      expect(() => parseManifestString(invalidYaml)).toThrow('Failed to parse manifest YAML');
    });

    test('rejects empty string', () => {
      expect(() => parseManifestString('')).toThrow('must be a non-empty string');
    });
  });

  describe('findRuleset', () => {
    const manifest = {
      version: '1.0.0',
      lastUpdated: '2026-03-20T10:30:00Z',
      categories: {
        languages: {
          description: 'Languages',
          rulesets: [
            { name: 'typescript', version: '1.0.0' },
            { name: 'javascript', version: '1.0.0' }
          ]
        }
      }
    };

    test('finds existing ruleset', () => {
      const ruleset = findRuleset(manifest, 'languages', 'typescript');
      expect(ruleset).toBeDefined();
      expect(ruleset.name).toBe('typescript');
    });

    test('returns null for non-existent ruleset', () => {
      const ruleset = findRuleset(manifest, 'languages', 'python');
      expect(ruleset).toBeNull();
    });

    test('returns null for non-existent category', () => {
      const ruleset = findRuleset(manifest, 'frameworks', 'react');
      expect(ruleset).toBeNull();
    });
  });

  describe('getAllRulesets', () => {
    const manifest = {
      version: '1.0.0',
      lastUpdated: '2026-03-20T10:30:00Z',
      categories: {
        languages: {
          description: 'Languages',
          rulesets: [
            { name: 'typescript', version: '1.0.0' }
          ]
        },
        frameworks: {
          description: 'Frameworks',
          rulesets: [
            { name: 'react', version: '1.0.0' }
          ]
        }
      }
    };

    test('returns all rulesets with category prefix', () => {
      const rulesets = getAllRulesets(manifest);
      expect(rulesets).toHaveLength(2);
      expect(rulesets[0].ref).toBe('languages/typescript');
      expect(rulesets[1].ref).toBe('frameworks/react');
    });
  });

  describe('resolvePreset', () => {
    const manifest = {
      version: '1.0.0',
      lastUpdated: '2026-03-20T10:30:00Z',
      categories: {
        languages: {
          description: 'Languages',
          rulesets: [{ name: 'typescript', version: '1.0.0' }]
        }
      },
      presets: {
        'fullstack-typescript': {
          description: 'Full-stack TypeScript',
          includes: ['languages/typescript']
        }
      }
    };

    test('resolves valid preset', () => {
      const preset = resolvePreset(manifest, 'fullstack-typescript');
      expect(preset.name).toBe('fullstack-typescript');
      expect(preset.includes).toContain('languages/typescript');
    });

    test('throws for non-existent preset', () => {
      expect(() => resolvePreset(manifest, 'invalid')).toThrow('Preset not found');
    });

    test('throws for preset with invalid reference', () => {
      const invalidManifest = {
        ...manifest,
        presets: {
          invalid: {
            description: 'Invalid',
            includes: ['languages/python']
          }
        }
      };
      expect(() => resolvePreset(invalidManifest, 'invalid')).toThrow('references non-existent ruleset');
    });
  });

  describe('hasCategory', () => {
    const manifest = {
      version: '1.0.0',
      lastUpdated: '2026-03-20T10:30:00Z',
      categories: {
        languages: {
          description: 'Languages',
          rulesets: []
        }
      }
    };

    test('returns true for existing category', () => {
      expect(hasCategory(manifest, 'languages')).toBe(true);
    });

    test('returns false for non-existent category', () => {
      expect(hasCategory(manifest, 'frameworks')).toBe(false);
    });
  });

  describe('getCategory', () => {
    const manifest = {
      version: '1.0.0',
      lastUpdated: '2026-03-20T10:30:00Z',
      categories: {
        languages: {
          description: 'Languages',
          extensible: true,
          rulesets: []
        }
      }
    };

    test('returns category info for existing category', () => {
      const category = getCategory(manifest, 'languages');
      expect(category.name).toBe('languages');
      expect(category.description).toBe('Languages');
      expect(category.extensible).toBe(true);
    });

    test('returns null for non-existent category', () => {
      expect(getCategory(manifest, 'frameworks')).toBeNull();
    });
  });

  describe('listCategories', () => {
    const manifest = {
      version: '1.0.0',
      lastUpdated: '2026-03-20T10:30:00Z',
      categories: {
        languages: {
          description: 'Languages',
          rulesets: [
            { name: 'typescript', version: '1.0.0' }
          ]
        },
        frameworks: {
          description: 'Frameworks',
          extensible: true,
          rulesets: []
        }
      }
    };

    test('lists all categories with metadata', () => {
      const categories = listCategories(manifest);
      expect(categories).toHaveLength(2);
      expect(categories[0].name).toBe('languages');
      expect(categories[0].rulesetCount).toBe(1);
      expect(categories[1].extensible).toBe(true);
    });
  });

  describe('listPresets', () => {
    const manifest = {
      version: '1.0.0',
      lastUpdated: '2026-03-20T10:30:00Z',
      categories: {},
      presets: {
        'fullstack-typescript': {
          description: 'Full-stack TypeScript',
          includes: ['languages/typescript', 'frameworks/react']
        }
      }
    };

    test('lists all presets with metadata', () => {
      const presets = listPresets(manifest);
      expect(presets).toHaveLength(1);
      expect(presets[0].name).toBe('fullstack-typescript');
      expect(presets[0].includesCount).toBe(2);
    });

    test('returns empty array if no presets', () => {
      const manifestNoPresets = {
        ...manifest,
        presets: undefined
      };
      const presets = listPresets(manifestNoPresets);
      expect(presets).toEqual([]);
    });
  });
});
