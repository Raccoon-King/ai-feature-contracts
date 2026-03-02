#!/usr/bin/env node

const path = require('path');
const { createAPIServer } = require('../lib/api-server.cjs');

const cwd = process.cwd();
const context = {
  contractsDir: path.join(cwd, 'contracts'),
  grabbyDir: path.join(cwd, '.grabby'),
};

const portArg = process.argv.find(a => a.startsWith('--port='));
const port = portArg ? Number(portArg.split('=')[1]) : 3456;

const server = createAPIServer(context);
server.start(Number.isFinite(port) ? port : 3456);

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
