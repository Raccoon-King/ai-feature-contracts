/**
 * Multi-repo and monorepo support for Grabby
 * Detects workspace structures and manages cross-repo contracts
 */

const fs = require('fs');
const path = require('path');

/**
 * Workspace types we can detect
 */
const WORKSPACE_TYPES = {
  npm: 'npm workspaces',
  yarn: 'yarn workspaces',
  pnpm: 'pnpm workspaces',
  lerna: 'lerna monorepo',
  nx: 'nx monorepo',
  turbo: 'turborepo',
  rush: 'rush monorepo',
};

/**
 * Detect workspace/monorepo type
 */
function detectWorkspaceType(rootDir) {
  // Check for various workspace indicators
  const checks = [
    {
      type: 'lerna',
      files: ['lerna.json'],
    },
    {
      type: 'nx',
      files: ['nx.json', 'workspace.json'],
    },
    {
      type: 'turbo',
      files: ['turbo.json'],
    },
    {
      type: 'rush',
      files: ['rush.json'],
    },
    {
      type: 'pnpm',
      files: ['pnpm-workspace.yaml'],
    },
  ];

  for (const { type, files } of checks) {
    for (const file of files) {
      if (fs.existsSync(path.join(rootDir, file))) {
        return { type, indicator: file };
      }
    }
  }

  // Check package.json for workspaces
  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.workspaces) {
        return { type: 'npm', indicator: 'package.json workspaces' };
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Find all packages in a workspace
 */
function findWorkspacePackages(rootDir) {
  const workspace = detectWorkspaceType(rootDir);
  if (!workspace) return [];

  const packages = [];

  // Get workspace patterns
  let patterns = [];

  switch (workspace.type) {
    case 'npm':
    case 'yarn': {
      const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
      patterns = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces?.packages || [];
      break;
    }
    case 'pnpm': {
      const yaml = require('yaml');
      const content = fs.readFileSync(path.join(rootDir, 'pnpm-workspace.yaml'), 'utf8');
      const config = yaml.parse(content);
      patterns = config.packages || [];
      break;
    }
    case 'lerna': {
      const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'lerna.json'), 'utf8'));
      patterns = config.packages || ['packages/*'];
      break;
    }
    case 'nx': {
      // NX can have various structures, check common paths
      patterns = ['packages/*', 'apps/*', 'libs/*'];
      break;
    }
    case 'turbo': {
      // Turbo typically uses npm/yarn/pnpm workspaces
      const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
      patterns = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces?.packages || ['packages/*', 'apps/*'];
      break;
    }
    default:
      patterns = ['packages/*'];
  }

  // Expand glob patterns
  for (const pattern of patterns) {
    const baseDir = pattern.replace(/\/\*.*$/, '');
    const fullBaseDir = path.join(rootDir, baseDir);

    if (fs.existsSync(fullBaseDir) && fs.statSync(fullBaseDir).isDirectory()) {
      const entries = fs.readdirSync(fullBaseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pkgDir = path.join(fullBaseDir, entry.name);
          const pkgPath = path.join(pkgDir, 'package.json');

          if (fs.existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              packages.push({
                name: pkg.name || entry.name,
                path: pkgDir,
                relativePath: path.relative(rootDir, pkgDir),
                version: pkg.version,
                private: pkg.private || false,
              });
            } catch {
              // Skip packages with invalid package.json
            }
          }
        }
      }
    }
  }

  return packages;
}

/**
 * Find the workspace root from any subdirectory
 */
function findWorkspaceRoot(startDir) {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    const workspace = detectWorkspaceType(currentDir);
    if (workspace) {
      return { root: currentDir, ...workspace };
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Get workspace context for a directory
 */
function getWorkspaceContext(cwd) {
  const workspaceRoot = findWorkspaceRoot(cwd);

  if (!workspaceRoot) {
    return {
      isMonorepo: false,
      root: cwd,
      packages: [],
      currentPackage: null,
    };
  }

  const packages = findWorkspacePackages(workspaceRoot.root);
  const currentPackage = packages.find(pkg =>
    cwd === pkg.path || cwd.startsWith(pkg.path + path.sep)
  );

  return {
    isMonorepo: true,
    root: workspaceRoot.root,
    type: workspaceRoot.type,
    indicator: workspaceRoot.indicator,
    packages,
    currentPackage,
  };
}

/**
 * Find all contracts across a monorepo
 */
function findAllContracts(workspaceRoot) {
  const contracts = [];

  // Root contracts
  const rootContracts = path.join(workspaceRoot, 'contracts');
  if (fs.existsSync(rootContracts)) {
    const files = fs.readdirSync(rootContracts).filter(f => f.endsWith('.fc.md'));
    files.forEach(file => {
      contracts.push({
        file,
        path: path.join(rootContracts, file),
        package: '(root)',
        relativePath: `contracts/${file}`,
      });
    });
  }

  // Package contracts
  const packages = findWorkspacePackages(workspaceRoot);
  for (const pkg of packages) {
    const pkgContracts = path.join(pkg.path, 'contracts');
    if (fs.existsSync(pkgContracts)) {
      const files = fs.readdirSync(pkgContracts).filter(f => f.endsWith('.fc.md'));
      files.forEach(file => {
        contracts.push({
          file,
          path: path.join(pkgContracts, file),
          package: pkg.name,
          relativePath: `${pkg.relativePath}/contracts/${file}`,
        });
      });
    }
  }

  return contracts;
}

/**
 * Suggest directories based on workspace context
 */
function suggestDirectories(context) {
  const suggestions = {
    allowed: [],
    restricted: ['node_modules/', '.git/', '.env*'],
  };

  if (context.isMonorepo && context.currentPackage) {
    // In a package, suggest package-relative paths
    suggestions.allowed.push(
      `${context.currentPackage.relativePath}/src/`,
      `${context.currentPackage.relativePath}/lib/`,
      `${context.currentPackage.relativePath}/tests/`,
    );
  } else if (context.isMonorepo) {
    // At root, suggest common monorepo paths
    suggestions.allowed.push(
      'packages/',
      'apps/',
      'libs/',
      'shared/',
    );
  } else {
    // Standard project
    suggestions.allowed.push('src/', 'lib/', 'tests/');
  }

  return suggestions;
}

/**
 * Format workspace info for display
 */
function formatWorkspaceInfo(context) {
  const lines = [];

  if (context.isMonorepo) {
    lines.push(`Monorepo: ${WORKSPACE_TYPES[context.type] || context.type}`);
    lines.push(`Root: ${context.root}`);
    lines.push(`Packages: ${context.packages.length}`);

    if (context.currentPackage) {
      lines.push(`Current: ${context.currentPackage.name}`);
    }

    if (context.packages.length > 0 && context.packages.length <= 10) {
      lines.push('');
      lines.push('Packages:');
      context.packages.forEach(pkg => {
        lines.push(`  - ${pkg.name} (${pkg.relativePath})`);
      });
    }
  } else {
    lines.push('Single repository (not a monorepo)');
    lines.push(`Root: ${context.root}`);
  }

  return lines.join('\n');
}

module.exports = {
  detectWorkspaceType,
  findWorkspacePackages,
  findWorkspaceRoot,
  getWorkspaceContext,
  findAllContracts,
  suggestDirectories,
  formatWorkspaceInfo,
  WORKSPACE_TYPES,
};
