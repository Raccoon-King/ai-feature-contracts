const fs = require('fs');
const path = require('path');

const DEFAULT_GRABBYIGNORE = `# Grabby ignore patterns
node_modules/
coverage/
dist/
build/
.git/
.grabby-progress/
`;

function getGrabbyIgnorePath(cwd) {
  return path.join(cwd, '.grabbyignore');
}

function initGrabbyIgnore(cwd) {
  const ignorePath = getGrabbyIgnorePath(cwd);
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, DEFAULT_GRABBYIGNORE);
  }
  return ignorePath;
}

function loadGrabbyIgnore(cwd) {
  const ignorePath = getGrabbyIgnorePath(cwd);
  if (!fs.existsSync(ignorePath)) {
    return [];
  }

  return fs.readFileSync(ignorePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern) {
  const normalized = pattern.replace(/^!/, '').replace(/\\/g, '/');
  let regex = '';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*') {
      if (next === '*') {
        regex += '.*';
        index += 1;
      } else {
        regex += '[^/]*';
      }
      continue;
    }

    regex += escapeRegex(char);
  }

  if (normalized.endsWith('/')) {
    return new RegExp(`^(?:${regex.slice(0, -1)}|${regex}.*)$`);
  }

  return new RegExp(`^${regex}(?:/.*)?$`);
}

function isIgnoredByGrabby(cwd, targetPath) {
  const relativePath = path.relative(cwd, targetPath).replace(/\\/g, '/');
  const patterns = loadGrabbyIgnore(cwd);

  let ignored = false;

  patterns.forEach((pattern) => {
    const isNegated = pattern.startsWith('!');
    if (globToRegExp(pattern).test(relativePath)) {
      ignored = !isNegated;
    }
  });

  return ignored;
}

module.exports = {
  DEFAULT_GRABBYIGNORE,
  getGrabbyIgnorePath,
  initGrabbyIgnore,
  loadGrabbyIgnore,
  globToRegExp,
  isIgnoredByGrabby,
};
