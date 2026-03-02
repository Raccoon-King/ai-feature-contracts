/**
 * Grabby - Feature Chat Tests
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const featureChat = require('../lib/feature-chat.cjs');
const features = require('../lib/features.cjs');

// Temp directory for tests
let tempDir;
let featuresDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-feature-chat-test-'));
  featuresDir = path.join(tempDir, '.grabby', 'features');
  fs.mkdirSync(featuresDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// ============================================================================
// CONSTANTS
// ============================================================================

describe('Constants', () => {
  describe('STATUSES', () => {
    it('should include all valid statuses', () => {
      expect(featureChat.STATUSES).toContain('proposed');
      expect(featureChat.STATUSES).toContain('approved');
      expect(featureChat.STATUSES).toContain('in-progress');
      expect(featureChat.STATUSES).toContain('completed');
      expect(featureChat.STATUSES).toContain('deprecated');
    });

    it('should have exactly 5 statuses', () => {
      expect(featureChat.STATUSES.length).toBe(5);
    });
  });

  describe('PRIORITIES', () => {
    it('should include all valid priorities', () => {
      expect(featureChat.PRIORITIES).toContain('low');
      expect(featureChat.PRIORITIES).toContain('medium');
      expect(featureChat.PRIORITIES).toContain('high');
      expect(featureChat.PRIORITIES).toContain('critical');
    });

    it('should have exactly 4 priorities', () => {
      expect(featureChat.PRIORITIES.length).toBe(4);
    });
  });
});

// ============================================================================
// DISPLAY FEATURE
// ============================================================================

describe('displayFeature', () => {
  it('should display feature without throwing', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Test Feature',
      status: 'proposed',
      description: 'A test feature',
      tags: ['test', 'demo'],
      contracts: ['FC-123'],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should display feature in verbose mode', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Test Feature',
      status: 'in-progress',
      description: 'A test feature',
      tags: [],
      contracts: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      enhancements: [
        { id: 'ENH-001', description: 'Enhancement 1', status: 'proposed' },
      ],
      notes: 'Some notes here',
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature, true)).not.toThrow();

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('FEAT-001');
    expect(output).toContain('Test Feature');
    consoleSpy.mockRestore();
  });

  it('should handle feature with all status types', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    featureChat.STATUSES.forEach((status) => {
      const feature = {
        id: `FEAT-${status}`,
        name: `${status} Feature`,
        status,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      expect(() => featureChat.displayFeature(feature)).not.toThrow();
    });

    consoleSpy.mockRestore();
  });

  it('should handle feature without optional fields', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Minimal Feature',
      status: 'proposed',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature)).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('should handle feature with empty arrays', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Empty Arrays Feature',
      status: 'proposed',
      tags: [],
      contracts: [],
      enhancements: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature, true)).not.toThrow();
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// DISPLAY FEATURES SUMMARY
// ============================================================================

describe('displayFeaturesSummary', () => {
  it('should display summary without features', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeaturesSummary(tempDir)).not.toThrow();

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No features tracked');
    consoleSpy.mockRestore();
  });

  it('should display summary with features', () => {
    // Add a feature first
    features.addFeature(
      {
        name: 'Test Feature',
        description: 'A test',
        status: 'proposed',
        tags: ['test'],
      },
      tempDir
    );

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeaturesSummary(tempDir)).not.toThrow();

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Test Feature');
    consoleSpy.mockRestore();
  });

  it('should group features by status', () => {
    features.addFeature({ name: 'Proposed Feature', status: 'proposed' }, tempDir);
    features.addFeature({ name: 'Approved Feature', status: 'approved' }, tempDir);
    features.addFeature({ name: 'Completed Feature', status: 'completed' }, tempDir);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    featureChat.displayFeaturesSummary(tempDir);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('PROPOSED');
    expect(output).toContain('APPROVED');
    expect(output).toContain('COMPLETED');
    consoleSpy.mockRestore();
  });

  it('should show enhancement count', () => {
    const feat = features.addFeature({ name: 'Feature with Enhancements', status: 'proposed' }, tempDir);
    features.addEnhancement(feat.id, { description: 'Enhancement 1', priority: 'medium' }, tempDir);
    features.addEnhancement(feat.id, { description: 'Enhancement 2', priority: 'high' }, tempDir);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    featureChat.displayFeaturesSummary(tempDir);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('+2 enhancements');
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// INTEGRATION WITH FEATURES MODULE
// ============================================================================

describe('Integration with features module', () => {
  it('should work with features.addFeature', () => {
    const feature = features.addFeature(
      {
        name: 'Integration Test Feature',
        description: 'Testing integration',
        status: 'proposed',
        tags: ['integration', 'test'],
      },
      tempDir
    );

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature)).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('should work with features.getFeature', () => {
    const created = features.addFeature(
      {
        name: 'Get Test Feature',
        description: 'Testing get',
        status: 'approved',
      },
      tempDir
    );

    const retrieved = features.getFeature(created.id, tempDir);
    expect(retrieved).not.toBeNull();

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(retrieved, true)).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('should work with features with enhancements', () => {
    const feat = features.addFeature({ name: 'Enhanced Feature', status: 'in-progress' }, tempDir);
    features.addEnhancement(feat.id, { description: 'First enhancement', priority: 'high' }, tempDir);
    features.addEnhancement(feat.id, { description: 'Second enhancement', priority: 'low' }, tempDir);

    const updated = features.getFeature(feat.id, tempDir);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(updated, true)).not.toThrow();

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('First enhancement');
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// COLOR HANDLING
// ============================================================================

describe('Color Handling', () => {
  it('should apply correct color for proposed status', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Proposed Feature',
      status: 'proposed',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    featureChat.displayFeature(feature);

    // Check that yellow color code is used for proposed
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('\x1b[33m'); // Yellow
    consoleSpy.mockRestore();
  });

  it('should apply correct color for completed status', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Completed Feature',
      status: 'completed',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    featureChat.displayFeature(feature);

    // Check that green color code is used for completed
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('\x1b[32m'); // Green
    consoleSpy.mockRestore();
  });

  it('should apply correct color for deprecated status', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Deprecated Feature',
      status: 'deprecated',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    featureChat.displayFeature(feature);

    // Check that gray color code is used for deprecated
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('\x1b[90m'); // Gray
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle feature with unknown status', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Unknown Status Feature',
      status: 'unknown-status',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature)).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('should handle feature with very long name', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'A'.repeat(200),
      status: 'proposed',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature)).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('should handle feature with special characters in name', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Feature <with> "special" & characters',
      status: 'proposed',
      description: 'Description with\nnewlines\tand\ttabs',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature)).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('should handle feature with many tags', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Many Tags Feature',
      status: 'proposed',
      tags: Array.from({ length: 50 }, (_, i) => `tag-${i}`),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature)).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('should handle feature with many enhancements in verbose mode', () => {
    const feature = {
      id: 'FEAT-001',
      name: 'Many Enhancements Feature',
      status: 'in-progress',
      enhancements: Array.from({ length: 20 }, (_, i) => ({
        id: `ENH-${i}`,
        description: `Enhancement ${i}`,
        status: 'proposed',
      })),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeature(feature, true)).not.toThrow();
    consoleSpy.mockRestore();
  });

  it('should handle empty base directory gracefully', () => {
    const emptyDir = path.join(tempDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    expect(() => featureChat.displayFeaturesSummary(emptyDir)).not.toThrow();
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// FUNCTION EXPORTS
// ============================================================================

describe('Module Exports', () => {
  it('should export interactiveAddFeature', () => {
    expect(typeof featureChat.interactiveAddFeature).toBe('function');
  });

  it('should export interactiveEnhance', () => {
    expect(typeof featureChat.interactiveEnhance).toBe('function');
  });

  it('should export startChatSession', () => {
    expect(typeof featureChat.startChatSession).toBe('function');
  });

  it('should export displayFeature', () => {
    expect(typeof featureChat.displayFeature).toBe('function');
  });

  it('should export displayFeaturesSummary', () => {
    expect(typeof featureChat.displayFeaturesSummary).toBe('function');
  });

  it('should export STATUSES', () => {
    expect(Array.isArray(featureChat.STATUSES)).toBe(true);
  });

  it('should export PRIORITIES', () => {
    expect(Array.isArray(featureChat.PRIORITIES)).toBe(true);
  });
});
