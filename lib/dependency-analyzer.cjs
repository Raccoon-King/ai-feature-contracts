/**
 * Dependency analyzer for contracts
 * Analyzes file dependencies and detects potential issues
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

function normalizePath(value = '') {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '');
}

function listCodeFiles(cwd, options = {}) {
  const ignoreDirs = new Set([...(options.ignoreDirs || []), ...DEFAULT_IGNORED_DIRS]);
  const includeExtensions = options.includeExtensions || ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.java'];
  const files = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    fs.readdirSync(currentDir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) return;
        walk(fullPath);
        return;
      }
      if (!includeExtensions.includes(path.extname(entry.name).toLowerCase())) return;
      files.push(normalizePath(path.relative(cwd, fullPath)));
    });
  }

  walk(cwd);
  return files.sort();
}

function extractImports(content = '') {
  const edges = [];
  const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const importPattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  const bareImportPattern = /import\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = requirePattern.exec(content)) !== null) {
    edges.push(match[1]);
  }
  while ((match = importPattern.exec(content)) !== null) {
    edges.push(match[1]);
  }
  while ((match = bareImportPattern.exec(content)) !== null) {
    edges.push(match[1]);
  }

  return edges;
}

function resolveImportPath(fromFile, specifier) {
  if (!specifier) return null;
  if (specifier.startsWith('.')) {
    const baseDir = path.dirname(fromFile);
    const resolved = normalizePath(path.join(baseDir, specifier));
    return path.extname(resolved) ? resolved : `${resolved}.js`;
  }
  return specifier;
}

function inferPackageOwner(cwd, relativePath) {
  const normalized = normalizePath(relativePath);
  const segments = normalized.split('/');
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments.slice(0, index).join('/');
    if (!candidate) continue;
    if (fs.existsSync(path.join(cwd, candidate, 'package.json'))) {
      return normalizePath(candidate);
    }
  }
  return '.';
}

/**
 * Parse file paths from contract
 */
