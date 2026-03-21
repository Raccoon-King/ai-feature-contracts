/**
 * Tests for project-metadata module
 */

const { getProjectMetadata, getMetadataValue, loadPackageMetadata } = require('../lib/project-metadata.cjs');
const path = require('path');

describe('Project Metadata', () => {
  const cwd = process.cwd();

  describe('loadPackageMetadata', () => {
    it('should load package.json from cwd', () => {
      const pkg = loadPackageMetadata(cwd);

      expect(pkg).toBeTruthy();
      expect(pkg.name).toBe('grabby');
      expect(pkg.version).toBeTruthy();
    });

    it('should return null if package.json does not exist', () => {
      const pkg = loadPackageMetadata('/nonexistent/path');

      expect(pkg).toBeNull();
    });
  });

  describe('getProjectMetadata', () => {
    it('should return complete metadata object', () => {
      const metadata = getProjectMetadata(cwd);

      expect(metadata).toBeTruthy();
      expect(metadata.name).toBe('grabby');
      expect(metadata.version).toBeTruthy();
      expect(metadata.repository).toBeTruthy();
      expect(metadata.homepage).toBeTruthy();
      expect(metadata.docs).toBeTruthy();
      expect(metadata.defaults).toBeTruthy();
    });

    it('should include repository information', () => {
      const metadata = getProjectMetadata(cwd);

      expect(metadata.repository.type).toBe('git');
      expect(metadata.repository.url).toMatch(/github\.com/);
      expect(metadata.repository.shorthand).toMatch(/\//); // owner/repo
    });

    it('should include web presence URLs', () => {
      const metadata = getProjectMetadata(cwd);

      expect(metadata.homepage).toBeTruthy();
      expect(metadata.website).toBe('https://grabbyai.com');
      expect(metadata.npmUrl).toMatch(/npmjs\.com/);
    });

    it('should include documentation URLs', () => {
      const metadata = getProjectMetadata(cwd);

      expect(metadata.docs.readme).toMatch(/github\.com/);
      expect(metadata.docs.wiki).toMatch(/wiki/);
      expect(metadata.docs.schemas.config).toMatch(/grabby\.dev/);
    });

    it('should include runtime defaults', () => {
      const metadata = getProjectMetadata(cwd);

      expect(metadata.defaults.api.host).toBe('127.0.0.1');
      expect(metadata.defaults.api.portRange).toEqual([3456, 3466]);
      expect(metadata.defaults.api.corsOrigins).toBeInstanceOf(RegExp);
      expect(metadata.defaults.ollama.host).toBe('http://localhost:11434');
    });

    it('should provide fallback values when package.json is missing', () => {
      const metadata = getProjectMetadata('/nonexistent/path');

      expect(metadata.name).toBe('grabby');
      expect(metadata.version).toBe('0.0.0');
      expect(metadata.repository.url).toBeTruthy();
      expect(metadata.homepage).toBeTruthy();
    });
  });

  describe('getMetadataValue', () => {
    it('should retrieve top-level values', () => {
      const name = getMetadataValue('name', cwd);

      expect(name).toBe('grabby');
    });

    it('should retrieve nested values with dot notation', () => {
      const repoUrl = getMetadataValue('repository.url', cwd);
      const apiHost = getMetadataValue('defaults.api.host', cwd);
      const configSchema = getMetadataValue('docs.schemas.config', cwd);

      expect(repoUrl).toMatch(/github\.com/);
      expect(apiHost).toBe('127.0.0.1');
      expect(configSchema).toMatch(/grabby\.dev/);
    });

    it('should return undefined for non-existent paths', () => {
      const value = getMetadataValue('nonexistent.path', cwd);

      expect(value).toBeUndefined();
    });

    it('should handle deeply nested paths', () => {
      const ollamaHost = getMetadataValue('defaults.ollama.host', cwd);

      expect(ollamaHost).toBe('http://localhost:11434');
    });
  });

  describe('Metadata integration', () => {
    it('should have consistent values between methods', () => {
      const metadata = getProjectMetadata(cwd);
      const nameFromGetter = getMetadataValue('name', cwd);

      expect(metadata.name).toBe(nameFromGetter);
    });

    it('should match package.json values', () => {
      const pkg = loadPackageMetadata(cwd);
      const metadata = getProjectMetadata(cwd);

      expect(metadata.name).toBe(pkg.name);
      expect(metadata.version).toBe(pkg.version);
      expect(metadata.repository.url).toBe(pkg.repository.url);
    });
  });
});
