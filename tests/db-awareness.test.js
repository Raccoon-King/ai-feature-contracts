const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverDatabaseContext,
  saveDiscoveryArtifact,
  buildSchemaSnapshot,
  buildRelationsGraph,
  buildCodeAccessMap,
  refreshDatabaseArtifacts,
  lintDatabaseArtifacts,
  detectMigrationOrSchemaChanges,
  looksLikeDbChangeContract,
} = require('../lib/db-awareness.cjs');

describe('db-awareness', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-db-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFixtureRepo() {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: {
        prisma: '^5.0.0',
      },
    }, null, 2));
    fs.mkdirSync(path.join(tempDir, 'prisma'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'prisma', 'migrations', '001_init'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src', 'repositories'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'prisma', 'schema.prisma'), `
model User {
  id    Int    @id
  email String @unique
  posts Post[]
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'prisma', 'migrations', '001_init', 'migration.sql'), `
CREATE TABLE users (
  id INT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE posts (
  id INT PRIMARY KEY,
  author_id INT NOT NULL,
  CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'src', 'repositories', 'userRepository.ts'), `
export async function findUsers(prisma) {
  return prisma.user.findMany();
}

export async function createUser(db) {
  return db.query("INSERT INTO users (email) VALUES ($1)");
}
`, 'utf8');
  }

  test('discovers languages, DB hints, tooling, and candidate paths', () => {
    writeFixtureRepo();
    const result = discoverDatabaseContext(tempDir);

    expect(result.languages).toContain('node');
    expect(result.databases).toContain('postgres');
    expect(result.migrationTooling).toContain('prisma');
    expect(result.queryStyles).toContain('prisma');
    expect(result.candidatePaths.schemaFiles).toContain('prisma/schema.prisma');
    expect(result.candidatePaths.migrationFiles.some((file) => file.includes('migration.sql'))).toBe(true);
  });

  test('writes discovery artifact', () => {
    writeFixtureRepo();
    const result = saveDiscoveryArtifact(tempDir);

    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(result.outputPath, 'utf8')).candidatePaths.schemaFiles).toContain('prisma/schema.prisma');
  });

  test('builds schema snapshot and relations graph', () => {
    writeFixtureRepo();
    const discovery = discoverDatabaseContext(tempDir);
    const snapshot = buildSchemaSnapshot(tempDir, discovery);
    const relations = buildRelationsGraph(snapshot);

    expect(snapshot.entities.some((entity) => entity.name === 'User')).toBe(true);
    expect(snapshot.entities.some((entity) => entity.name === 'users')).toBe(true);
    expect(relations.edges.some((edge) => edge.from === 'Post' && edge.to === 'User')).toBe(true);
  });

  test('builds code access map with read/write targets', () => {
    writeFixtureRepo();
    const discovery = discoverDatabaseContext(tempDir);
    const map = buildCodeAccessMap(tempDir, discovery);

    expect(map.entries.some((entry) => entry.reads.includes('user'))).toBe(true);
    expect(map.entries.some((entry) => entry.writes.includes('users'))).toBe(true);
  });

  test('refreshes all DB artifacts and lints them successfully', () => {
    writeFixtureRepo();
    const result = refreshDatabaseArtifacts(tempDir);
    const lint = lintDatabaseArtifacts(tempDir);

    expect(fs.existsSync(result.paths.schemaSnapshotPath)).toBe(true);
    expect(fs.existsSync(result.paths.relationsGraphPath)).toBe(true);
    expect(fs.existsSync(result.paths.codeAccessMapPath)).toBe(true);
    expect(lint.errors).toHaveLength(0);
  });

  test('reports stale snapshot artifacts when source files changed after refresh', () => {
    writeFixtureRepo();
    refreshDatabaseArtifacts(tempDir);
    const migrationPath = path.join(tempDir, 'prisma', 'migrations', '001_init', 'migration.sql');
    const nextTime = new Date(Date.now() + 5000);
    fs.utimesSync(migrationPath, nextTime, nextTime);

    const lint = lintDatabaseArtifacts(tempDir);

    expect(lint.warnings.some((warning) => warning.includes('Stale schema snapshot'))).toBe(true);
  });

  test('detects migration and schema changes from changed file lists', () => {
    const result = detectMigrationOrSchemaChanges([
      'src/app.ts',
      'prisma/migrations/001_init/migration.sql',
    ]);

    expect(result).toBe(true);
    expect(detectMigrationOrSchemaChanges(['src/app.ts'])).toBe(false);
  });

  test('recognizes data-change contracts from explicit metadata or DB keywords', () => {
    expect(looksLikeDbChangeContract('**Data Change:** yes')).toBe(true);
    expect(looksLikeDbChangeContract('Add migration for users table')).toBe(true);
    expect(looksLikeDbChangeContract('Small UI tweak')).toBe(false);
  });
});
