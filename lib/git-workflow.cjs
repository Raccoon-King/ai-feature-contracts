const fs = require('fs');
const path = require('path');
const { ensureParentDir, readJsonSafe, writeJsonAtomic } = require('./fs-utils.cjs');

function normalizePath(value = '') {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '');
}

function getGitStatePath(cwd) {
  return path.join(cwd, '.grabby', 'git', 'state.json');
}

function defaultGitState(config = {}) {
  const git = config.gitGovernance || {};
  return {
    defaultBranch: git.defaultBranch || 'main',
    lastFetchTime: null,
    preferredUpdateStrategy: git.updateStrategy || 'repo-default',
    protectedBranches: Array.isArray(git.protectedBranches) ? git.protectedBranches : ['main', 'master'],
  };
}

function loadGitState(cwd, config = {}) {
  const filePath = getGitStatePath(cwd);
  const fallback = defaultGitState(config);
  const saved = readJsonSafe(filePath, {});
  return { ...fallback, ...saved };
}

function saveGitState(cwd, state, config = {}) {
  const filePath = getGitStatePath(cwd);
  const payload = {
    ...defaultGitState(config),
    ...state,
  };
  writeJsonAtomic(filePath, payload);
  return filePath;
}

function runGit(execSyncImpl, cwd, command, options = {}) {
  const result = execSyncImpl(command, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  return typeof result === 'string' ? result.trim() : String(result || '').trim();
}

function tryGit(execSyncImpl, cwd, command, options = {}) {
  try {
    return { ok: true, value: runGit(execSyncImpl, cwd, command, options) };
  } catch (error) {
    return { ok: false, error };
  }
}

function ensureGitRepository(execSyncImpl, cwd) {
  const probe = tryGit(execSyncImpl, cwd, 'git rev-parse --is-inside-work-tree');
  if (!probe.ok || probe.value !== 'true') {
    throw new Error('Not a git repository');
  }
}

function countStashEntries(execSyncImpl, cwd) {
  const result = tryGit(execSyncImpl, cwd, 'git stash list');
  if (!result.ok || !result.value) return 0;
  return result.value.split(/\r?\n/).filter(Boolean).length;
}

function parsePorcelainStatus(output = '') {
  const lines = String(output).split(/\r?\n/).filter(Boolean);
  let branchLine = '';
  const entries = [];
  lines.forEach((line) => {
    if (line.startsWith('## ')) {
      branchLine = line;
    } else {
      entries.push(line);
    }
  });

  const summary = {
    branchLine,
    dirty: entries.length > 0,
    stagedCount: entries.filter((line) => line[0] && line[0] !== '?' && line[0] !== ' ').length,
    unstagedCount: entries.filter((line) => line[1] && line[1] !== '?' && line[1] !== ' ').length,
    untrackedCount: entries.filter((line) => line.startsWith('??')).length,
    entries,
  };
  return summary;
}

function parseAheadBehind(branchLine = '') {
  const ahead = Number(branchLine.match(/ahead (\d+)/)?.[1] || 0);
  const behind = Number(branchLine.match(/behind (\d+)/)?.[1] || 0);
  return { ahead, behind };
}

function detectHostingFromRemote(remoteUrl = '', config = {}) {
  const configured = String(config.gitGovernance?.hosting || 'both');
  if (configured !== 'both') return configured;
  const lower = String(remoteUrl || '').toLowerCase();
  if (lower.includes('gitlab')) return 'gitlab';
  if (lower.includes('github')) return 'github';
  return 'both';
}

function getDefaultBranch(config = {}, state = {}) {
  return String(config.gitGovernance?.defaultBranch || state.defaultBranch || 'main');
}

function getProtectedBranches(config = {}, state = {}) {
  const configured = Array.isArray(config.gitGovernance?.protectedBranches) ? config.gitGovernance.protectedBranches : [];
  const persisted = Array.isArray(state.protectedBranches) ? state.protectedBranches : [];
  return [...new Set([...configured, ...persisted, 'main', 'master'])];
}

function isProtectedBranch(branchName, config = {}, state = {}) {
  return getProtectedBranches(config, state).includes(String(branchName || ''));
}

function getUpdateStrategy(config = {}, state = {}) {
  const strategy = String(config.gitGovernance?.updateStrategy || state.preferredUpdateStrategy || 'repo-default');
  return strategy === 'repo-default' ? 'rebase' : strategy;
}

function getRequiredChecks(config = {}) {
  return Array.isArray(config.gitGovernance?.requiredChecks) ? config.gitGovernance.requiredChecks : ['lint', 'test', 'guard'];
}

function summarizeGitStatus(cwd, execSyncImpl, config = {}) {
  ensureGitRepository(execSyncImpl, cwd);
  const state = loadGitState(cwd, config);
  const branch = runGit(execSyncImpl, cwd, 'git rev-parse --abbrev-ref HEAD');
  const upstreamProbe = tryGit(execSyncImpl, cwd, 'git rev-parse --abbrev-ref --symbolic-full-name @{u}');
  const upstream = upstreamProbe.ok ? upstreamProbe.value : null;
  const remoteUrlProbe = tryGit(execSyncImpl, cwd, 'git remote get-url origin');
  const remoteUrl = remoteUrlProbe.ok ? remoteUrlProbe.value : null;
  const status = parsePorcelainStatus(runGit(execSyncImpl, cwd, 'git status --porcelain=v1 --branch'));
  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const divergence = tryGit(execSyncImpl, cwd, `git rev-list --left-right --count ${upstream}...HEAD`);
    if (divergence.ok) {
      const [behindCount, aheadCount] = divergence.value.split(/\s+/).map((value) => Number(value || 0));
      ahead = aheadCount || 0;
      behind = behindCount || 0;
    } else {
      ({ ahead, behind } = parseAheadBehind(status.branchLine));
    }
  } else {
    ({ ahead, behind } = parseAheadBehind(status.branchLine));
  }

  return {
    branch,
    upstream,
    defaultBranch: getDefaultBranch(config, state),
    remote: {
      name: remoteUrl ? 'origin' : null,
      url: remoteUrl,
      hosting: detectHostingFromRemote(remoteUrl, config),
    },
    dirty: status.dirty,
    stagedCount: status.stagedCount,
    unstagedCount: status.unstagedCount,
    untrackedCount: status.untrackedCount,
    stashCount: countStashEntries(execSyncImpl, cwd),
    ahead,
    behind,
    detached: branch === 'HEAD',
    protected: isProtectedBranch(branch, config, state),
  };
}

