/**
 * Rules repository sync and management routes
 * @module api-routes/rules
 */

const express = require('express');
const { param, validationResult } = require('express-validator');
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../middleware/error-handler.cjs');

// Safe path segment pattern - alphanumeric, hyphens, underscores only
const SAFE_PATH_SEGMENT = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Create rules router
 * @param {Object} context - Application context
 * @returns {express.Router} Express router
 */
function createRulesRouter(context) {
  const router = express.Router();
  const rulesSync = require('../rules-sync.cjs');
  const syncLock = require('../sync-lock.cjs');
  const manifestParser = require('../manifest-parser.cjs');
  const config = require('../config.cjs');
  const fs = require('fs');
  const path = require('path');

  // GET /v1/rules - List active rulesets
  router.get('/', async (req, res, next) => {
    try {
      const appConfig = config.loadConfig(context.cwd);
      const activeRulesets = appConfig.rulesets?.active || [];

      const lock = syncLock.readLock(undefined, context.cwd);

      // Load manifest from rulesets cache
      const manifestPath = path.join(context.cwd, '.grabby', 'rulesets', 'central-repo', 'manifest.yaml');
      const manifest = fs.existsSync(manifestPath) ? manifestParser.parseManifestFile(manifestPath) : null;

      if (!manifest) {
        return res.json({
          status: 'success',
          data: {
            rulesets: [],
            total: 0,
            lastSync: null,
            manifestVersion: null
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: context.version,
            requestId: req.requestId
          }
        });
      }

      const rulesets = activeRulesets.map(rulesetPath => {
        const [category, name] = rulesetPath.split('/');
        const rulesetInfo = manifest.rulesets.find(r =>
          r.category === category && r.name === name
        );

        const lockEntry = lock?.active?.find(a => a.path === rulesetPath);

        return {
          path: rulesetPath,
          category,
          name,
          version: lockEntry?.version || rulesetInfo?.version,
          description: rulesetInfo?.description,
          ...rulesetInfo
        };
      });

      res.json({
        status: 'success',
        data: {
          rulesets,
          total: rulesets.length,
          lastSync: lock?.lastSync,
          manifestVersion: manifest.version
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

  // POST /v1/rules/sync - Sync with central repo
  router.post('/sync', async (req, res, next) => {
    try {
      const appConfig = config.loadConfig(context.cwd);

      if (!appConfig.rulesets?.source?.repo) {
        throw new ValidationError('Rulesets source repository not configured');
      }

      const result = await rulesSync.syncWithCentral({
        source: appConfig.rulesets.source,
        cacheDir: appConfig.rulesets.cacheDir || '.grabby/rulesets',
        timeout: 60000
      }, context.cwd);

      res.json({
        status: 'success',
        data: {
          synced: true,
          timestamp: new Date().toISOString(),
          version: result.source?.version || null,
          commit: result.source?.commit || null,
          rulesets: result.manifest?.rulesets || []
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: context.version,
          requestId: req.requestId
        }
      });
    } catch (error) {
      if (error.message && error.message.includes('git')) {
        next(new ServiceUnavailableError('git', error.message));
      } else {
        next(error);
      }
    }
  });

  // GET /v1/rules/status - Check sync status & drift
  router.get('/status', async (req, res, next) => {
    try {
      const appConfig = config.loadConfig(context.cwd);
      const lock = syncLock.readLock(undefined, context.cwd);

      if (!lock) {
        return res.json({
          status: 'success',
          data: {
            lastSync: null,
            isStale: true,
            hasDrift: false,
            source: appConfig.rulesets?.source || null,
            activeRulesets: 0
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: context.version,
            requestId: req.requestId
          }
        });
      }

      // Load manifest for drift detection
      const manifestPath = path.join(context.cwd, '.grabby', 'rulesets', 'central-repo', 'manifest.yaml');
      const manifest = fs.existsSync(manifestPath) ? manifestParser.parseManifestFile(manifestPath) : null;

      const isStale = syncLock.isLockStale(lock, appConfig);
      const drift = rulesSync.detectDrift(lock, manifest);
      const hasDrift = drift.detected;

      res.json({
        status: 'success',
        data: {
          lastSync: lock.lastSync,
          isStale,
          hasDrift,
          source: lock.source,
          activeRulesets: lock.active?.length || 0
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

  // GET /v1/rules/:category/:name - Get specific ruleset
  router.get('/:category/:name',
    param('category').matches(SAFE_PATH_SEGMENT).withMessage('Invalid category format'),
    param('name').matches(SAFE_PATH_SEGMENT).withMessage('Invalid name format'),
    async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid path parameters', { errors: errors.array() });
      }

      const { category, name } = req.params;
      const rulesetPath = `${category}/${name}`;

      const appConfig = config.loadConfig(context.cwd);
      const activeRulesets = appConfig.rulesets?.active || [];

      if (!activeRulesets.includes(rulesetPath)) {
        throw new NotFoundError('Ruleset', rulesetPath);
      }

      // Load manifest
      const manifestPath = path.join(context.cwd, '.grabby', 'rulesets', 'central-repo', 'manifest.yaml');
      if (!fs.existsSync(manifestPath)) {
        throw new NotFoundError('Ruleset manifest', 'manifest.yaml');
      }
      const manifest = manifestParser.parseManifestFile(manifestPath);

      const ruleset = manifest.rulesets.find(r =>
        r.category === category && r.name === name
      );

      if (!ruleset) {
        throw new NotFoundError('Ruleset', rulesetPath);
      }

      // Read ruleset content
      const rulesetFilePath = path.join(
        context.cwd,
        '.grabby/rulesets/cache',
        category,
        `${name}.md`
      );

      let content = null;
      if (fs.existsSync(rulesetFilePath)) {
        content = fs.readFileSync(rulesetFilePath, 'utf8');
      }

      res.json({
        status: 'success',
        data: {
          ruleset: {
            ...ruleset,
            path: rulesetPath,
            content
          }
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

module.exports = { createRulesRouter };
