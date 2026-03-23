/**
 * Signals - Technology signal definitions for auto-detecting applicable rulesets
 * Each signal set defines file patterns that indicate a technology is in use
 */

const path = require('path');
const fs = require('fs');

/**
 * Technology signal definitions
 * Each entry maps a technology key to ruleset ID and detection signals
 */
const TECHNOLOGY_SIGNALS = {
  dotnet: {
    id: 'languages/dotnet',
    name: '.NET',
    signals: [
      { glob: '**/*.sln', weight: 1.0 },
      { glob: '**/*.csproj', weight: 0.9 },
      { file: 'global.json', weight: 0.8 },
      { file: 'Directory.Build.props', weight: 0.7 },
      { file: 'nuget.config', weight: 0.6 },
    ],
  },
  nodejs: {
    id: 'languages/javascript',
    name: 'Node.js',
    signals: [
      { file: 'package.json', weight: 1.0 },
      { file: 'package-lock.json', weight: 0.7 },
      { file: 'yarn.lock', weight: 0.7 },
      { file: 'pnpm-lock.yaml', weight: 0.7 },
    ],
  },
  typescript: {
    id: 'languages/typescript',
    name: 'TypeScript',
    signals: [
      { file: 'tsconfig.json', weight: 1.0 },
      { glob: 'src/**/*.ts', weight: 0.6 },
      { glob: 'src/**/*.tsx', weight: 0.6 },
    ],
  },
  python: {
    id: 'languages/python',
    name: 'Python',
    signals: [
      { file: 'pyproject.toml', weight: 1.0 },
      { file: 'requirements.txt', weight: 0.9 },
      { file: 'setup.py', weight: 0.8 },
      { file: 'Pipfile', weight: 0.8 },
      { file: 'poetry.lock', weight: 0.7 },
    ],
  },
  go: {
    id: 'languages/go',
    name: 'Go',
    signals: [
      { file: 'go.mod', weight: 1.0 },
      { file: 'go.sum', weight: 0.8 },
    ],
  },
  rust: {
    id: 'languages/rust',
    name: 'Rust',
    signals: [
      { file: 'Cargo.toml', weight: 1.0 },
      { file: 'Cargo.lock', weight: 0.8 },
    ],
  },
  java: {
    id: 'languages/java',
    name: 'Java',
    signals: [
      { file: 'pom.xml', weight: 1.0 },
      { file: 'build.gradle', weight: 1.0 },
      { file: 'build.gradle.kts', weight: 1.0 },
      { file: 'settings.gradle', weight: 0.7 },
    ],
  },
  react: {
    id: 'frameworks/react',
    name: 'React',
    signals: [
      { packageDep: 'react', weight: 1.0 },
      { glob: 'src/**/*.jsx', weight: 0.7 },
      { glob: 'src/**/*.tsx', weight: 0.6 },
    ],
  },
  nextjs: {
    id: 'frameworks/nextjs',
    name: 'Next.js',
    signals: [
      { packageDep: 'next', weight: 1.0 },
      { file: 'next.config.js', weight: 0.9 },
      { file: 'next.config.mjs', weight: 0.9 },
      { file: 'next.config.ts', weight: 0.9 },
    ],
  },
  express: {
    id: 'frameworks/express',
    name: 'Express',
    signals: [
      { packageDep: 'express', weight: 1.0 },
    ],
  },
  aspnetCore: {
    id: 'frameworks/aspnet-core',
    name: 'ASP.NET Core',
    signals: [
      { glob: '**/*.csproj', content: 'Microsoft.AspNetCore', weight: 1.0 },
      { glob: '**/Program.cs', content: 'WebApplication', weight: 0.9 },
      { glob: '**/Startup.cs', weight: 0.7 },
    ],
  },
  docker: {
    id: 'tooling/docker',
    name: 'Docker',
    signals: [
      { file: 'Dockerfile', weight: 1.0 },
      { file: 'docker-compose.yml', weight: 0.9 },
      { file: 'docker-compose.yaml', weight: 0.9 },
      { file: '.dockerignore', weight: 0.6 },
    ],
  },
  kubernetes: {
    id: 'tooling/kubernetes',
    name: 'Kubernetes',
    signals: [
      { glob: '**/deployment.yaml', weight: 0.9 },
      { glob: '**/deployment.yml', weight: 0.9 },
      { glob: '**/k8s/**/*.yaml', weight: 0.8 },
      { file: 'skaffold.yaml', weight: 0.7 },
    ],
  },
};

