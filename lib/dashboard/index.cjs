'use strict';

const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const cors = require('cors');
const helmet = require('helmet');

const { loadConfig } = require('../config.cjs');
const { createRateLimiter } = require('../middleware/rate-limiter.cjs');
const { getProjectMetadata } = require('../project-metadata.cjs');

const DEFAULT_PORT = 3847;
const HOST = '127.0.0.1';

function getConfiguredDashboardPort(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const configuredPort = config?.dashboard?.port;

  if (Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535) {
    return configuredPort;
  }

  return DEFAULT_PORT;
}

function resolveDashboardPort(options = {}) {
  const { cwd = process.cwd(), port } = options;

  if (Number.isInteger(port) && port >= 0 && port <= 65535) {
    return port;
  }

  return getConfiguredDashboardPort(cwd);
}

function createDashboardServer(options = {}) {
  const {
    port,
    cwd = process.cwd(),
    autoOpen = true,
    logger = console,
  } = options;

  const resolvedPort = resolveDashboardPort({ cwd, port });
  const metadata = getProjectMetadata(cwd);
  const publicDir = path.join(__dirname, 'public');
  const app = express();
  const browserRateLimiter = createRateLimiter({
    version: metadata.version,
    rateLimit: 600,
  });

  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'unpkg.com'],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  app.use(cors({
    origin: metadata.defaults.api.corsOrigins,
    credentials: true,
  }));

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createRateLimiter({
    version: metadata.version,
    rateLimit: 180,
  }));

  const routes = require('./routes.cjs');
  app.use('/api', routes.createRouter({ cwd, logger }));

  app.use(browserRateLimiter);
  app.use(express.static(publicDir, { index: false }));

  // Explicit 404 handler for unmatched API routes (must come before SPA catch-all)
  app.use('/api/{*path}', (req, res) => {
    res.status(404).json({ ok: false, error: 'Route not found' });
  });

  // SPA catch-all: serve index.html for all non-API routes (Express 5 syntax)
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  let server = null;

  function start() {
    return new Promise((resolve, reject) => {
      server = app.listen(resolvedPort, HOST, () => {
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : resolvedPort;
        const url = `http://${HOST}:${actualPort}`;

        logger.log(`Grabby UI running at ${url}`);
        if (autoOpen) {
          openBrowser(url);
        }

        resolve({
          url,
          port: actualPort,
          host: HOST,
          server,
        });
      });

      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.log(`Port ${resolvedPort} is in use. Try: grabby ui --port ${resolvedPort + 1}`);
        }
        reject(error);
      });
    });
  }

  function stop() {
    return new Promise((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }

      const activeServer = server;
      server = null;
      activeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        logger.log('Grabby UI stopped.');
        resolve();
      });
    });
  }

  return { app, start, stop };
}

function openBrowser(url) {
  const platform = process.platform;
  let command = `xdg-open "${url}"`;

  if (platform === 'win32') {
    command = `cmd.exe /c start "" "${url}"`;
  } else if (platform === 'darwin') {
    command = `open "${url}"`;
  }

  exec(command, { windowsHide: true }, () => {});
}

function runDashboard(options = {}) {
  const dashboard = createDashboardServer(options);

  async function shutdown(exitCode) {
    try {
      await dashboard.stop();
    } finally {
      process.exit(exitCode);
    }
  }

  process.once('SIGINT', () => {
    shutdown(0);
  });
  process.once('SIGTERM', () => {
    shutdown(0);
  });

  return dashboard.start().then((result) => ({
    ...result,
    stop: () => dashboard.stop(),
  }));
}

module.exports = {
  createDashboardServer,
  runDashboard,
  resolveDashboardPort,
  DEFAULT_PORT,
  HOST,
};
