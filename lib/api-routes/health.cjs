/**
 * Health check and configuration routes
 * @module api-routes/health
 */

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { ValidationError } = require('../middleware/error-handler.cjs');

/**
 * Create health router
 * @param {Object} context - Application context
 * @returns {express.Router} Express router
 */
function createHealthRouter(context) {
  const router = express.Router();

  // GET /v1/health - Health check
  router.get('/health', async (req, res) => {
    const startTime = Date.now();

    const health = {
      status: 'healthy',
      services: {
        filesystem: checkFilesystem(context.cwd),
        git: await checkGit(),
        rulesets: checkRulesets(context.cwd)
      },
      system: {
        uptime: process.uptime(),
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external
        },
        platform: os.platform(),
        nodeVersion: process.version
      },
      version: context.version || '3.7.0',
      responseTime: Date.now() - startTime
    };

    const isHealthy = Object.values(health.services).every(s => s.status === 'ok');
    const statusCode = isHealthy ? 200 : 503;

    if (!isHealthy) {
      health.status = 'degraded';
    }

    res.status(statusCode).json({
      status: isHealthy ? 'success' : 'error',
      data: health,
      metadata: {
        timestamp: new Date().toISOString(),
        version: context.version,
        requestId: req.requestId
      }
    });
  });

  // GET /v1/config - Get runtime configuration
  router.get('/config', (req, res) => {
    const config = require('../config.cjs');
    const appConfig = config.loadConfig(context.cwd);

    // Redact sensitive fields
    const safeConfig = JSON.parse(JSON.stringify(appConfig));
    if (safeConfig.ai?.apiKey) safeConfig.ai.apiKey = '***REDACTED***';
    if (safeConfig.jira?.apiToken) safeConfig.jira.apiToken = '***REDACTED***';

    res.json({
      status: 'success',
      data: { config: safeConfig },
      metadata: {
        timestamp: new Date().toISOString(),
        version: context.version,
        requestId: req.requestId
      }
    });
  });

  // PUT /v1/config - Update configuration
  router.put('/config', (req, res, next) => {
    try {
      const { updates } = req.body;

      if (!updates || typeof updates !== 'object') {
        throw new ValidationError('Request body must contain "updates" object');
      }

      const config = require('../config.cjs');
      const currentConfig = config.loadConfig(context.cwd);

      // Merge updates (shallow merge for safety)
      const newConfig = { ...currentConfig, ...updates };

      // Save config
      const configPath = path.join(context.cwd, 'grabby.config.json');
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));

      res.json({
        status: 'success',
        data: {
          message: 'Configuration updated',
          updated: Object.keys(updates)
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: context.version,
          requestId: req.requestId
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/**
 * Check filesystem health
 * @param {string} cwd - Current working directory
 * @returns {Object} Service status
 */
function checkFilesystem(cwd) {
  try {
    const contractsDir = path.join(cwd, 'contracts');
    const grabbyDir = path.join(cwd, '.grabby');

    const contractsExists = fs.existsSync(contractsDir);
    const grabbyExists = fs.existsSync(grabbyDir);

    if (!contractsExists || !grabbyExists) {
      return {
        status: 'degraded',
        message: 'Missing required directories'
      };
    }

    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Check git availability
 * @returns {Promise<Object>} Service status
 */
async function checkGit() {
  try {
    const { execSync } = require('child_process');
    execSync('git --version', { stdio: 'ignore', timeout: 5000 });
    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'unavailable',
      message: 'Git not installed or not accessible'
    };
  }
}

/**
 * Check rulesets health
 * @param {string} cwd - Current working directory
 * @returns {Object} Service status
 */
function checkRulesets(cwd) {
  try {
    const syncLock = require('../sync-lock.cjs');
    const lock = syncLock.readLock(cwd);

    if (!lock) {
      return {
        status: 'degraded',
        message: 'Rulesets not synced'
      };
    }

    const config = require('../config.cjs');
    const appConfig = config.loadConfig(cwd);
    const isStale = syncLock.isLockStale(lock, appConfig);

    if (isStale) {
      return {
        status: 'degraded',
        message: 'Rulesets sync is stale'
      };
    }

    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

module.exports = { createHealthRouter };
