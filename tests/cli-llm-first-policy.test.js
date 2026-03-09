const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PKG_ROOT = path.join(__dirname, '..');
const CLI_PATH = path.join(PKG_ROOT, 'bin', 'index.cjs');

function canSpawnNodeCli() {
  const probe = spawnSync(process.execPath, ['-e', 'process.stdout.write("ok")'], {
    cwd: PKG_ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 5000,
  });

  return !probe.error && probe.status === 0 && (probe.stdout || '') === 'ok';
}

const describeCli = canSpawnNodeCli() ? describe : describe.skip;

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-9;]*m/g, '');
}

function runCli(args, cwd) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 30000,
  });

  return {
    status: result.status || 0,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.stderr),
  };
}

function writeLlmFirstConfig(cwd) {
  const config = {
    workflow: {
      externalLlmOnly: true,
    },
  };
  fs.writeFileSync(path.join(cwd, 'grabby.config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

describeCli('CLI LLM-first policy', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-llm-first-'));
    writeLlmFirstConfig(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('shows LLM-first help and hides blocked command families', () => {
    const result = runCli(['help'], tempDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Grabby - CLI (LLM-First Mode)');
    expect(result.stdout).toContain('grabby task <request>');
    expect(result.stdout).not.toContain('grabby jira');
    expect(result.stdout).not.toContain('grabby plugin');
    expect(result.stdout).not.toContain('grabby workspace');
    expect(result.stdout).not.toContain('grabby tui');
  });

  it('blocks a non-LLM-first command with policy guidance', () => {
    const result = runCli(['jira', 'status'], tempDir);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Command disabled by repo policy (LLM-first mode).');
    expect(result.stdout).toContain('external-LLM + core Grabby workflow only');
  });

  it('does not block an allowed workflow command', () => {
    const result = runCli(['validate', 'missing.fc.md'], tempDir);

    expect(result.stdout).not.toContain('Command disabled by repo policy (LLM-first mode).');
  });
});

