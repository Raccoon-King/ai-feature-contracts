/**
 * Tests for Feature Management System
 */

const fs = require('fs');
const path = require('path');
const features = require('../lib/features.cjs');

// Test directory
const TEST_DIR = path.join(__dirname, '.test-features');
const FEATURES_PATH = path.join(TEST_DIR, '.grabby', 'features.yaml');

// Setup and teardown
function setup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    setup();
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  } finally {
    teardown();
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(arr, item, message = '') {
  if (!arr.includes(item)) {
    throw new Error(`${message} Expected array to include ${item}`);
  }
}

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(message || 'Expected true');
  }
}

// Tests
console.log('\nFeature Management Tests\n');

test('initFeaturesFile creates .grabby directory and features.yaml', () => {
  const filePath = features.initFeaturesFile(TEST_DIR);
  assertTrue(fs.existsSync(filePath), 'Features file should exist');
  assertTrue(fs.existsSync(path.join(TEST_DIR, '.grabby')), '.grabby dir should exist');
});

test('loadFeatures returns empty features array for new file', () => {
  const data = features.loadFeatures(TEST_DIR);
  assertEqual(data.version, '1.0', 'Version');
  assertEqual(data.features.length, 0, 'Features count');
});

test('addFeature creates a new feature with correct ID', () => {
  const feature = features.addFeature({
    name: 'Test Feature',
    description: 'A test description'
  }, TEST_DIR);

  assertEqual(feature.id, 'F-001', 'Feature ID');
  assertEqual(feature.name, 'Test Feature', 'Feature name');
  assertEqual(feature.status, 'proposed', 'Default status');
});

test('addFeature sanitizes feature name', () => {
  const feature = features.addFeature({
    name: 'Test<>:"/\\|?*..',
  }, TEST_DIR);

  assertEqual(feature.name, 'Test', 'Sanitized name');
});

test('addFeature generates sequential IDs', () => {
  const f1 = features.addFeature({ name: 'Feature 1' }, TEST_DIR);
  const f2 = features.addFeature({ name: 'Feature 2' }, TEST_DIR);
  const f3 = features.addFeature({ name: 'Feature 3' }, TEST_DIR);

  assertEqual(f1.id, 'F-001', 'First ID');
  assertEqual(f2.id, 'F-002', 'Second ID');
  assertEqual(f3.id, 'F-003', 'Third ID');
});

test('getFeature retrieves feature by ID', () => {
  features.addFeature({ name: 'Find Me' }, TEST_DIR);
  const found = features.getFeature('F-001', TEST_DIR);

  assertEqual(found.name, 'Find Me', 'Found feature name');
});

test('getFeature returns undefined for non-existent ID', () => {
  const found = features.getFeature('F-999', TEST_DIR);
  assertEqual(found, undefined, 'Should be undefined');
});

test('listFeatures returns all features', () => {
  features.addFeature({ name: 'Feature 1' }, TEST_DIR);
  features.addFeature({ name: 'Feature 2' }, TEST_DIR);

  const list = features.listFeatures(TEST_DIR);
  assertEqual(list.length, 2, 'Feature count');
});

test('listFeatures filters by status', () => {
  features.addFeature({ name: 'Proposed', status: 'proposed' }, TEST_DIR);
  features.addFeature({ name: 'Completed', status: 'completed' }, TEST_DIR);

  const proposed = features.listFeatures(TEST_DIR, { status: 'proposed' });
  const completed = features.listFeatures(TEST_DIR, { status: 'completed' });

  assertEqual(proposed.length, 1, 'Proposed count');
  assertEqual(completed.length, 1, 'Completed count');
  assertEqual(proposed[0].name, 'Proposed', 'Proposed feature');
});

test('listFeatures filters by tag', () => {
  features.addFeature({ name: 'Auth', tags: ['auth', 'security'] }, TEST_DIR);
  features.addFeature({ name: 'UI', tags: ['ui'] }, TEST_DIR);

  const authFeatures = features.listFeatures(TEST_DIR, { tag: 'auth' });
  assertEqual(authFeatures.length, 1, 'Auth features count');
  assertEqual(authFeatures[0].name, 'Auth', 'Auth feature');
});

test('listFeatures searches by term', () => {
  features.addFeature({ name: 'User Authentication' }, TEST_DIR);
  features.addFeature({ name: 'Dashboard' }, TEST_DIR);

  const results = features.listFeatures(TEST_DIR, { search: 'auth' });
  assertEqual(results.length, 1, 'Search results');
  assertEqual(results[0].name, 'User Authentication', 'Found feature');
});

test('updateFeature modifies feature properties', () => {
  features.addFeature({ name: 'Original', status: 'proposed' }, TEST_DIR);
  const updated = features.updateFeature('F-001', {
    name: 'Updated',
    status: 'in-progress'
  }, TEST_DIR);

  assertEqual(updated.name, 'Updated', 'Updated name');
  assertEqual(updated.status, 'in-progress', 'Updated status');
});

test('updateFeature throws for non-existent feature', () => {
  let threw = false;
  try {
    features.updateFeature('F-999', { name: 'Nope' }, TEST_DIR);
  } catch (err) {
    threw = true;
    assertTrue(err.message.includes('not found'), 'Error message');
  }
  assertTrue(threw, 'Should throw');
});

test('deleteFeature removes feature', () => {
  features.addFeature({ name: 'To Delete' }, TEST_DIR);
  assertEqual(features.listFeatures(TEST_DIR).length, 1, 'Before delete');

  const deleted = features.deleteFeature('F-001', TEST_DIR);
  assertEqual(deleted.name, 'To Delete', 'Deleted feature name');
  assertEqual(features.listFeatures(TEST_DIR).length, 0, 'After delete');
});

