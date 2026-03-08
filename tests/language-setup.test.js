const {
  detectGoSetup,
  detectPythonSetup,
  detectRustSetup,
  detectJavaSetup,
  detectGeneralTooling,
  buildLanguageSetup,
} = require('../lib/language-setup.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('language-setup', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'language-setup-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('detectGoSetup', () => {
    it('returns null when no go.mod exists', () => {
      const setup = detectGoSetup(tempDir);
      expect(setup).toBeNull();
    });

    it('detects basic Go project', () => {
      fs.writeFileSync(path.join(tempDir, 'go.mod'), `
module github.com/user/myapp

go 1.21
`);
      fs.writeFileSync(path.join(tempDir, 'main.go'), 'package main');

      const setup = detectGoSetup(tempDir);
      expect(setup).not.toBeNull();
      expect(setup.language).toBe('go');
      expect(setup.module).toBe('github.com/user/myapp');
      expect(setup.goVersion).toBe('1.21');
      expect(setup.structure).toBe('flat');
      expect(setup.entrypoints).toContain('.');
    });

    it('detects standard layout structure', () => {
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example.com/app\ngo 1.22');
      fs.mkdirSync(path.join(tempDir, 'cmd', 'server'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'internal', 'handlers'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'pkg', 'utils'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'cmd', 'server', 'main.go'), 'package main');

      const setup = detectGoSetup(tempDir);
      expect(setup.structure).toBe('standard-layout');
      expect(setup.entrypoints).toContain('cmd/server');
      expect(setup.packages).toContain('internal/handlers');
      expect(setup.packages).toContain('pkg/utils');
    });

    it('detects Go tooling', () => {
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example.com/app');
      fs.writeFileSync(path.join(tempDir, 'Makefile'), 'build:\n\tgo build');
      fs.writeFileSync(path.join(tempDir, '.air.toml'), '[build]');
      fs.writeFileSync(path.join(tempDir, '.golangci.yml'), 'linters:');

      const setup = detectGoSetup(tempDir);
      expect(setup.tooling).toContain('make');
      expect(setup.tooling).toContain('air');
      expect(setup.tooling).toContain('golangci-lint');
    });
  });

  describe('detectPythonSetup', () => {
    it('returns null when no Python markers exist', () => {
      const setup = detectPythonSetup(tempDir);
      expect(setup).toBeNull();
    });

    it('detects pyproject.toml project', () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), `
[project]
name = "mypackage"
requires-python = ">=3.10"

[tool.pytest]
testpaths = ["tests"]
`);

      const setup = detectPythonSetup(tempDir);
      expect(setup).not.toBeNull();
      expect(setup.language).toBe('python');
      expect(setup.package).toBe('mypackage');
      expect(setup.pythonVersion).toBe('>=3.10');
      expect(setup.testFramework).toBe('pytest');
    });

    it('detects src-layout structure', () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), '[project]\nname = "app"');
      fs.mkdirSync(path.join(tempDir, 'src', 'myapp'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'myapp', '__init__.py'), '');

      const setup = detectPythonSetup(tempDir);
      expect(setup.structure).toBe('src-layout');
      expect(setup.packages).toContain('src/myapp');
    });

    it('detects Poetry project', () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), `
[tool.poetry]
name = "myapp"
version = "0.1.0"
`);

      const setup = detectPythonSetup(tempDir);
      expect(setup.tooling).toContain('poetry');
    });

    it('detects Django project', () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'django==4.2');
      fs.writeFileSync(path.join(tempDir, 'manage.py'), '#!/usr/bin/env python');

      const setup = detectPythonSetup(tempDir);
      expect(setup.tooling).toContain('django');
      expect(setup.entrypoints).toContain('manage.py');
    });

    it('detects virtual environment', () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask');
      fs.mkdirSync(path.join(tempDir, '.venv'));
      fs.writeFileSync(path.join(tempDir, '.venv', 'pyvenv.cfg'), 'home = /usr/bin');

      const setup = detectPythonSetup(tempDir);
      expect(setup.virtualEnv).toBe('.venv');
    });

    it('detects Python tooling', () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), `
[project]
name = "app"

[tool.ruff]
line-length = 88

[tool.mypy]
strict = true
`);
      fs.writeFileSync(path.join(tempDir, 'conftest.py'), '');

      const setup = detectPythonSetup(tempDir);
      expect(setup.tooling).toContain('ruff');
      expect(setup.tooling).toContain('mypy');
      expect(setup.tooling).toContain('pytest');
    });
  });

  describe('detectRustSetup', () => {
    it('returns null when no Cargo.toml exists', () => {
      const setup = detectRustSetup(tempDir);
      expect(setup).toBeNull();
    });

    it('detects binary crate', () => {
      fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), `
[package]
name = "myapp"
rust-version = "1.70"
`);
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.writeFileSync(path.join(tempDir, 'src', 'main.rs'), 'fn main() {}');

      const setup = detectRustSetup(tempDir);
      expect(setup).not.toBeNull();
      expect(setup.language).toBe('rust');
      expect(setup.crate).toBe('myapp');
      expect(setup.rustVersion).toBe('1.70');
      expect(setup.structure).toBe('binary');
    });

    it('detects library crate', () => {
      fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "mylib"');
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.writeFileSync(path.join(tempDir, 'src', 'lib.rs'), 'pub fn hello() {}');

      const setup = detectRustSetup(tempDir);
      expect(setup.structure).toBe('library');
    });

    it('detects mixed crate', () => {
      fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "mixed"');
      fs.mkdirSync(path.join(tempDir, 'src'));
      fs.writeFileSync(path.join(tempDir, 'src', 'main.rs'), 'fn main() {}');
      fs.writeFileSync(path.join(tempDir, 'src', 'lib.rs'), 'pub fn hello() {}');

      const setup = detectRustSetup(tempDir);
      expect(setup.structure).toBe('mixed');
    });

    it('detects workspace', () => {
      fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), `
[workspace]
members = ["crates/*"]
`);
      fs.mkdirSync(path.join(tempDir, 'crates', 'core'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'crates', 'cli'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'crates', 'core', 'Cargo.toml'), '[package]\nname = "core"');
      fs.writeFileSync(path.join(tempDir, 'crates', 'cli', 'Cargo.toml'), '[package]\nname = "cli"');

      const setup = detectRustSetup(tempDir);
      expect(setup.isWorkspace).toBe(true);
      expect(setup.structure).toBe('workspace');
      expect(setup.members).toContain('crates/core');
      expect(setup.members).toContain('crates/cli');
    });

    it('detects Rust tooling', () => {
      fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "app"');
      fs.writeFileSync(path.join(tempDir, 'rustfmt.toml'), 'max_width = 100');
      fs.writeFileSync(path.join(tempDir, '.clippy.toml'), '');

      const setup = detectRustSetup(tempDir);
      expect(setup.tooling).toContain('rustfmt');
      expect(setup.tooling).toContain('clippy');
    });
  });

  describe('detectJavaSetup', () => {
    it('returns null when no build files exist', () => {
      const setup = detectJavaSetup(tempDir);
      expect(setup).toBeNull();
    });

    it('detects Maven project', () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), '<project></project>');
      fs.mkdirSync(path.join(tempDir, 'src', 'main', 'java'), { recursive: true });

      const setup = detectJavaSetup(tempDir);
      expect(setup).not.toBeNull();
      expect(setup.language).toBe('java');
      expect(setup.buildTool).toBe('maven');
      expect(setup.structure).toBe('standard');
    });

    it('detects Gradle project', () => {
      fs.writeFileSync(path.join(tempDir, 'build.gradle'), 'plugins { id "java" }');
      fs.mkdirSync(path.join(tempDir, 'src', 'main', 'java'), { recursive: true });

      const setup = detectJavaSetup(tempDir);
      expect(setup.buildTool).toBe('gradle');
    });

    it('detects Kotlin project', () => {
      fs.writeFileSync(path.join(tempDir, 'build.gradle.kts'), 'plugins { kotlin("jvm") }');
      fs.mkdirSync(path.join(tempDir, 'src', 'main', 'kotlin'), { recursive: true });

      const setup = detectJavaSetup(tempDir);
      expect(setup.language).toBe('kotlin');
    });

    it('detects Gradle wrapper', () => {
      fs.writeFileSync(path.join(tempDir, 'build.gradle'), '');
      fs.writeFileSync(path.join(tempDir, 'gradlew'), '#!/bin/bash');

      const setup = detectJavaSetup(tempDir);
      expect(setup.tooling).toContain('gradle-wrapper');
    });
  });

  describe('detectGeneralTooling', () => {
    it('detects Makefile', () => {
      fs.writeFileSync(path.join(tempDir, 'Makefile'), 'all:');
      const tooling = detectGeneralTooling(tempDir);
      expect(tooling).toContain('make');
    });

    it('detects Docker', () => {
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM node');
      fs.writeFileSync(path.join(tempDir, 'docker-compose.yml'), 'services:');
      const tooling = detectGeneralTooling(tempDir);
      expect(tooling).toContain('docker');
      expect(tooling).toContain('docker-compose');
    });

    it('detects CI/CD', () => {
      fs.mkdirSync(path.join(tempDir, '.github', 'workflows'), { recursive: true });
      const tooling = detectGeneralTooling(tempDir);
      expect(tooling).toContain('github-actions');
    });

    it('detects .env.example', () => {
      fs.writeFileSync(path.join(tempDir, '.env.example'), 'API_KEY=');
      const tooling = detectGeneralTooling(tempDir);
      expect(tooling).toContain('dotenv');
    });

    it('detects Kubernetes/Terraform', () => {
      fs.mkdirSync(path.join(tempDir, 'k8s'));
      fs.mkdirSync(path.join(tempDir, 'terraform'));
      const tooling = detectGeneralTooling(tempDir);
      expect(tooling).toContain('kubernetes');
      expect(tooling).toContain('terraform');
    });
  });

  describe('buildLanguageSetup', () => {
    it('returns empty setup for Node-only project', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const setup = buildLanguageSetup(tempDir);
      expect(setup.languages).toHaveLength(0);
      expect(setup.primary).toBeNull();
    });

    it('builds multi-language setup', () => {
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example.com/app');
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask');

      const setup = buildLanguageSetup(tempDir);
      expect(setup.languages).toContain('go');
      expect(setup.languages).toContain('python');
      expect(setup.primary).toBe('go'); // Go has higher priority
      expect(setup.setups.go).toBeDefined();
      expect(setup.setups.python).toBeDefined();
    });

    it('includes general tooling', () => {
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module app');
      fs.writeFileSync(path.join(tempDir, 'Makefile'), 'build:');
      fs.writeFileSync(path.join(tempDir, 'docker-compose.yml'), 'services:');

      const setup = buildLanguageSetup(tempDir);
      expect(setup.generalTooling).toContain('make');
      expect(setup.generalTooling).toContain('docker-compose');
    });
  });
});
