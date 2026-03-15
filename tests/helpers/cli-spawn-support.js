'use strict';

const { spawnSync } = require('child_process');

function getCliSpawnSupport({ cwd, env = {}, timeout = 5000 } = {}) {
  const probe = spawnSync(process.execPath, ['-e', 'process.stdout.write("ok")'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout,
  });

  if (probe.error) {
    return {
      available: false,
      reason: probe.error.message,
    };
  }

  if (probe.status !== 0) {
    return {
      available: false,
      reason: `probe exited with status ${probe.status}`,
    };
  }

  if ((probe.stdout || '') !== 'ok') {
    return {
      available: false,
      reason: 'probe did not produce expected stdout',
    };
  }

  return {
    available: true,
    reason: null,
  };
}

module.exports = {
  getCliSpawnSupport,
};
