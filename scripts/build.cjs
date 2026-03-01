#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CHECK_FILES = [
  path.join(ROOT, 'bin', 'index.cjs'),
  path.join(ROOT, 'lib', 'core.cjs'),
  path.join(ROOT, 'lib', 'commands.cjs'),
  path.join(ROOT, 'lib', 'interactive.cjs'),
  path.join(ROOT, 'scripts', 'lint.cjs'),
  path.join(ROOT, 'scripts', 'build.cjs'),
];

function compile(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/^#!.*\r?\n/, '');
  new vm.Script(source, { filename: file });
}

for (const file of CHECK_FILES) {
  compile(file);
}

console.log(`Build passed for ${CHECK_FILES.length} entry files.`);