function parseContractFiles(content) {
  const files = [];
  const filesMatch = content.match(/## Files[\s\S]*?(?=## |$)/);

  if (!filesMatch) return files;

  const rows = filesMatch[0].split('\n').filter(row =>
    row.startsWith('|') && !row.includes('Action') && !row.includes('---')
  );

  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length >= 2) {
      files.push({
        action: cols[0].toLowerCase(),
        path: cols[1].replace(/`/g, ''),
        reason: cols[2] || '',
      });
    }
  }

  return files;
}

/**
 * Build a simple dependency graph from imports/requires in existing files
 */
function buildDependencyGraph(cwd, files) {
  const graph = new Map();

  for (const file of files) {
    const fullPath = path.join(cwd, file.path);
    const deps = [];

    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');

        // Match require() statements
        const requires = content.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
        for (const req of requires) {
          const match = req.match(/['"]([^'"]+)['"]/);
          if (match && match[1].startsWith('.')) {
            deps.push(resolveRelativePath(file.path, match[1]));
          }
        }

        // Match import statements
        const imports = content.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g) || [];
        for (const imp of imports) {
          const match = imp.match(/from\s+['"]([^'"]+)['"]/);
          if (match && match[1].startsWith('.')) {
            deps.push(resolveRelativePath(file.path, match[1]));
          }
        }
      } catch {
        // File might not be readable
      }
    }

    graph.set(file.path, {
      action: file.action,
      dependencies: [...new Set(deps)],
      dependents: [], // Will be populated in second pass
    });
  }

  // Second pass: populate dependents
  for (const [filePath, data] of graph) {
    for (const dep of data.dependencies) {
      const depData = graph.get(dep);
      if (depData) {
        depData.dependents.push(filePath);
      }
    }
  }

  return graph;
}

function resolveRelativePath(from, relativePath) {
  const dir = path.dirname(from);
  let resolved = normalizePath(path.join(dir, relativePath));

  // Add extension if missing
  if (!path.extname(resolved)) {
    resolved += '.js'; // Default assumption
  }

  return resolved;
}

function discoverRepositoryDependencyGraph(cwd, options = {}) {
  const files = listCodeFiles(cwd, options);
  const edges = [];
  const nodes = [];

  files.forEach((relativePath) => {
    const fullPath = path.join(cwd, relativePath);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      return;
    }
    nodes.push({
      id: relativePath,
      package: inferPackageOwner(cwd, relativePath),
    });
    extractImports(content).forEach((specifier) => {
      edges.push({
        from: relativePath,
        to: resolveImportPath(relativePath, specifier),
        kind: specifier.startsWith('.') ? 'relative' : 'package',
      });
    });
  });

  return {
    generatedAt: new Date().toISOString(),
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
  };
}

function saveRepositoryDependencyGraph(cwd, options = {}) {
  const artifact = discoverRepositoryDependencyGraph(cwd, options);
  const outputPath = path.join(cwd, '.grabby', 'code', 'dependency_graph.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  return { artifact, outputPath };
}

/**
 * Detect circular dependencies
 */
function detectCircularDeps(graph) {
  const circular = [];
  const visited = new Set();
  const stack = new Set();

  function dfs(node, path = []) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      circular.push(path.slice(cycleStart).concat(node));
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);

    const data = graph.get(node);
    if (data) {
      for (const dep of data.dependencies) {
        dfs(dep, [...path, node]);
      }
    }

    stack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  return circular;
}

/**
 * Find high-impact files (many dependents)
 */
function findHighImpactFiles(graph, threshold = 3) {
  const highImpact = [];

  for (const [filePath, data] of graph) {
    if (data.dependents.length >= threshold) {
      highImpact.push({
        path: filePath,
        dependentCount: data.dependents.length,
        dependents: data.dependents,
        action: data.action,
      });
    }
  }

  return highImpact.sort((a, b) => b.dependentCount - a.dependentCount);
}

/**
 * Analyze contract dependencies
 */
function analyzeContractDeps(content, cwd = process.cwd()) {
  const files = parseContractFiles(content);
  const graph = buildDependencyGraph(cwd, files);
  const circular = detectCircularDeps(graph);
  const highImpact = findHighImpactFiles(graph);

  const warnings = [];

  if (circular.length > 0) {
    warnings.push({
      type: 'circular-dependency',
      message: `Found ${circular.length} circular dependency chain(s)`,
      details: circular,
    });
  }

  for (const file of highImpact) {
    if (file.action === 'modify') {
      warnings.push({
        type: 'high-impact-modify',
        message: `Modifying high-impact file: ${file.path} (${file.dependentCount} dependents)`,
        details: file.dependents,
      });
    }
  }

  // Check for orphan files (created but not imported anywhere)
  const newFiles = files.filter(f => f.action === 'create');
  for (const file of newFiles) {
    const data = graph.get(file.path);
    if (data && data.dependents.length === 0 && !file.path.includes('test')) {
      warnings.push({
        type: 'orphan-file',
        message: `New file ${file.path} is not imported by any other file`,
        severity: 'info',
      });
    }
  }

  return {
    files: files.length,
    graph: Object.fromEntries(graph),
    circular,
    highImpact,
    warnings,
  };
}

/**
 * Check if contract files conflict with existing code
 */
function checkFileConflicts(content, cwd = process.cwd()) {
  const files = parseContractFiles(content);
  const conflicts = [];

  for (const file of files) {
    const fullPath = path.join(cwd, file.path);
    const exists = fs.existsSync(fullPath);

    if (file.action === 'create' && exists) {
      conflicts.push({
        type: 'create-exists',
        path: file.path,
        message: `Contract wants to create ${file.path} but it already exists`,
      });
    }

    if (file.action === 'modify' && !exists) {
      conflicts.push({
        type: 'modify-missing',
        path: file.path,
        message: `Contract wants to modify ${file.path} but it doesn't exist`,
      });
    }
  }

  return conflicts;
}

/**
 * Suggest missing dependencies based on file patterns
 */
function suggestDependencies(content) {
  const suggestions = [];
  const lowerContent = content.toLowerCase();

  const depPatterns = [
    { pattern: /\.test\.(js|ts|jsx|tsx)/, deps: ['jest', '@testing-library/react'], when: 'testing' },
    { pattern: /api.*endpoint|rest.*api/i, deps: ['express', 'fastify'], when: 'API development' },
    { pattern: /graphql/i, deps: ['graphql', 'apollo-server'], when: 'GraphQL' },
    { pattern: /websocket|real-?time/i, deps: ['ws', 'socket.io'], when: 'WebSockets' },
    { pattern: /database|postgres|mysql|mongo/i, deps: ['prisma', 'typeorm', 'mongoose'], when: 'database' },
    { pattern: /validation|schema|zod|yup/i, deps: ['zod', 'yup', 'joi'], when: 'validation' },
  ];

  for (const { pattern, deps, when } of depPatterns) {
    if (pattern.test(content) || pattern.test(lowerContent)) {
      suggestions.push({
        context: when,
        suggested: deps,
        message: `Consider adding ${deps.join(' or ')} for ${when}`,
      });
    }
  }

  return suggestions;
}

module.exports = {
  normalizePath,
  listCodeFiles,
  extractImports,
  parseContractFiles,
  buildDependencyGraph,
  detectCircularDeps,
  findHighImpactFiles,
  analyzeContractDeps,
  checkFileConflicts,
  suggestDependencies,
  discoverRepositoryDependencyGraph,
  saveRepositoryDependencyGraph,
};
