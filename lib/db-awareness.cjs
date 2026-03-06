const fs = require('fs');
const path = require('path');

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

const DEFAULT_SCHEMA_HINTS = [
  'schema.prisma',
  'schema.sql',
  'db/schema.sql',
  'prisma/schema.prisma',
];

function normalizePath(value = '') {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listRepoFiles(rootDir, options = {}) {
  const ignoreDirs = new Set([...(options.ignoreDirs || []), ...DEFAULT_IGNORE_DIRS]);
  const includeExtensions = options.includeExtensions || null;
  const files = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    fs.readdirSync(currentDir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = normalizePath(path.relative(rootDir, fullPath));
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) return;
        walk(fullPath);
        return;
      }
      if (includeExtensions && !includeExtensions.includes(path.extname(entry.name).toLowerCase())) {
        return;
      }
      files.push(relativePath);
    });
  }

  walk(rootDir);
  return files.sort();
}

function readPackageSignals(cwd) {
  const packageJson = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageJson)) {
    return { packageManager: null, dependencies: {}, scripts: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    return {
      packageManager: parsed.packageManager || null,
      dependencies: {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {}),
      },
      scripts: parsed.scripts || {},
      workspaces: parsed.workspaces || [],
    };
  } catch {
    return { packageManager: null, dependencies: {}, scripts: {}, workspaces: [] };
  }
}

function detectDatabaseSystems(files, packageSignals) {
  const detected = new Set();
  const fileText = files.join('\n').toLowerCase();
  const deps = Object.keys(packageSignals.dependencies || {}).join('\n').toLowerCase();
  if (/postgres|pgsql|prisma|typeorm|drizzle|knex/.test(fileText) || /pg\b|postgres/.test(deps)) detected.add('postgres');
  if (/mysql|mariadb/.test(fileText) || /mysql/.test(deps)) detected.add('mysql');
  if (/sqlite/.test(fileText) || /sqlite/.test(deps)) detected.add('sqlite');
  if (/mongodb|mongoose/.test(fileText) || /mongoose|mongodb/.test(deps)) detected.add('mongodb');
  return [...detected];
}

function detectMigrationTooling(files, packageSignals) {
  const detected = new Set();
  const deps = Object.keys(packageSignals.dependencies || {}).join('\n').toLowerCase();
  files.forEach((file) => {
    const lower = file.toLowerCase();
    if (lower.includes('schema.prisma') || lower.includes('prisma/migrations/')) detected.add('prisma');
    if (lower.includes('alembic/')) detected.add('alembic');
    if (lower.includes('flyway')) detected.add('flyway');
    if (lower.includes('knexfile') || lower.includes('migrations/')) detected.add('generic-sql');
  });
  if (deps.includes('prisma')) detected.add('prisma');
  if (deps.includes('typeorm')) detected.add('typeorm');
  if (deps.includes('sequelize')) detected.add('sequelize');
  if (deps.includes('knex')) detected.add('knex');
  if (deps.includes('drizzle')) detected.add('drizzle');
  return [...detected];
}

function detectQueryStyles(files, packageSignals) {
  const detected = new Set();
  const deps = Object.keys(packageSignals.dependencies || {}).join('\n').toLowerCase();
  if (deps.includes('prisma')) detected.add('prisma');
  if (deps.includes('typeorm')) detected.add('typeorm');
  if (deps.includes('sequelize')) detected.add('sequelize');
  if (deps.includes('knex')) detected.add('knex');
  if (deps.includes('drizzle')) detected.add('drizzle');
  if (deps.includes('mongoose')) detected.add('mongoose');
  files.forEach((file) => {
    const lower = file.toLowerCase();
    if (lower.includes('repository') || lower.includes('/repositories/')) detected.add('repository-layer');
    if (lower.includes('dao') || lower.includes('/dao/')) detected.add('dao-layer');
    if (lower.endsWith('.sql')) detected.add('raw-sql');
  });
  return [...detected];
}