/**
 * Default directories to exclude from scanning
 */
const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'vendor',
  '.next',
  '__pycache__',
  'bin',
  'obj',
];

/**
 * Check if a file matches a glob pattern (simple implementation)
 * @param {string} filePath - Relative file path
 * @param {string} pattern - Glob pattern
 * @returns {boolean}
 */
function matchGlob(filePath, pattern) {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Handle **/*.ext pattern (match any path ending with .ext)
  if (normalizedPattern.startsWith('**/')) {
    const suffix = normalizedPattern.slice(3);
    const suffixRegex = suffix
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^/]*');
    const regex = new RegExp(`(^|/)${suffixRegex}$`);
    return regex.test(normalizedPath);
  }

  // Convert glob pattern to regex
  const regexPattern = normalizedPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(normalizedPath);
}

/**
 * Check if file contains specific content
 * @param {string} filePath - Absolute file path
 * @param {string} content - Content to search for
 * @returns {boolean}
 */
function fileContains(filePath, content) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return fileContent.includes(content);
  } catch {
    return false;
  }
}

/**
 * Check if package.json has a dependency
 * @param {string} cwd - Working directory
 * @param {string} packageName - Package name to check
 * @returns {boolean}
 */
function hasPackageDep(cwd, packageName) {
  const packageJsonPath = path.join(cwd, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    return packageName in deps;
  } catch {
    return false;
  }
}

/**
 * Check if a signal matches in the given directory
 * @param {object} signal - Signal definition
 * @param {string} cwd - Working directory
 * @param {string[]} files - List of files in the directory
 * @returns {{ matched: boolean, matches: string[] }}
 */
function checkSignal(signal, cwd, files) {
  const matches = [];

  if (signal.file) {
    // Exact file match
    if (files.includes(signal.file)) {
      if (signal.content) {
        const fullPath = path.join(cwd, signal.file);
        if (fileContains(fullPath, signal.content)) {
          matches.push(signal.file);
        }
      } else {
        matches.push(signal.file);
      }
    }
  } else if (signal.glob) {
    // Glob pattern match
    for (const file of files) {
      if (matchGlob(file, signal.glob)) {
        if (signal.content) {
          const fullPath = path.join(cwd, file);
          if (fileContains(fullPath, signal.content)) {
            matches.push(file);
          }
        } else {
          matches.push(file);
        }
      }
    }
  } else if (signal.packageDep) {
    // Package dependency check
    if (hasPackageDep(cwd, signal.packageDep)) {
      matches.push(`package.json:${signal.packageDep}`);
    }
  }

  return { matched: matches.length > 0, matches };
}

/**
 * Calculate confidence score from matched signals
 * @param {object[]} signals - Signal definitions
 * @param {Map<number, string[]>} matchedSignals - Map of signal index to matches
 * @returns {number} Confidence score (0-1)
 */
function calculateConfidence(signals, matchedSignals) {
  if (matchedSignals.size === 0) return 0;

  let totalWeight = 0;
  let matchedWeight = 0;

  for (let i = 0; i < signals.length; i++) {
    const weight = signals[i].weight || 1.0;
    totalWeight += weight;
    if (matchedSignals.has(i)) {
      matchedWeight += weight;
    }
  }

  // Normalize to 0-1 range, with bonus for multiple matches
  const baseScore = matchedWeight / totalWeight;
  const matchBonus = Math.min(0.1, (matchedSignals.size - 1) * 0.02);

  return Math.min(1, baseScore + matchBonus);
}

module.exports = {
  TECHNOLOGY_SIGNALS,
  DEFAULT_EXCLUDE,
  matchGlob,
  fileContains,
  hasPackageDep,
  checkSignal,
  calculateConfidence,
};
