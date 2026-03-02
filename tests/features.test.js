/**
 * Grabby - Features Module Tests
 * Comprehensive regression tests for the feature management system
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const features = require('../lib/features.cjs');

describe('Features Module', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-features-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initFeaturesFile', () => {
    it('should create .grabby directory if it does not exist', () => {
      features.initFeaturesFile(tempDir);
      expect(fs.existsSync(path.join(tempDir, '.grabby'))).toBe(true);
    });

    it('should create features.yaml file with initial structure', () => {
      const filePath = features.initFeaturesFile(tempDir);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = yaml.parse(fs.readFileSync(filePath, 'utf8'));
      expect(content.version).toBe('1.0');
      expect(content.features).toEqual([]);
      expect(content.lastUpdated).toBeDefined();
    });

    it('should not overwrite existing features file', () => {
      const grabbyDir = path.join(tempDir, '.grabby');
      fs.mkdirSync(grabbyDir, { recursive: true });

      const existingData = {
        version: '1.0',
        features: [{ id: 'F-001', name: 'Existing' }],
        lastUpdated: '2024-01-01T00:00:00.000Z'
      };
      fs.writeFileSync(
        path.join(grabbyDir, 'features.yaml'),
        yaml.stringify(existingData),
        'utf8'
      );

      features.initFeaturesFile(tempDir);

      const content = yaml.parse(
        fs.readFileSync(path.join(grabbyDir, 'features.yaml'), 'utf8')
      );
      expect(content.features).toHaveLength(1);
      expect(content.features[0].name).toBe('Existing');
    });
  });

  describe('loadFeatures', () => {
    it('should load features from file', () => {
      features.initFeaturesFile(tempDir);
      const data = features.loadFeatures(tempDir);

      expect(data.version).toBe('1.0');
      expect(data.features).toEqual([]);
    });

    it('should initialize file if it does not exist', () => {
      const data = features.loadFeatures(tempDir);

      expect(data.version).toBe('1.0');
      expect(fs.existsSync(path.join(tempDir, '.grabby', 'features.yaml'))).toBe(true);
    });
  });

  describe('saveFeatures', () => {
    it('should save features to file with updated timestamp', () => {
      const data = {
        version: '1.0',
        features: [{ id: 'F-001', name: 'Test Feature' }]
      };

      features.saveFeatures(data, tempDir);

      const savedContent = yaml.parse(
        fs.readFileSync(path.join(tempDir, '.grabby', 'features.yaml'), 'utf8')
      );
      expect(savedContent.features).toHaveLength(1);
      expect(savedContent.lastUpdated).toBeDefined();
    });
  });

  describe('sanitizeName', () => {
    it('should remove special characters', () => {
      expect(features.sanitizeName('test<script>name')).toBe('testscriptname');
      expect(features.sanitizeName('test:file/path')).toBe('testfilepath');
    });

    it('should remove directory traversal patterns', () => {
      expect(features.sanitizeName('../../../etc/passwd')).toBe('etcpasswd');
    });

    it('should trim whitespace', () => {
      expect(features.sanitizeName('  test name  ')).toBe('test name');
    });

    it('should truncate to 100 characters', () => {
      const longName = 'a'.repeat(150);
      expect(features.sanitizeName(longName)).toHaveLength(100);
    });

    it('should handle empty string', () => {
      expect(features.sanitizeName('')).toBe('');
    });
  });

  describe('addFeature', () => {
    it('should add a new feature with generated ID', () => {
      const feature = features.addFeature({
        name: 'New Feature',
        description: 'A test feature'
      }, tempDir);

      expect(feature.id).toBe('F-001');
      expect(feature.name).toBe('New Feature');
      expect(feature.description).toBe('A test feature');
      expect(feature.status).toBe('proposed');
      expect(feature.created).toBeDefined();
    });

    it('should increment feature IDs correctly', () => {
      features.addFeature({ name: 'Feature 1' }, tempDir);
      features.addFeature({ name: 'Feature 2' }, tempDir);
      const third = features.addFeature({ name: 'Feature 3' }, tempDir);

      expect(third.id).toBe('F-003');
    });

    it('should sanitize feature names', () => {
      const feature = features.addFeature({
        name: 'Test<script>Feature'
      }, tempDir);

      expect(feature.name).toBe('TestscriptFeature');
    });

    it('should accept custom status', () => {
      const feature = features.addFeature({
        name: 'In Progress Feature',
        status: 'in-progress'
      }, tempDir);

      expect(feature.status).toBe('in-progress');
    });

    it('should accept tags', () => {
      const feature = features.addFeature({
        name: 'Tagged Feature',
        tags: ['auth', 'security']
      }, tempDir);

      expect(feature.tags).toEqual(['auth', 'security']);
    });

    it('should persist feature to file', () => {
      features.addFeature({ name: 'Persisted Feature' }, tempDir);

      const data = features.loadFeatures(tempDir);
      expect(data.features).toHaveLength(1);
      expect(data.features[0].name).toBe('Persisted Feature');
    });
  });

  describe('getFeature', () => {
    it('should return feature by ID', () => {
      features.addFeature({ name: 'Find Me' }, tempDir);

      const found = features.getFeature('F-001', tempDir);
      expect(found).toBeDefined();
      expect(found.name).toBe('Find Me');
    });

    it('should return undefined for non-existent ID', () => {
      const found = features.getFeature('F-999', tempDir);
      expect(found).toBeUndefined();
    });
  });

  describe('updateFeature', () => {
    it('should update feature properties', () => {
      features.addFeature({ name: 'Original Name' }, tempDir);

      const updated = features.updateFeature('F-001', {
        name: 'Updated Name',
        status: 'completed'
      }, tempDir);

      expect(updated.name).toBe('Updated Name');
      expect(updated.status).toBe('completed');
    });

    it('should sanitize updated names', () => {
      features.addFeature({ name: 'Original' }, tempDir);

      const updated = features.updateFeature('F-001', {
        name: 'New<unsafe>Name'
      }, tempDir);

      expect(updated.name).toBe('NewunsafeName');
    });

    it('should update timestamp', () => {
      features.addFeature({ name: 'Test' }, tempDir);
      const original = features.getFeature('F-001', tempDir);

      // Wait briefly to ensure timestamp differs
      const updated = features.updateFeature('F-001', {
        description: 'Updated'
      }, tempDir);

      expect(new Date(updated.updated).getTime()).toBeGreaterThanOrEqual(
        new Date(original.updated).getTime()
      );
    });

    it('should throw error for non-existent feature', () => {
      expect(() => features.updateFeature('F-999', { name: 'Test' }, tempDir))
        .toThrow('Feature F-999 not found');
    });

    it('should persist updates to file', () => {
      features.addFeature({ name: 'Test' }, tempDir);
      features.updateFeature('F-001', { status: 'completed' }, tempDir);

      const data = features.loadFeatures(tempDir);
      expect(data.features[0].status).toBe('completed');
    });
  });

  describe('deleteFeature', () => {
    it('should remove feature from list', () => {
      features.addFeature({ name: 'To Delete' }, tempDir);
      features.deleteFeature('F-001', tempDir);

      const data = features.loadFeatures(tempDir);
      expect(data.features).toHaveLength(0);
    });

    it('should return deleted feature', () => {
      features.addFeature({ name: 'To Delete' }, tempDir);
      const deleted = features.deleteFeature('F-001', tempDir);

      expect(deleted.name).toBe('To Delete');
    });

    it('should throw error for non-existent feature', () => {
      expect(() => features.deleteFeature('F-999', tempDir))
        .toThrow('Feature F-999 not found');
    });
  });

  describe('listFeatures', () => {
    beforeEach(() => {
      features.addFeature({ name: 'Feature 1', status: 'proposed', tags: ['auth'] }, tempDir);
      features.addFeature({ name: 'Feature 2', status: 'completed', tags: ['ui'] }, tempDir);
      features.addFeature({ name: 'Feature 3', status: 'proposed', tags: ['auth', 'security'] }, tempDir);
    });

    it('should return all features without filters', () => {
      const list = features.listFeatures(tempDir);
      expect(list).toHaveLength(3);
    });

    it('should filter by status', () => {
      const list = features.listFeatures(tempDir, { status: 'proposed' });
      expect(list).toHaveLength(2);
    });

    it('should filter by tag', () => {
      const list = features.listFeatures(tempDir, { tag: 'auth' });
      expect(list).toHaveLength(2);
    });

    it('should filter by search term in name', () => {
      const list = features.listFeatures(tempDir, { search: 'Feature 2' });
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Feature 2');
    });

    it('should return empty array for no matches', () => {
      const list = features.listFeatures(tempDir, { status: 'deprecated' });
      expect(list).toHaveLength(0);
    });
  });

  describe('searchFeatures', () => {
    it('should search by name', () => {
      features.addFeature({ name: 'Login Feature' }, tempDir);
      features.addFeature({ name: 'Dashboard Feature' }, tempDir);

      const results = features.searchFeatures('Login', tempDir);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Login Feature');
    });

    it('should search by description', () => {
      features.addFeature({
        name: 'Feature A',
        description: 'Handles user authentication'
      }, tempDir);

      const results = features.searchFeatures('authentication', tempDir);
      expect(results).toHaveLength(1);
    });

    it('should be case insensitive', () => {
      features.addFeature({ name: 'LOGIN Feature' }, tempDir);

      const results = features.searchFeatures('login', tempDir);
      expect(results).toHaveLength(1);
    });
  });

  describe('addEnhancement', () => {
    it('should add enhancement to feature', () => {
      features.addFeature({ name: 'Base Feature' }, tempDir);

      const enhancement = features.addEnhancement('F-001', {
        description: 'Add caching support'
      }, tempDir);

      expect(enhancement.id).toBe('E-001');
      expect(enhancement.description).toBe('Add caching support');
      expect(enhancement.status).toBe('proposed');
    });

    it('should increment enhancement IDs', () => {
      features.addFeature({ name: 'Base Feature' }, tempDir);
      features.addEnhancement('F-001', { description: 'Enhancement 1' }, tempDir);
      const second = features.addEnhancement('F-001', { description: 'Enhancement 2' }, tempDir);

      expect(second.id).toBe('E-002');
    });

    it('should update feature timestamp', () => {
      features.addFeature({ name: 'Base Feature' }, tempDir);
      const original = features.getFeature('F-001', tempDir);

      features.addEnhancement('F-001', { description: 'New' }, tempDir);
      const updated = features.getFeature('F-001', tempDir);

      expect(new Date(updated.updated).getTime()).toBeGreaterThanOrEqual(
        new Date(original.updated).getTime()
      );
    });

    it('should throw error for non-existent feature', () => {
      expect(() => features.addEnhancement('F-999', { description: 'Test' }, tempDir))
        .toThrow('Feature F-999 not found');
    });

    it('should persist enhancements', () => {
      features.addFeature({ name: 'Base Feature' }, tempDir);
      features.addEnhancement('F-001', { description: 'Persisted' }, tempDir);

      const data = features.loadFeatures(tempDir);
      expect(data.features[0].enhancements).toHaveLength(1);
    });
  });

  describe('linkContract', () => {
    it('should link contract to feature', () => {
      features.addFeature({ name: 'Feature' }, tempDir);
      features.linkContract('F-001', 'FC-123', tempDir);

      const feature = features.getFeature('F-001', tempDir);
      expect(feature.contracts).toContain('FC-123');
    });

    it('should not duplicate contract links', () => {
      features.addFeature({ name: 'Feature' }, tempDir);
      features.linkContract('F-001', 'FC-123', tempDir);
      features.linkContract('F-001', 'FC-123', tempDir);

      const feature = features.getFeature('F-001', tempDir);
      expect(feature.contracts.filter(c => c === 'FC-123')).toHaveLength(1);
    });

    it('should throw error for non-existent feature', () => {
      expect(() => features.linkContract('F-999', 'FC-123', tempDir))
        .toThrow('Feature F-999 not found');
    });
  });

  describe('discoverFeatures', () => {
    function writeContract(dir, name, content) {
      const contractsDir = path.join(dir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, name), content, 'utf8');
    }

    it('should discover features from contracts', () => {
      writeContract(tempDir, 'login.fc.md', `# Feature Contract: Login Feature
**ID:** FC-001 | **Status:** approved

## Objective
Implement user login functionality.
`);

      const discovered = features.discoverFeatures(tempDir);
      expect(discovered).toHaveLength(1);
      expect(discovered[0].name).toBe('Login Feature');
      expect(discovered[0].contracts).toContain('FC-001');
    });

    it('should map contract status to feature status', () => {
      writeContract(tempDir, 'completed.fc.md', `# Feature Contract: Done
**ID:** FC-002 | **Status:** completed

## Objective
Completed feature.
`);

      const discovered = features.discoverFeatures(tempDir);
      expect(discovered[0].status).toBe('completed');
    });

    it('should return empty array if no contracts directory', () => {
      const discovered = features.discoverFeatures(tempDir);
      expect(discovered).toHaveLength(0);
    });

    it('should only process .fc.md files', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'README.md'), '# Readme', 'utf8');

      const discovered = features.discoverFeatures(tempDir);
      expect(discovered).toHaveLength(0);
    });
  });

  describe('importDiscoveredFeatures', () => {
    function writeContract(dir, name, content) {
      const contractsDir = path.join(dir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, name), content, 'utf8');
    }

    it('should import discovered features', () => {
      writeContract(tempDir, 'new.fc.md', `# Feature Contract: New Feature
**ID:** FC-001 | **Status:** draft

## Objective
New feature.
`);

      const imported = features.importDiscoveredFeatures(tempDir);
      expect(imported).toHaveLength(1);

      const all = features.listFeatures(tempDir);
      expect(all).toHaveLength(1);
    });

    it('should skip features already linked to contracts', () => {
      writeContract(tempDir, 'existing.fc.md', `# Feature Contract: Existing
**ID:** FC-001 | **Status:** draft

## Objective
Existing.
`);

      // Manually add feature with contract link
      features.addFeature({
        name: 'Already Exists',
        contracts: ['FC-001']
      }, tempDir);

      const imported = features.importDiscoveredFeatures(tempDir);
      expect(imported).toHaveLength(0);

      const all = features.listFeatures(tempDir);
      expect(all).toHaveLength(1);
    });
  });

  describe('getFeatureStats', () => {
    it('should return zero stats for empty features', () => {
      const stats = features.getFeatureStats(tempDir);

      expect(stats.total).toBe(0);
      expect(stats.byStatus).toEqual({});
      expect(stats.withEnhancements).toBe(0);
    });

    it('should count features by status', () => {
      features.addFeature({ name: 'F1', status: 'proposed' }, tempDir);
      features.addFeature({ name: 'F2', status: 'proposed' }, tempDir);
      features.addFeature({ name: 'F3', status: 'completed' }, tempDir);

      const stats = features.getFeatureStats(tempDir);

      expect(stats.total).toBe(3);
      expect(stats.byStatus.proposed).toBe(2);
      expect(stats.byStatus.completed).toBe(1);
    });

    it('should count features with enhancements', () => {
      features.addFeature({ name: 'F1' }, tempDir);
      features.addFeature({ name: 'F2' }, tempDir);
      features.addEnhancement('F-001', { description: 'E1' }, tempDir);
      features.addEnhancement('F-001', { description: 'E2' }, tempDir);

      const stats = features.getFeatureStats(tempDir);

      expect(stats.withEnhancements).toBe(1);
      expect(stats.totalEnhancements).toBe(2);
    });

    it('should count features linked to contracts', () => {
      features.addFeature({ name: 'F1', contracts: ['FC-001'] }, tempDir);
      features.addFeature({ name: 'F2' }, tempDir);

      const stats = features.getFeatureStats(tempDir);

      expect(stats.linkedToContracts).toBe(1);
    });
  });

  describe('getAllTags', () => {
    it('should return empty array for no features', () => {
      const tags = features.getAllTags(tempDir);
      expect(tags).toEqual([]);
    });

    it('should return unique tags sorted', () => {
      features.addFeature({ name: 'F1', tags: ['zulu', 'alpha'] }, tempDir);
      features.addFeature({ name: 'F2', tags: ['beta', 'alpha'] }, tempDir);

      const tags = features.getAllTags(tempDir);
      expect(tags).toEqual(['alpha', 'beta', 'zulu']);
    });

    it('should handle features without tags', () => {
      features.addFeature({ name: 'F1' }, tempDir);
      features.addFeature({ name: 'F2', tags: ['test'] }, tempDir);

      const tags = features.getAllTags(tempDir);
      expect(tags).toEqual(['test']);
    });
  });
});