test('addEnhancement adds enhancement to feature', () => {
  features.addFeature({ name: 'Main Feature' }, TEST_DIR);
  const enhancement = features.addEnhancement('F-001', {
    description: 'Add OAuth support',
    priority: 'high'
  }, TEST_DIR);

  assertEqual(enhancement.id, 'E-001', 'Enhancement ID');
  assertEqual(enhancement.priority, 'high', 'Priority');

  const feature = features.getFeature('F-001', TEST_DIR);
  assertEqual(feature.enhancements.length, 1, 'Enhancements count');
});

test('linkContract adds contract to feature', () => {
  features.addFeature({ name: 'Feature' }, TEST_DIR);
  features.linkContract('F-001', 'FC-001', TEST_DIR);
  features.linkContract('F-001', 'FC-002', TEST_DIR);

  const feature = features.getFeature('F-001', TEST_DIR);
  assertEqual(feature.contracts.length, 2, 'Contracts count');
  assertIncludes(feature.contracts, 'FC-001', 'Contract 1');
  assertIncludes(feature.contracts, 'FC-002', 'Contract 2');
});

test('linkContract does not duplicate contracts', () => {
  features.addFeature({ name: 'Feature' }, TEST_DIR);
  features.linkContract('F-001', 'FC-001', TEST_DIR);
  features.linkContract('F-001', 'FC-001', TEST_DIR);

  const feature = features.getFeature('F-001', TEST_DIR);
  assertEqual(feature.contracts.length, 1, 'Should not duplicate');
});

test('getFeatureStats returns correct statistics', () => {
  features.addFeature({ name: 'F1', status: 'proposed', contracts: ['FC-001'] }, TEST_DIR);
  features.addFeature({ name: 'F2', status: 'completed', contracts: ['FC-002'] }, TEST_DIR);
  features.addFeature({ name: 'F3', status: 'proposed' }, TEST_DIR);
  features.addEnhancement('F-001', { description: 'E1' }, TEST_DIR);

  const stats = features.getFeatureStats(TEST_DIR);

  assertEqual(stats.total, 3, 'Total');
  assertEqual(stats.byStatus.proposed, 2, 'Proposed count');
  assertEqual(stats.byStatus.completed, 1, 'Completed count');
  assertEqual(stats.withEnhancements, 1, 'With enhancements');
  assertEqual(stats.totalEnhancements, 1, 'Total enhancements');
  assertEqual(stats.linkedToContracts, 2, 'Linked to contracts');
});

test('searchFeatures finds by name and description', () => {
  features.addFeature({ name: 'Auth System', description: 'Login and registration' }, TEST_DIR);
  features.addFeature({ name: 'Dashboard', description: 'User analytics' }, TEST_DIR);

  const byName = features.searchFeatures('auth', TEST_DIR);
  const byDesc = features.searchFeatures('analytics', TEST_DIR);

  assertEqual(byName.length, 1, 'By name');
  assertEqual(byDesc.length, 1, 'By description');
});

test('getAllTags returns unique sorted tags', () => {
  features.addFeature({ name: 'F1', tags: ['auth', 'security'] }, TEST_DIR);
  features.addFeature({ name: 'F2', tags: ['ui', 'auth'] }, TEST_DIR);

  const tags = features.getAllTags(TEST_DIR);

  assertEqual(tags.length, 3, 'Unique tags');
  assertEqual(tags[0], 'auth', 'First tag (sorted)');
  assertEqual(tags[1], 'security', 'Second tag');
  assertEqual(tags[2], 'ui', 'Third tag');
});

test('sanitizeName removes dangerous characters', () => {
  assertEqual(features.sanitizeName('test<script>'), 'testscript', 'Removes <>');
  assertEqual(features.sanitizeName('path/../file'), 'pathfile', 'Removes ..');
  assertEqual(features.sanitizeName('file:name'), 'filename', 'Removes :');
  assertEqual(features.sanitizeName('a'.repeat(200)), 'a'.repeat(100), 'Truncates to 100');
});

// Discovery tests (require contracts dir)
test('discoverFeatures finds features from contracts', () => {
  // Create contracts dir with a sample contract
  const contractsDir = path.join(TEST_DIR, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });

  const contractContent = `# Feature Contract: Test Feature

**ID:** FC-001
**Status:** approved

## Objective

This is a test feature objective.

## Summary

Test summary.
`;

  fs.writeFileSync(path.join(contractsDir, 'test.fc.md'), contractContent);

  const discovered = features.discoverFeatures(TEST_DIR);

  assertEqual(discovered.length, 1, 'Discovered count');
  assertEqual(discovered[0].name, 'Test Feature', 'Feature name');
  assertIncludes(discovered[0].contracts, 'FC-001', 'Contract ID');
});

test('importDiscoveredFeatures skips existing features', () => {
  // Create contracts dir
  const contractsDir = path.join(TEST_DIR, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });

  fs.writeFileSync(path.join(contractsDir, 'test.fc.md'), `# Feature Contract: Test

**ID:** FC-001
**Status:** approved

## Objective

Test.
`);

  // Import once
  const first = features.importDiscoveredFeatures(TEST_DIR);
  assertEqual(first.length, 1, 'First import');

  // Import again - should skip
  const second = features.importDiscoveredFeatures(TEST_DIR);
  assertEqual(second.length, 0, 'Second import should skip');
});

// Results
console.log(`\n─────────────────────────────────`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