function ensureCleanWorkingTree(summary) {
  if (summary.dirty) {
    throw new Error('Working tree is dirty. Commit, stash, or clean changes before continuing.');
  }
}

function syncWithRemote(cwd, execSyncImpl, config = {}) {
  ensureGitRepository(execSyncImpl, cwd);
  runGit(execSyncImpl, cwd, 'git fetch origin');
  const state = loadGitState(cwd, config);
  const filePath = saveGitState(cwd, {
    ...state,
    defaultBranch: getDefaultBranch(config, state),
    preferredUpdateStrategy: getUpdateStrategy(config, state),
    protectedBranches: getProtectedBranches(config, state),
    lastFetchTime: new Date().toISOString(),
  }, config);
  return {
    summary: summarizeGitStatus(cwd, execSyncImpl, config),
    statePath: filePath,
  };
}

function branchExists(execSyncImpl, cwd, branchName) {
  const result = tryGit(execSyncImpl, cwd, `git show-ref --verify refs/heads/${branchName}`);
  return result.ok && Boolean(result.value);
}

function remoteBranchExists(execSyncImpl, cwd, branchName) {
  const result = tryGit(execSyncImpl, cwd, `git ls-remote --heads origin ${branchName}`);
  return result.ok && Boolean(result.value);
}

function createBranchFromContract({ cwd, execSyncImpl, config = {}, branchName, publish = false }) {
  ensureGitRepository(execSyncImpl, cwd);
  const summary = summarizeGitStatus(cwd, execSyncImpl, config);
  ensureCleanWorkingTree(summary);
  if (branchExists(execSyncImpl, cwd, branchName)) {
    throw new Error(`Branch already exists: ${branchName}`);
  }
  runGit(execSyncImpl, cwd, `git checkout -b ${branchName}`);
  let upstreamSet = false;
  if (publish) {
    runGit(execSyncImpl, cwd, `git push -u origin ${branchName}`);
    upstreamSet = true;
  } else if (remoteBranchExists(execSyncImpl, cwd, branchName)) {
    runGit(execSyncImpl, cwd, `git branch --set-upstream-to origin/${branchName} ${branchName}`);
    upstreamSet = true;
  }
  return {
    branchName,
    upstreamSet,
    publishSuggested: !upstreamSet,
  };
}

function buildConflictChecklist(baseRef) {
  return [
    `Resolve conflicts introduced while updating against ${baseRef}.`,
    'Inspect conflicted files with git status.',
    'Edit each conflict manually; do not auto-resolve blindly.',
    'Run tests and lint before continuing.',
    'Continue with git rebase --continue or abort with git rebase --abort.',
  ];
}

function updateCurrentBranch(cwd, execSyncImpl, config = {}) {
  ensureGitRepository(execSyncImpl, cwd);
  const state = loadGitState(cwd, config);
  const summary = summarizeGitStatus(cwd, execSyncImpl, config);
  ensureCleanWorkingTree(summary);
  if (summary.detached) {
    throw new Error('Detached HEAD cannot be updated safely. Checkout a branch first.');
  }
  if (isProtectedBranch(summary.branch, config, state)) {
    throw new Error(`Protected branch cannot be updated with grabby git:update: ${summary.branch}`);
  }
  const syncResult = syncWithRemote(cwd, execSyncImpl, config);
  const baseBranch = getDefaultBranch(config, state);
  const baseRef = `origin/${baseBranch}`;
  const strategy = getUpdateStrategy(config, state);
  try {
    if (strategy === 'merge') {
      runGit(execSyncImpl, cwd, `git merge --ff-only ${baseRef}`);
    } else {
      runGit(execSyncImpl, cwd, `git rebase ${baseRef}`);
    }
  } catch (error) {
    return {
      ok: false,
      strategy,
      baseRef,
      conflictChecklist: buildConflictChecklist(baseRef),
      error,
      summary: syncResult.summary,
    };
  }
  return {
    ok: true,
    strategy,
    baseRef,
    summary: summarizeGitStatus(cwd, execSyncImpl, config),
  };
}

