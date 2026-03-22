/**
 * Rules repository sync and management routes
 * @module api-routes/rules
 */

const express = require('express');
const { param, validationResult } = require('express-validator');
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../middleware/error-handler.cjs');
const { parseDuration } = require('../rules-sync.cjs');

// Safe path segment pattern - alphanumeric, hyphens, underscores only
const SAFE_PATH_SEGMENT = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function getLockRulesetRef(ruleset) {
  if (!ruleset || typeof ruleset !== 'object') return '';

  const category = String(ruleset.category || '').trim();
  const name = String(ruleset.name || '').trim();

  if (category.includes('/')) {
    return category;
  }

  if (category && name) {
    return `${category}/${name}`;
  }

  return category;
}

function loadRulesConfig(cwd) {
  const config = require('../config.cjs');
  return config.loadConfig(cwd) || config.defaultConfig();
}

function getRulesSyncMaxAgeMs(appConfig) {
  try {
    return parseDuration(appConfig.rulesets?.sync?.interval || '24h');
  } catch (_) {
    return 24 * 60 * 60 * 1000;
  }
}

function getManifestPath(cwd, appConfig, fs, path) {
  const cacheDir = appConfig.rulesets?.cacheDir || '.grabby/rulesets/cache';
  const candidates = [
    path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml'),
    path.join(cwd, '.grabby', 'rulesets', 'central-repo', 'manifest.yaml'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function readRulesetContent(cwd, appConfig, category, name, fs, path) {
  const cacheDir = appConfig.rulesets?.cacheDir || '.grabby/rulesets/cache';
  const candidates = [
    path.join(cwd, cacheDir, 'central-repo', category, `${name}.md`),
    path.join(cwd, cacheDir, 'central-repo', 'rulesets', category, `${name}.yaml`),
    path.join(cwd, cacheDir, category, `${name}.md`),
    path.join(cwd, '.grabby', 'rulesets', 'cache', category, `${name}.md`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }

  return null;
}

function buildActiveLockEntries(manifest, manifestPath, activeRulesets, syncLock, manifestParser, fs, path) {
  const fetchedAt = new Date().toISOString();
  const allRulesets = manifestParser.getAllRulesets(manifest || {});
  const repoDir = path.dirname(manifestPath);

  return (activeRulesets || [])
    .map((rulesetPath) => {
      const ruleset = allRulesets.find((entry) => entry.ref === rulesetPath);
      if (!ruleset) {
        return null;
      }

      const [category, name] = rulesetPath.split('/');
      const candidates = [
        path.join(repoDir, category, `${name}.md`),
        path.join(repoDir, 'rulesets', category, `${name}.yaml`),
        path.join(repoDir, 'rulesets', category, `${name}.yml`)
      ];

      let content = '';
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          content = fs.readFileSync(candidate, 'utf8');
          break;
        }
      }

      if (!content) {
        content = JSON.stringify(ruleset);
      }

      return {
        category: rulesetPath,
        name,
        version: ruleset.version,
        hash: `sha256:${syncLock.hashContent(content)}`,
        fetchedAt
      };
    })
    .filter(Boolean);
}

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
  const fs = require('fs');
  const path = require('path');

  // GET /v1/rules - List active rulesets
  router.get('/', async (req, res, next) => {
    try {
      const appConfig = loadRulesConfig(context.cwd);
      const activeRulesets = appConfig.rulesets?.active || [];
      const lock = syncLock.readLock(appConfig.rulesets?.lockPath, context.cwd);
      const manifestPath = getManifestPath(context.cwd, appConfig, fs, path);
      const manifest = fs.existsSync(manifestPath) ? manifestParser.parseManifestFile(manifestPath) : null;

      if (!manifest) {
        return res.json({
          status: 'success',
          data: {
            rulesets: [],
            total: 0,
            lastSync: lock?.lastSync || null,
            manifestVersion: null
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: context.version,
            requestId: req.requestId
          }
        });
      }

      const manifestRulesets = manifestParser.getAllRulesets(manifest);
      const rulesets = activeRulesets.map((rulesetPath) => {
        const [category, name] = rulesetPath.split('/');
        const rulesetInfo =
          manifestRulesets.find((ruleset) => ruleset.ref === rulesetPath) ||
          manifestParser.findRuleset(manifest, category, name);
        const lockEntry = lock?.active?.find((entry) => getLockRulesetRef(entry) === rulesetPath);
        const responseRuleset = rulesetInfo ? { ...rulesetInfo } : {};

        return {
          ...responseRuleset,
          path: rulesetPath,
          category,
          name,
          version: lockEntry?.version || rulesetInfo?.version || null
        };
      });

      res.json({
        status: 'success',
        data: {
          rulesets,
          total: rulesets.length,
          lastSync: lock?.lastSync || null,
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
      const appConfig = loadRulesConfig(context.cwd);

      if (!appConfig.rulesets?.source?.repo) {
        throw new ValidationError('Rulesets source repository not configured');
      }

      const result = await rulesSync.syncWithCentral({
        source: appConfig.rulesets.source,
        cacheDir: appConfig.rulesets.cacheDir || '.grabby/rulesets/cache',
        timeout: 60000
      }, context.cwd);

      const lockPath = appConfig.rulesets?.lockPath || '.grabby/rulesets/sync.lock.yaml';
      let lock = syncLock.readLock(lockPath, context.cwd);

      if (!lock) {
        lock = syncLock.initLock(appConfig.rulesets.source.repo, appConfig.rulesets.source.branch || 'main', lockPath, context.cwd);
      }

      lock.lastSync = new Date().toISOString();
      lock.source = result.source;
      lock.active = buildActiveLockEntries(
        result.manifest,
        result.manifestPath,
        appConfig.rulesets?.active || [],
        syncLock,
        manifestParser,
        fs,
        path
      );

      syncLock.writeLock(lock, lockPath, context.cwd);

      res.json({
        status: 'success',
        data: {
          synced: true,
          timestamp: new Date().toISOString(),
          version: result.source?.version || null,
          commit: result.source?.commit || null,
          rulesets: manifestParser.getAllRulesets(result.manifest || {})
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: context.version,
          requestId: req.requestId
        }
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return next(error);
      }
      next(new ServiceUnavailableError('rules-sync', error.message));
    }
  });

  // GET /v1/rules/status - Check sync status & drift
  router.get('/status', async (req, res, next) => {
    try {
      const appConfig = loadRulesConfig(context.cwd);
      const lock = syncLock.readLock(appConfig.rulesets?.lockPath, context.cwd);

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

      const manifestPath = getManifestPath(context.cwd, appConfig, fs, path);
      const manifest = fs.existsSync(manifestPath) ? manifestParser.parseManifestFile(manifestPath) : null;
      const isStale = syncLock.isLockStale(lock, getRulesSyncMaxAgeMs(appConfig));
      const drift = manifest ? rulesSync.detectDrift(lock, manifest) : { detected: false };

      res.json({
        status: 'success',
        data: {
          lastSync: lock.lastSync,
          isStale,
          hasDrift: drift.detected,
          source: lock.source || appConfig.rulesets?.source || null,
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
        const appConfig = loadRulesConfig(context.cwd);
        const activeRulesets = appConfig.rulesets?.active || [];

        if (!activeRulesets.includes(rulesetPath)) {
          throw new NotFoundError('Ruleset', rulesetPath);
        }

        const manifestPath = getManifestPath(context.cwd, appConfig, fs, path);
        if (!fs.existsSync(manifestPath)) {
          throw new NotFoundError('Ruleset manifest', 'manifest.yaml');
        }

        const manifest = manifestParser.parseManifestFile(manifestPath);
        const ruleset = manifestParser.findRuleset(manifest, category, name);

        if (!ruleset) {
          throw new NotFoundError('Ruleset', rulesetPath);
        }

        res.json({
          status: 'success',
          data: {
            ruleset: {
              ...ruleset,
              category,
              name,
              path: rulesetPath,
              content: readRulesetContent(context.cwd, appConfig, category, name, fs, path)
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
