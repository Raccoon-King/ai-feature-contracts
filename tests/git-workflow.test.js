const fs = require('fs');
const os = require('os');
const path = require('path');
const git = require('../lib/git-workflow.cjs');

function createExec(responses = {}) {
  const calls = [];
  const exec = (command) => {
    calls.push(command);
    if (Object.prototype.hasOwnProperty.call(responses, command)) {
      const value = responses[command];
      if (value instanceof Error) throw value;
      return value;
    }
    throw new Error(`Unexpected command: ${command}`);
  };
  exec.calls = calls;
  return exec;
}

describe('git-workflow', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-git-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('summarizes git branch, upstream, divergence, dirty state, and stashes', () => {
    const exec = createExec({
      'git rev-parse --is-inside-work-tree': 'true',
      'git rev-parse --abbrev-ref HEAD': 'feat/FC-123-valid-feature',
      'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/feat/FC-123-valid-feature',
      'git remote get-url origin': 'git@gitlab.com:team/repo.git',
      'git status --porcelain=v1 --branch': '## feat/FC-123-valid-feature...origin/feat/FC-123-valid-feature [ahead 2, behind 1]\n M src/app.ts\n?? scratch.txt',
      'git rev-list --left-right --count origin/feat/FC-123-valid-feature...HEAD': '1 2',
      'git stash list': 'stash@{0}: WIP on feat/FC-123-valid-feature',
    });

    const summary = git.summarizeGitStatus(tempDir, exec, { gitGovernance: { defaultBranch: 'main', protectedBranches: ['main'] } });

    expect(summary.branch).toBe('feat/FC-123-valid-feature');
    expect(summary.upstream).toBe('origin/feat/FC-123-valid-feature');
    expect(summary.ahead).toBe(2);
    expect(summary.behind).toBe(1);
    expect(summary.dirty).toBe(true);
    expect(summary.untrackedCount).toBe(1);
    expect(summary.stashCount).toBe(1);
    expect(summary.remote.hosting).toBe('gitlab');
  });

  test('sync fetches origin and records git state', () => {
    const exec = createExec({
      'git rev-parse --is-inside-work-tree': 'true',
      'git fetch origin': '',
      'git rev-parse --abbrev-ref HEAD': 'feat/FC-123-valid-feature',
      'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/feat/FC-123-valid-feature',
      'git remote get-url origin': 'git@github.com:team/repo.git',
      'git status --porcelain=v1 --branch': '## feat/FC-123-valid-feature...origin/feat/FC-123-valid-feature',
      'git rev-list --left-right --count origin/feat/FC-123-valid-feature...HEAD': '0 0',
      'git stash list': '',
    });

    const result = git.syncWithRemote(tempDir, exec, { gitGovernance: { defaultBranch: 'main' } });
    const state = JSON.parse(fs.readFileSync(result.statePath, 'utf8'));

    expect(exec.calls).toContain('git fetch origin');
    expect(state.defaultBranch).toBe('main');
    expect(state.lastFetchTime).toBeTruthy();
  });

  test('creates a branch from a clean workspace and suggests publish when no upstream exists yet', () => {
    const exec = createExec({
      'git rev-parse --is-inside-work-tree': 'true',
      'git rev-parse --abbrev-ref HEAD': 'main',
      'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/main',
      'git remote get-url origin': 'git@gitlab.com:team/repo.git',
      'git status --porcelain=v1 --branch': '## main...origin/main',
      'git rev-list --left-right --count origin/main...HEAD': '0 0',
      'git stash list': '',
      'git show-ref --verify refs/heads/feat/FC-123-valid-feature': '',
      'git checkout -b feat/FC-123-valid-feature': '',
      'git ls-remote --heads origin feat/FC-123-valid-feature': '',
    });

    const result = git.createBranchFromContract({
      cwd: tempDir,
      execSyncImpl: exec,
      config: { gitGovernance: { defaultBranch: 'main' } },
      branchName: 'feat/FC-123-valid-feature',
      publish: false,
    });

    expect(result.upstreamSet).toBe(false);
    expect(result.publishSuggested).toBe(true);
    expect(exec.calls).toContain('git checkout -b feat/FC-123-valid-feature');
  });

  test('blocks updates on protected branches and returns conflict guidance on rebase failure', () => {
    const protectedExec = createExec({
      'git rev-parse --is-inside-work-tree': 'true',
      'git rev-parse --abbrev-ref HEAD': 'main',
      'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/main',
      'git remote get-url origin': 'git@gitlab.com:team/repo.git',
      'git status --porcelain=v1 --branch': '## main...origin/main',
      'git rev-list --left-right --count origin/main...HEAD': '0 0',
      'git stash list': '',
    });

    expect(() => git.updateCurrentBranch(tempDir, protectedExec, { gitGovernance: { defaultBranch: 'main', protectedBranches: ['main'] } }))
      .toThrow(/Protected branch/);

    const conflictExec = createExec({
      'git rev-parse --is-inside-work-tree': 'true',
      'git rev-parse --abbrev-ref HEAD': 'feat/FC-123-valid-feature',
      'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/feat/FC-123-valid-feature',
      'git remote get-url origin': 'git@gitlab.com:team/repo.git',
      'git status --porcelain=v1 --branch': '## feat/FC-123-valid-feature...origin/feat/FC-123-valid-feature',
      'git rev-list --left-right --count origin/feat/FC-123-valid-feature...HEAD': '0 0',
      'git stash list': '',
      'git fetch origin': '',
      'git rebase origin/main': new Error('conflict'),
    });

    const result = git.updateCurrentBranch(tempDir, conflictExec, { gitGovernance: { defaultBranch: 'main', protectedBranches: ['main'], updateStrategy: 'rebase' } });
    expect(result.ok).toBe(false);
    expect(result.conflictChecklist[0]).toContain('origin/main');
  });

  test('preflight catches branch mismatch and unknown required commands', () => {
    const exec = createExec({
      'git rev-parse --is-inside-work-tree': 'true',
      'git rev-parse --abbrev-ref HEAD': 'feat/FC-999-other-work',
      'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/feat/FC-999-other-work',
      'git remote get-url origin': 'git@gitlab.com:team/repo.git',
      'git status --porcelain=v1 --branch': '## feat/FC-999-other-work...origin/feat/FC-999-other-work [behind 2]',
      'git rev-list --left-right --count origin/feat/FC-999-other-work...HEAD': '2 0',
      'git stash list': '',
    });

    const result = git.preflightGitState({
      cwd: tempDir,
      execSyncImpl: exec,
      config: { gitGovernance: { defaultBranch: 'main', requiredChecks: ['lint', 'test', 'guard'], freshnessThresholdBehind: 0 } },
      contractId: 'FC-123',
      expectedBranch: 'feat/FC-123-valid-feature',
      hasPlan: false,
      requiredChecksKnown: { lint: true, test: false, build: false, guard: true },
      policyTriggered: true,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Current branch does not match contract branch. Expected feat/FC-123-valid-feature, found feat/FC-999-other-work.',
      'Branch is behind origin/feat/FC-999-other-work by 2 commit(s); threshold is 0.',
      'Contract plan is required before git preflight passes for governed changes.',
      'Required test command is not known in repo scripts/config.',
    ]));
  });
});