function extractBranchId(branchName = '') {
  const match = String(branchName).match(/\/([A-Z][A-Z0-9-]+-\d+)-/i);
  return match ? match[1].toUpperCase() : null;
}

function detectHistoryRewriteRisk(summary) {
  return summary.behind > 0 && summary.ahead > 0;
}

function preflightGitState({ cwd, execSyncImpl, config = {}, contractId = null, expectedBranch = null, hasPlan = false, requiredChecksKnown = {}, policyTriggered = false, enforceBranchPolicyOnly = false }) {
  ensureGitRepository(execSyncImpl, cwd);
  const state = loadGitState(cwd, config);
  const summary = summarizeGitStatus(cwd, execSyncImpl, config);
  const errors = [];
  const warnings = [];
  const freshnessThreshold = Number(config.gitGovernance?.freshnessThresholdBehind ?? 0);
  const allowDirectDefaultBranchCommits = config.gitGovernance?.allowDirectDefaultBranchCommits === true;

  if (!enforceBranchPolicyOnly) {
    if (summary.detached) {
      errors.push('Detached HEAD is not allowed for governed work.');
    }
    if (summary.dirty) {
      errors.push('Working tree must be clean before preflight passes.');
    }
    if (expectedBranch && summary.branch !== expectedBranch) {
      errors.push(`Current branch does not match contract branch. Expected ${expectedBranch}, found ${summary.branch}.`);
    } else if (contractId && !summary.branch.includes(contractId)) {
      errors.push(`Current branch does not include contract ID ${contractId}.`);
    }
    if (summary.behind > freshnessThreshold) {
      errors.push(`Branch is behind ${summary.upstream || summary.defaultBranch} by ${summary.behind} commit(s); threshold is ${freshnessThreshold}.`);
    }
  }
  if (!allowDirectDefaultBranchCommits && (summary.branch === summary.defaultBranch || summary.protected)) {
    const host = summary.remote?.hosting;
    const provider = host === 'github' ? 'GitHub' : (host === 'gitlab' ? 'GitLab' : 'remote');
    errors.push(`Direct commits/check-ins to protected/default branch "${summary.branch}" are blocked by ${provider} policy. Create a feature branch or set gitGovernance.allowDirectDefaultBranchCommits=true.`);
  }
  if (!enforceBranchPolicyOnly && policyTriggered && !hasPlan) {
    errors.push('Contract plan is required before git preflight passes for governed changes.');
  }
  if (!enforceBranchPolicyOnly) {
    ['lint', 'test', 'build'].forEach((check) => {
      if (getRequiredChecks(config).includes(check) && !requiredChecksKnown[check]) {
        errors.push(`Required ${check} command is not known in repo scripts/config.`);
      }
    });
    if (summary.stashCount > 0) {
      warnings.push(`Stash entries present: ${summary.stashCount}. Verify they do not hide required work.`);
    }
    if (!summary.upstream) {
      warnings.push('No upstream branch configured. Divergence checks may be incomplete.');
    }
    if (detectHistoryRewriteRisk(summary)) {
      warnings.push('Local and upstream branches have diverged; update may require history rewrite or manual coordination.');
    }
    warnings.push('Remote review detection is unavailable without explicit hosting integration; if an MR/PR is already open, coordinate before rebasing.');
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary,
    state,
  };
}

function renderStatusSummary(summary) {
  return [
    `Branch: ${summary.branch}`,
    `Upstream: ${summary.upstream || 'none'}`,
    `Default branch: ${summary.defaultBranch}`,
    `Dirty: ${summary.dirty ? 'yes' : 'no'}`,
    `Staged: ${summary.stagedCount}`,
    `Unstaged: ${summary.unstagedCount}`,
    `Untracked: ${summary.untrackedCount}`,
    `Stashes: ${summary.stashCount}`,
    `Ahead/Behind: +${summary.ahead} / -${summary.behind}`,
    `Remote: ${summary.remote.url || 'origin unavailable'}`,
  ].join('\n');
}

module.exports = {
  getGitStatePath,
  loadGitState,
  saveGitState,
  summarizeGitStatus,
  syncWithRemote,
  createBranchFromContract,
  updateCurrentBranch,
  preflightGitState,
  renderStatusSummary,
  getDefaultBranch,
  getProtectedBranches,
  getUpdateStrategy,
  getRequiredChecks,
  isProtectedBranch,
  extractBranchId,
  detectHistoryRewriteRisk,
};