function inferLanguages(files) {
  const languages = new Set();
  files.forEach((file) => {
    const ext = path.extname(file).toLowerCase();
    if (['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx'].includes(ext)) languages.add('node');
    if (ext === '.py') languages.add('python');
    if (ext === '.go') languages.add('go');
    if (ext === '.java') languages.add('java');
    if (ext === '.rb') languages.add('ruby');
  });
  return [...languages];
}

function findCandidatePaths(files, config = {}) {
  const overrides = config?.dbGovernance?.discovery || {};
  const packageRoots = Array.isArray(overrides.packageRoots) ? overrides.packageRoots.map(normalizePath) : [];
  const schemaRoots = Array.isArray(overrides.schemaRoots) ? overrides.schemaRoots.map(normalizePath) : [];
  const migrationRoots = Array.isArray(overrides.migrationRoots) ? overrides.migrationRoots.map(normalizePath) : [];

  const schemaFiles = files.filter((file) => DEFAULT_SCHEMA_HINTS.includes(file) || /schema\.(prisma|sql)$/i.test(file));
  const migrationFiles = files.filter((file) => /migrations?\//i.test(file) || /alembic/i.test(file) || /flyway/i.test(file));
  const codePaths = files.filter((file) => /(dao|repository|repositories|model|service|db|prisma|typeorm|sequelize|query)/i.test(file));

  return {
    packageRoots: [...new Set(packageRoots)],
    schemaRoots: [...new Set([...schemaRoots, ...schemaFiles.map((file) => normalizePath(path.dirname(file)))])].filter(Boolean),
    migrationRoots: [...new Set([...migrationRoots, ...migrationFiles.map((file) => normalizePath(path.dirname(file)))])].filter(Boolean),
    schemaFiles,
    migrationFiles,
    codePaths: codePaths.slice(0, 200),
  };
}

function discoverDatabaseContext(cwd, options = {}) {
  const config = options.config || {};
  const files = listRepoFiles(cwd, {
    includeExtensions: ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.java', '.rb', '.sql', '.prisma', '.yaml', '.yml', '.json'],
  });
  const packageSignals = readPackageSignals(cwd);
  const candidates = findCandidatePaths(files, config);
  const artifact = {
    generatedAt: new Date().toISOString(),
    root: normalizePath(cwd),
    languages: inferLanguages(files),
    packageManager: packageSignals.packageManager,
    databases: detectDatabaseSystems(files, packageSignals),
    migrationTooling: detectMigrationTooling(files, packageSignals),
    queryStyles: detectQueryStyles(files, packageSignals),
    constraints: config?.dbGovernance?.constraints || {},
    packageRoots: candidates.packageRoots,
    candidatePaths: {
      schemaRoots: candidates.schemaRoots,
      migrationRoots: candidates.migrationRoots,
      schemaFiles: candidates.schemaFiles,
      migrationFiles: candidates.migrationFiles,
      codePaths: candidates.codePaths,
    },
  };
  return artifact;
}

function getDbArtifactPaths(cwd) {
  const dbDir = path.join(cwd, '.grabby', 'db');
  return {
    dbDir,
    discoveryPath: path.join(dbDir, 'discovery.json'),
    schemaSnapshotPath: path.join(dbDir, 'schema.snapshot.json'),
    relationsGraphPath: path.join(dbDir, 'relations.graph.json'),
    codeAccessMapPath: path.join(dbDir, 'code_access_map.json'),
  };
}

function saveDiscoveryArtifact(cwd, options = {}) {
  const artifact = discoverDatabaseContext(cwd, options);
  const paths = getDbArtifactPaths(cwd);
  return {
    artifact,
    outputPath: writeJson(paths.discoveryPath, artifact),
  };
}

function parsePrismaSchemaFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const entities = [];
  const relations = [];
  let current = null;

  lines.forEach((line) => {
    const modelStart = line.match(/^\s*model\s+([A-Za-z0-9_]+)\s+\{/);
    if (modelStart) {
      current = { name: modelStart[1], kind: 'table', source: normalizePath(filePath), columns: [], indexes: [] };
      entities.push(current);
      return;
    }
    if (current && /^\s*\}/.test(line)) {
      current = null;
      return;
    }
    if (!current) return;
    const fieldMatch = line.match(/^\s*([A-Za-z0-9_]+)\s+([A-Za-z0-9_\[\]?]+)(.*)$/);
    if (!fieldMatch) return;
    const [, name, rawType, trailing] = fieldMatch;
    const column = {
      name,
      type: rawType.replace(/\?$/, ''),
      nullable: rawType.endsWith('?'),
      primaryKey: /@id\b/.test(trailing),
      unique: /@unique\b/.test(trailing),
    };
    current.columns.push(column);
    const relationMatch = trailing.match(/@relation\(([^)]*)\)/);
    if (relationMatch) {
      const referencesMatch = relationMatch[1].match(/references:\s*\[([^\]]+)\]/);
      const fieldsMatch = relationMatch[1].match(/fields:\s*\[([^\]]+)\]/);
      relations.push({
        source: current.name,
        sourceField: fieldsMatch ? fieldsMatch[1].split(',').map((item) => item.trim()) : [name],
        target: column.type.replace(/\[\]$/, '').replace(/\?$/, ''),
        targetField: referencesMatch ? referencesMatch[1].split(',').map((item) => item.trim()) : [],
        onDelete: relationMatch[1].match(/onDelete:\s*([A-Za-z]+)/)?.[1] || 'unknown',
        onUpdate: relationMatch[1].match(/onUpdate:\s*([A-Za-z]+)/)?.[1] || 'unknown',
        sourceType: 'prisma',
      });
    }
  });

  return { entities, relations, sourceType: 'prisma' };
}

function parseSqlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const entities = [];
  const relations = [];
  const createTablePattern = /create\s+table\s+("?[\w.]+"?)\s*\(([\s\S]*?)\);/gi;
  const fkPattern = /foreign\s+key\s*\(([^)]+)\)\s+references\s+("?[\w.]+"?)\s*\(([^)]+)\)([\s\S]*?)(?:,|\n|$)/gi;
  let match;

  while ((match = createTablePattern.exec(content)) !== null) {
    const tableName = match[1].replace(/"/g, '');
    const body = match[2];
    const columns = body.split(',\n').map((line) => line.trim()).filter(Boolean)
      .filter((line) => !/^foreign key/i.test(line) && !/^constraint/i.test(line));
    const parsedColumns = columns.map((line) => {
      const parts = line.replace(/,$/, '').trim().split(/\s+/);
      return {
        name: (parts[0] || '').replace(/"/g, ''),
        type: parts[1] || 'unknown',
        nullable: !/not null/i.test(line),
        primaryKey: /primary key/i.test(line),
        unique: /\bunique\b/i.test(line),
      };
    }).filter((column) => column.name);
    entities.push({
      name: tableName,
      kind: 'table',
      source: normalizePath(filePath),
      columns: parsedColumns,
      indexes: [],
    });

    let fkMatch;
    while ((fkMatch = fkPattern.exec(body)) !== null) {
      const tail = fkMatch[4] || '';
      relations.push({
        source: tableName,
        sourceField: fkMatch[1].split(',').map((item) => item.replace(/"/g, '').trim()),
        target: fkMatch[2].replace(/"/g, ''),
        targetField: fkMatch[3].split(',').map((item) => item.replace(/"/g, '').trim()),
        onDelete: tail.match(/on delete\s+([a-z]+)/i)?.[1]?.toLowerCase() || 'unknown',
        onUpdate: tail.match(/on update\s+([a-z]+)/i)?.[1]?.toLowerCase() || 'unknown',
        sourceType: 'sql',
      });
    }
  }

  const alterPattern = /alter\s+table\s+("?[\w.]+"?)\s+add\s+constraint\s+("?[\w.]+"?)\s+foreign\s+key\s*\(([^)]+)\)\s+references\s+("?[\w.]+"?)\s*\(([^)]+)\)([\s\S]*?);/gi;
  while ((match = alterPattern.exec(content)) !== null) {
    const tail = match[6] || '';
    relations.push({
      source: match[1].replace(/"/g, ''),
      sourceField: match[3].split(',').map((item) => item.replace(/"/g, '').trim()),
      target: match[4].replace(/"/g, ''),
      targetField: match[5].split(',').map((item) => item.replace(/"/g, '').trim()),
      onDelete: tail.match(/on delete\s+([a-z]+)/i)?.[1]?.toLowerCase() || 'unknown',
      onUpdate: tail.match(/on update\s+([a-z]+)/i)?.[1]?.toLowerCase() || 'unknown',
      sourceType: 'sql',
    });
  }

  return { entities, relations, sourceType: 'sql' };
}

function mergeSchemaData(inputs) {
  const entitiesByName = new Map();
  const relations = [];
  inputs.forEach((input) => {
    (input.entities || []).forEach((entity) => {
      if (!entitiesByName.has(entity.name)) {
        entitiesByName.set(entity.name, entity);
      }
    });
    (input.relations || []).forEach((relation) => relations.push(relation));
  });

  return {
    entities: [...entitiesByName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    relations: relations.sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`)),
  };
}

function buildSchemaSnapshot(cwd, discovery) {
  const inputFiles = [
    ...(discovery?.candidatePaths?.schemaFiles || []),
    ...(discovery?.candidatePaths?.migrationFiles || []),
  ].map((file) => path.join(cwd, file))
    .filter((filePath) => fs.existsSync(filePath));

  const parsedInputs = inputFiles.map((filePath) => {
    if (filePath.endsWith('.prisma')) return parsePrismaSchemaFile(filePath);
    if (filePath.endsWith('.sql')) return parseSqlFile(filePath);
    return { entities: [], relations: [], sourceType: 'unknown' };
  });

  const merged = mergeSchemaData(parsedInputs);
  return {
    generatedAt: new Date().toISOString(),
    inputs: inputFiles.map((filePath) => normalizePath(path.relative(cwd, filePath))),
    entities: merged.entities,
    relations: merged.relations,
    warnings: inputFiles.length === 0 ? ['No schema or migration inputs discovered.'] : [],
  };
}

function buildRelationsGraph(snapshot) {
  return {
    generatedAt: new Date().toISOString(),
    nodes: (snapshot.entities || []).map((entity) => ({ id: entity.name, kind: entity.kind || 'table' })),
    edges: (snapshot.relations || []).map((relation) => ({
      from: relation.source,
      to: relation.target,
      sourceField: relation.sourceField,
      targetField: relation.targetField,
      onDelete: relation.onDelete || 'unknown',
      onUpdate: relation.onUpdate || 'unknown',
      sourceType: relation.sourceType || 'unknown',
    })),
  };
}

function extractSqlTableOperations(content) {
  const reads = new Set();
  const writes = new Set();
  const selectMatches = content.match(/select[\s\S]{0,200}?from\s+["`]?([a-zA-Z0-9_]+)/gi) || [];
  const insertMatches = content.match(/insert\s+into\s+["`]?([a-zA-Z0-9_]+)/gi) || [];
  const updateMatches = content.match(/update\s+["`]?([a-zA-Z0-9_]+)/gi) || [];
  const deleteMatches = content.match(/delete\s+from\s+["`]?([a-zA-Z0-9_]+)/gi) || [];

  selectMatches.forEach((entry) => reads.add(entry.match(/from\s+["`]?([a-zA-Z0-9_]+)/i)?.[1]));
  insertMatches.forEach((entry) => writes.add(entry.match(/into\s+["`]?([a-zA-Z0-9_]+)/i)?.[1]));
  updateMatches.forEach((entry) => writes.add(entry.match(/update\s+["`]?([a-zA-Z0-9_]+)/i)?.[1]));
  deleteMatches.forEach((entry) => writes.add(entry.match(/from\s+["`]?([a-zA-Z0-9_]+)/i)?.[1]));

  return {
    reads: [...reads].filter(Boolean),
    writes: [...writes].filter(Boolean),
  };
}

function extractPrismaOperations(content) {
  const reads = new Set();
  const writes = new Set();
  const readPattern = /prisma\.([a-zA-Z0-9_]+)\.(findMany|findUnique|findFirst|count|aggregate)/g;
  const writePattern = /prisma\.([a-zA-Z0-9_]+)\.(create|update|delete|upsert|createMany|updateMany|deleteMany)/g;
  let match;
  while ((match = readPattern.exec(content)) !== null) reads.add(match[1]);
  while ((match = writePattern.exec(content)) !== null) writes.add(match[1]);
  return { reads: [...reads], writes: [...writes] };
}

function extractCandidateSymbols(content) {
  const symbols = new Set();
  const functionPattern = /function\s+([A-Za-z0-9_]+)/g;
  const constPattern = /const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g;
  let match;
  while ((match = functionPattern.exec(content)) !== null) symbols.add(match[1]);
  while ((match = constPattern.exec(content)) !== null) symbols.add(match[1]);
  return [...symbols];
}

function buildCodeAccessMap(cwd, discovery) {
  const sourceFiles = listRepoFiles(cwd, {
    includeExtensions: ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.java'],
  }).filter((file) => {
    const lower = file.toLowerCase();
    return /(dao|repository|repositories|service|model|db|prisma|typeorm|sequelize|query|store)/.test(lower);
  });

  const entries = [];
  sourceFiles.forEach((relativePath) => {
    const fullPath = path.join(cwd, relativePath);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      return;
    }
    const sqlOps = extractSqlTableOperations(content);
    const prismaOps = extractPrismaOperations(content);
    const reads = [...new Set([...sqlOps.reads, ...prismaOps.reads])];
    const writes = [...new Set([...sqlOps.writes, ...prismaOps.writes])];
    if (reads.length === 0 && writes.length === 0) return;

    const symbols = extractCandidateSymbols(content);
    const baseEntry = {
      file: normalizePath(relativePath),
      reads,
      writes,
      confidence: content.includes('prisma.') || /select|insert|update|delete/i.test(content) ? 'high' : 'medium',
      sources: [
        ...(sqlOps.reads.length || sqlOps.writes.length ? ['sql-pattern'] : []),
        ...(prismaOps.reads.length || prismaOps.writes.length ? ['prisma-pattern'] : []),
      ],
      package: inferPackageOwner(cwd, relativePath, discovery?.packageRoots || []),
    };

    if (symbols.length === 0) {
      entries.push({ symbol: null, ...baseEntry });
      return;
    }
    symbols.forEach((symbol) => entries.push({ symbol, ...baseEntry }));
  });

  return {
    generatedAt: new Date().toISOString(),
    entries: entries.sort((a, b) => `${a.file}:${a.symbol || ''}`.localeCompare(`${b.file}:${b.symbol || ''}`)),
  };
}

function inferPackageOwner(cwd, relativePath, packageRoots = []) {
  const normalized = normalizePath(relativePath);
  const explicit = packageRoots.find((root) => normalized.startsWith(`${normalizePath(root)}/`) || normalized === normalizePath(root));
  if (explicit) return normalizePath(explicit);

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

function refreshDatabaseArtifacts(cwd, options = {}) {
  const discovery = discoverDatabaseContext(cwd, options);
  const snapshot = buildSchemaSnapshot(cwd, discovery);
  const relations = buildRelationsGraph(snapshot);
  const codeAccessMap = buildCodeAccessMap(cwd, discovery);
  const paths = getDbArtifactPaths(cwd);

  writeJson(paths.discoveryPath, discovery);
  writeJson(paths.schemaSnapshotPath, snapshot);
  writeJson(paths.relationsGraphPath, relations);
  writeJson(paths.codeAccessMapPath, codeAccessMap);

  return {
    discovery,
    snapshot,
    relations,
    codeAccessMap,
    paths,
  };
}

function findRelevantSourceFiles(discovery) {
  const files = [
    ...(discovery?.candidatePaths?.schemaFiles || []),
    ...(discovery?.candidatePaths?.migrationFiles || []),
    ...(discovery?.candidatePaths?.codePaths || []),
  ];
  return [...new Set(files
    .map((filePath) => normalizePath(filePath))
    .filter((filePath) => filePath && !filePath.startsWith('.grabby/')))];
}

function lintDatabaseArtifacts(cwd, options = {}) {
  const strict = options.strict === true;
  const paths = getDbArtifactPaths(cwd);
  const errors = [];
  const warnings = [];
  const parsed = {};

  ['discoveryPath', 'schemaSnapshotPath', 'relationsGraphPath', 'codeAccessMapPath'].forEach((key) => {
    const filePath = paths[key];
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing artifact: ${normalizePath(path.relative(cwd, filePath))}`);
      return;
    }
    try {
      parsed[key] = readJson(filePath);
    } catch (error) {
      errors.push(`Invalid JSON artifact: ${normalizePath(path.relative(cwd, filePath))} (${error.message})`);
    }
  });

  if (parsed.discoveryPath && parsed.schemaSnapshotPath) {
    const sourceFiles = findRelevantSourceFiles(parsed.discoveryPath);
    const snapshotMtime = fs.existsSync(paths.schemaSnapshotPath) ? fs.statSync(paths.schemaSnapshotPath).mtimeMs : 0;
    sourceFiles.forEach((relativePath) => {
      const fullPath = path.join(cwd, relativePath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).mtimeMs > snapshotMtime) {
        warnings.push(`Stale schema snapshot: ${relativePath}`);
      }
    });
  }

  if (parsed.schemaSnapshotPath && parsed.relationsGraphPath) {
    const entityIds = new Set((parsed.schemaSnapshotPath.entities || []).map((entity) => entity.name));
    (parsed.relationsGraphPath.edges || []).forEach((edge) => {
      if (!entityIds.has(edge.from) || !entityIds.has(edge.to)) {
        warnings.push(`Relation edge references unknown entity: ${edge.from} -> ${edge.to}`);
      }
    });
  }

  const valid = errors.length === 0 && (!strict || warnings.length === 0);
  return { valid, errors, warnings, paths };
}

function looksLikeDbChangeContract(content) {
  if (!content) return false;
  return /\*\*Data Change:\*\*\s*yes/i.test(content)
    || /## Data Impact/i.test(content)
    || /migration|schema|database|backfill|foreign key|cascade/i.test(content);
}

function detectMigrationOrSchemaChanges(changedFiles = [], config = {}) {
  const overrides = config?.dbGovernance?.discovery || {};
  const migrationRoots = Array.isArray(overrides.migrationRoots) ? overrides.migrationRoots.map(normalizePath) : [];
  const schemaRoots = Array.isArray(overrides.schemaRoots) ? overrides.schemaRoots.map(normalizePath) : [];

  return changedFiles.some((file) => {
    const normalized = normalizePath(file).toLowerCase();
    if (/schema\.(sql|prisma)$/i.test(normalized)) return true;
    if (/migrations?\//i.test(normalized) || /alembic/i.test(normalized) || /flyway/i.test(normalized)) return true;
    if (migrationRoots.some((root) => normalized.startsWith(`${root.toLowerCase()}/`) || normalized === root.toLowerCase())) return true;
    if (schemaRoots.some((root) => normalized.startsWith(`${root.toLowerCase()}/`) || normalized === root.toLowerCase())) return true;
    return false;
  });
}

module.exports = {
  normalizePath,
  listRepoFiles,
  readPackageSignals,
  discoverDatabaseContext,
  saveDiscoveryArtifact,
  getDbArtifactPaths,
  buildSchemaSnapshot,
  buildRelationsGraph,
  buildCodeAccessMap,
  refreshDatabaseArtifacts,
  lintDatabaseArtifacts,
  detectMigrationOrSchemaChanges,
  looksLikeDbChangeContract,
  generateDbArtifacts: refreshDatabaseArtifacts,
};
