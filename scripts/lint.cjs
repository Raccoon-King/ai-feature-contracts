#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const yaml = require('yaml');

const ROOT = path.join(__dirname, '..');
const JS_EXTENSIONS = new Set(['.js', '.cjs']);
const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);
const EXCLUDED_DIRS = new Set(['node_modules', 'coverage', '.git']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), files);
      }
      continue;
    }
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function lintJavaScript(file, errors) {
  try {
    const source = fs.readFileSync(file, 'utf8').replace(/^#!.*\r?\n/, '');
    new vm.Script(source, { filename: file });
  } catch (error) {
    errors.push(`Syntax error in ${relative(file)}\n${error.message}`);
  }
}

function lintYaml(file, errors) {
  try {
    yaml.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`YAML parse error in ${relative(file)}\n${error.message}`);
  }
}

function lintPackageScripts(errors) {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (!pkg.scripts?.lint || pkg.scripts.lint.includes('No lint configured yet')) {
    errors.push('package.json lint script still points to a placeholder.');
  }
}

const files = walk(ROOT);
const errors = [];

files.forEach((file) => {
  const ext = path.extname(file).toLowerCase();
  if (JS_EXTENSIONS.has(ext)) {
    lintJavaScript(file, errors);
  }
  if (YAML_EXTENSIONS.has(ext)) {
    lintYaml(file, errors);
  }
});

lintPackageScripts(errors);

if (errors.length > 0) {
  console.error(`Lint failed with ${errors.length} issue(s).\n`);
  errors.forEach((error) => {
    console.error(error);
    console.error('');
  });
  process.exit(1);
}

console.log(`Lint passed for ${files.length} files.`);
