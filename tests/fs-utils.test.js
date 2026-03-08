const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  ensureDir,
  ensureParentDir,
  readJsonSafe,
  readYamlSafe,
  readTextSafe,
  writeJsonAtomic,
  writeYamlAtomic,
  writeTextSafe,
  exists,
  isDirectory,
  isFile,
  listFiles,
  removeFile,
  removeDir,
} = require('../lib/fs-utils.cjs');

describe('fs-utils', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('ensureDir', () => {
    it('creates directory if it does not exist', () => {
      const dir = path.join(testDir, 'new-dir');
      expect(fs.existsSync(dir)).toBe(false);
      ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    });

    it('creates nested directories', () => {
      const dir = path.join(testDir, 'a', 'b', 'c');
      ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });

    it('does nothing if directory already exists', () => {
      const dir = path.join(testDir, 'existing');
      fs.mkdirSync(dir);
      ensureDir(dir); // Should not throw
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('ensureParentDir', () => {
    it('creates parent directory of a file path', () => {
      const filePath = path.join(testDir, 'parent', 'file.txt');
      ensureParentDir(filePath);
      expect(fs.existsSync(path.join(testDir, 'parent'))).toBe(true);
    });
  });

  describe('readJsonSafe', () => {
    it('reads valid JSON file', () => {
      const filePath = path.join(testDir, 'test.json');
      fs.writeFileSync(filePath, '{"key": "value"}');
      expect(readJsonSafe(filePath)).toEqual({ key: 'value' });
    });

    it('returns default for non-existent file', () => {
      const filePath = path.join(testDir, 'missing.json');
      expect(readJsonSafe(filePath, { default: true })).toEqual({ default: true });
    });

    it('returns default for invalid JSON', () => {
      const filePath = path.join(testDir, 'invalid.json');
      fs.writeFileSync(filePath, 'not json');
      expect(readJsonSafe(filePath, [])).toEqual([]);
    });

    it('returns null by default', () => {
      expect(readJsonSafe(path.join(testDir, 'missing.json'))).toBeNull();
    });
  });

  describe('readYamlSafe', () => {
    it('reads valid YAML file', () => {
      const filePath = path.join(testDir, 'test.yaml');
      fs.writeFileSync(filePath, 'key: value\nlist:\n  - a\n  - b');
      expect(readYamlSafe(filePath)).toEqual({ key: 'value', list: ['a', 'b'] });
    });

    it('returns default for non-existent file', () => {
      expect(readYamlSafe(path.join(testDir, 'missing.yaml'), {})).toEqual({});
    });

    it('returns default for invalid YAML', () => {
      const filePath = path.join(testDir, 'invalid.yaml');
      fs.writeFileSync(filePath, '{{{{not yaml');
      expect(readYamlSafe(filePath, null)).toBeNull();
    });
  });

  describe('readTextSafe', () => {
    it('reads text file', () => {
      const filePath = path.join(testDir, 'test.txt');
      fs.writeFileSync(filePath, 'hello world');
      expect(readTextSafe(filePath)).toBe('hello world');
    });

    it('returns default for non-existent file', () => {
      expect(readTextSafe(path.join(testDir, 'missing.txt'), 'default')).toBe('default');
    });

    it('returns empty string by default', () => {
      expect(readTextSafe(path.join(testDir, 'missing.txt'))).toBe('');
    });
  });

  describe('writeJsonAtomic', () => {
    it('writes JSON file with indentation', () => {
      const filePath = path.join(testDir, 'output.json');
      writeJsonAtomic(filePath, { a: 1, b: 2 });
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('{\n  "a": 1,\n  "b": 2\n}\n');
    });

    it('creates parent directories', () => {
      const filePath = path.join(testDir, 'nested', 'dir', 'output.json');
      writeJsonAtomic(filePath, { test: true });
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('overwrites existing file', () => {
      const filePath = path.join(testDir, 'output.json');
      writeJsonAtomic(filePath, { first: true });
      writeJsonAtomic(filePath, { second: true });
      expect(readJsonSafe(filePath)).toEqual({ second: true });
    });

    it('cleans up temp file on success', () => {
      const filePath = path.join(testDir, 'output.json');
      writeJsonAtomic(filePath, { test: true });
      const files = fs.readdirSync(testDir);
      expect(files.filter(f => f.includes('.tmp.'))).toHaveLength(0);
    });
  });

  describe('writeYamlAtomic', () => {
    it('writes YAML file', () => {
      const filePath = path.join(testDir, 'output.yaml');
      writeYamlAtomic(filePath, { key: 'value', list: [1, 2] });
      const data = readYamlSafe(filePath);
      expect(data).toEqual({ key: 'value', list: [1, 2] });
    });

    it('creates parent directories', () => {
      const filePath = path.join(testDir, 'nested', 'output.yaml');
      writeYamlAtomic(filePath, { test: true });
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('writeTextSafe', () => {
    it('writes text file', () => {
      const filePath = path.join(testDir, 'output.txt');
      writeTextSafe(filePath, 'hello');
      expect(fs.readFileSync(filePath, 'utf8')).toBe('hello');
    });

    it('creates parent directories', () => {
      const filePath = path.join(testDir, 'nested', 'output.txt');
      writeTextSafe(filePath, 'hello');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('exists', () => {
    it('returns true for existing file', () => {
      const filePath = path.join(testDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');
      expect(exists(filePath)).toBe(true);
    });

    it('returns true for existing directory', () => {
      expect(exists(testDir)).toBe(true);
    });

    it('returns false for non-existent path', () => {
      expect(exists(path.join(testDir, 'missing'))).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('returns true for directory', () => {
      expect(isDirectory(testDir)).toBe(true);
    });

    it('returns false for file', () => {
      const filePath = path.join(testDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');
      expect(isDirectory(filePath)).toBe(false);
    });

    it('returns false for non-existent path', () => {
      expect(isDirectory(path.join(testDir, 'missing'))).toBe(false);
    });
  });

  describe('isFile', () => {
    it('returns true for file', () => {
      const filePath = path.join(testDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');
      expect(isFile(filePath)).toBe(true);
    });

    it('returns false for directory', () => {
      expect(isFile(testDir)).toBe(false);
    });

    it('returns false for non-existent path', () => {
      expect(isFile(path.join(testDir, 'missing'))).toBe(false);
    });
  });

  describe('listFiles', () => {
    it('lists files in directory', () => {
      fs.writeFileSync(path.join(testDir, 'a.txt'), '');
      fs.writeFileSync(path.join(testDir, 'b.json'), '');
      fs.mkdirSync(path.join(testDir, 'subdir'));
      const files = listFiles(testDir);
      expect(files).toContain('a.txt');
      expect(files).toContain('b.json');
      expect(files).toContain('subdir');
    });

    it('filters by extension', () => {
      fs.writeFileSync(path.join(testDir, 'a.txt'), '');
      fs.writeFileSync(path.join(testDir, 'b.json'), '');
      fs.writeFileSync(path.join(testDir, 'c.txt'), '');
      const files = listFiles(testDir, '.txt');
      expect(files).toEqual(['a.txt', 'c.txt']);
    });

    it('returns empty array for non-existent directory', () => {
      expect(listFiles(path.join(testDir, 'missing'))).toEqual([]);
    });
  });

  describe('removeFile', () => {
    it('removes existing file', () => {
      const filePath = path.join(testDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');
      expect(removeFile(filePath)).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('returns false for non-existent file', () => {
      expect(removeFile(path.join(testDir, 'missing'))).toBe(false);
    });
  });

  describe('removeDir', () => {
    it('removes existing directory recursively', () => {
      const dir = path.join(testDir, 'dir');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'file.txt'), '');
      expect(removeDir(dir)).toBe(true);
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('returns false for non-existent directory', () => {
      expect(removeDir(path.join(testDir, 'missing'))).toBe(false);
    });
  });
});
