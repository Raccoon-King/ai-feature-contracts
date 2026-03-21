# FC-003: REST API Phase 1 - Detailed Implementation Plan

**Contract**: FC-003.fc.md
**Generated**: 2026-03-21
**Status**: Ready for Implementation

## Executive Summary

This plan details the implementation of a local-first REST API server for Grabby. The API serves as a control plane for contract management and rules repository integration, enabling editor integrations, automation, and programmatic access.

**Estimated Effort**: 2 weeks (80 hours)
**Risk Level**: Medium
**Dependencies**: express, winston, helmet, cors

---

## Phase 1A: Core Infrastructure (Week 1, Days 1-2)

### 1. HTTP Server Foundation (`lib/api-server-v2.cjs`)

**Purpose**: Express-based HTTP server with graceful lifecycle management

**Implementation Steps**:

1. **Server Initialization**
   ```javascript
   const express = require('express');
   const helmet = require('helmet');
   const cors = require('cors');
   const compression = require('compression');

   function createServer(config) {
     const app = express();

     // Security middleware
     app.use(helmet());
     app.use(cors({ origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }));
     app.use(compression());

     // Body parsing
     app.use(express.json({ limit: '10mb' }));
     app.use(express.urlencoded({ extended: true, limit: '10mb' }));

     return app;
   }
   ```

2. **Port Auto-Increment Logic**
   ```javascript
   async function findAvailablePort(startPort, maxAttempts = 10) {
     const net = require('net');

     for (let i = 0; i < maxAttempts; i++) {
       const port = startPort + i;
       const isAvailable = await checkPort(port);
       if (isAvailable) return port;
     }
     throw new Error(`No available port in range ${startPort}-${startPort + maxAttempts}`);
   }

   function checkPort(port) {
     return new Promise((resolve) => {
       const server = net.createServer();
       server.once('error', () => resolve(false));
       server.once('listening', () => {
         server.close();
         resolve(true);
       });
       server.listen(port, '127.0.0.1');
     });
   }
   ```

3. **Graceful Shutdown**
   ```javascript
   function setupGracefulShutdown(server, logger) {
     const shutdown = async (signal) => {
       logger.info(`Received ${signal}, starting graceful shutdown...`);

       // Stop accepting new connections
       server.close(async () => {
         logger.info('HTTP server closed');

         // Flush caches
         await flushCachesToDisk();

         // Clean up resources
         await cleanupResources();

         process.exit(0);
       });

       // Force shutdown after 30s
       setTimeout(() => {
         logger.error('Forced shutdown after timeout');
         process.exit(1);
       }, 30000);
     };

     process.on('SIGTERM', () => shutdown('SIGTERM'));
     process.on('SIGINT', () => shutdown('SIGINT'));
   }
   ```

4. **Startup Sequence**
   ```javascript
   async function startServer(config) {
     const logger = createLogger(config);

     // 1. Load configuration
     const appConfig = await loadConfiguration();

     // 2. Initialize services
     await initializeServices(appConfig);

     // 3. Pre-load data
     await preloadData();

     // 4. Create Express app
     const app = createServer(appConfig);

     // 5. Register routes
     registerRoutes(app);

     // 6. Start HTTP server
     const port = await findAvailablePort(3456);
     const server = app.listen(port, '127.0.0.1', () => {
       logger.info(`Grabby API server listening on http://127.0.0.1:${port}`);
     });

     // 7. Setup graceful shutdown
     setupGracefulShutdown(server, logger);

     // 8. Run health checks
     await runHealthChecks();

     return { server, port };
   }
   ```

**Testing Requirements**:
- Server starts on port 3456
- Auto-increments to 3457 if 3456 is occupied
- Graceful shutdown completes within 30s
- SIGTERM/SIGINT handled correctly

---

### 2. Request Logger Middleware (`lib/middleware/request-logger.cjs`)

**Purpose**: Structured logging for all HTTP requests/responses

**Implementation**:

```javascript
const winston = require('winston');

function createRequestLogger(config) {
  const logger = winston.createLogger({
    level: config.logLevel || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: '.grabby/logs/api-error.log',
        level: 'error'
      }),
      new winston.transports.File({
        filename: '.grabby/logs/api-combined.log'
      })
    ]
  });

  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.simple()
    }));
  }

  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    req.requestId = requestId;
    req.logger = logger;

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info({
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('user-agent'),
        ip: req.ip
      });
    });

    next();
  };
}

module.exports = { createRequestLogger };
```

**Testing Requirements**:
- Logs written to `.grabby/logs/api-combined.log`
- Each request has unique requestId
- Duration calculated correctly
- Error requests logged separately

---

### 3. Error Handler Middleware (`lib/middleware/error-handler.cjs`)

**Purpose**: Centralized error handling with consistent response format

**Implementation**:

```javascript
class ApiError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends ApiError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends ApiError {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`, 404, 'NOT_FOUND', { resource, id });
  }
}

class ConflictError extends ApiError {
  constructor(message, details = {}) {
    super(message, 409, 'CONFLICT', details);
  }
}

function errorHandler(config) {
  return (err, req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // Log error
    req.logger.error({
      requestId: req.requestId,
      error: {
        message: err.message,
        code: err.code || 'UNKNOWN_ERROR',
        stack: isProduction ? undefined : err.stack
      }
    });

    // Determine status code
    const statusCode = err.statusCode || 500;

    // Build response
    const response = {
      status: 'error',
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
        details: err.details || {}
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: config.version || '3.7.0',
        requestId: req.requestId
      }
    };

    // Include stack trace in development
    if (!isProduction && err.stack) {
      response.error.stack = err.stack;
    }

    res.status(statusCode).json(response);
  };
}

module.exports = {
  errorHandler,
  ApiError,
  ValidationError,
  NotFoundError,
  ConflictError
};
```

**Testing Requirements**:
- 400 errors return ValidationError format
- 404 errors return NotFoundError format
- Stack traces only in development
- All errors have requestId

---

### 4. Rate Limiter Middleware (`lib/middleware/rate-limiter.cjs`)

**Purpose**: Prevent API abuse with rate limiting

**Implementation**:

```javascript
const rateLimit = require('express-rate-limit');

function createRateLimiter(config) {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: config.rateLimit || 100, // 100 requests per minute
    message: {
      status: 'error',
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        details: {
          limit: config.rateLimit || 100,
          window: '1 minute'
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: config.version || '3.7.0'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/v1/health';
    }
  });
}

module.exports = { createRateLimiter };
```

**Testing Requirements**:
- 100 requests per minute enforced
- 101st request returns 429
- Rate limit headers included
- Health endpoint excluded from rate limiting

---

## Phase 1B: Contract Endpoints (Week 1, Days 3-4)

### 5. Contract Routes (`lib/api-routes/contracts.cjs`)

**Purpose**: CRUD operations for contract management

**Implementation**:

```javascript
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/error-handler.cjs');
const featuresLib = require('../features.cjs');
const core = require('../core.cjs');
const commands = require('../commands.cjs');

function createContractsRouter(context) {
  const router = express.Router();

  // GET /v1/contracts - List all contracts
  router.get('/', async (req, res, next) => {
    try {
      const contracts = featuresLib.listContractFeatures(context.cwd);

      res.json({
        status: 'success',
        data: {
          contracts: contracts.map(c => ({
            id: c.id,
            title: c.title,
            status: c.status,
            type: c.type,
            lastModified: c.lastModifiedAt,
            path: c.contractPath
          })),
          total: contracts.length
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

  // POST /v1/contracts - Create new contract
  router.post('/',
    body('title').notEmpty().trim(),
    body('objective').notEmpty().trim(),
    body('type').optional().isIn(['feat', 'fix', 'refactor']),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid request body', { errors: errors.array() });
        }

        const { title, objective, type = 'feat' } = req.body;

        // Check for duplicate titles
        const existing = featuresLib.listContractFeatures(context.cwd);
        if (existing.some(c => c.title.toLowerCase() === title.toLowerCase())) {
          throw new ConflictError('Contract with this title already exists');
        }

        // Create contract
        const contract = await commands.createContract({
          title,
          objective,
          type,
          baseDir: context.cwd
        });

        res.status(201).json({
          status: 'success',
          data: { contract },
          metadata: {
            timestamp: new Date().toISOString(),
            version: context.version,
            requestId: req.requestId
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /v1/contracts/:id - Get contract details + validation
  router.get('/:id',
    param('id').matches(/^[A-Z]+-\d+$/),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid contract ID format');
        }

        const { id } = req.params;
        const contract = featuresLib.getContractFeatureStatus(id, context.cwd);

        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        // Read contract content
        const fs = require('fs');
        const path = require('path');
        const contractPath = path.join(context.cwd, contract.contractPath);
        const content = fs.readFileSync(contractPath, 'utf8');

        // Run validation
        const validation = await commands.validateContract(contractPath, context);

        res.json({
          status: 'success',
          data: {
            contract: {
              ...contract,
              content,
              validation: {
                valid: validation.errors.length === 0,
                errors: validation.errors,
                warnings: validation.warnings
              }
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
    }
  );

  // PUT /v1/contracts/:id - Update contract content/status
  router.put('/:id',
    param('id').matches(/^[A-Z]+-\d+$/),
    body('content').optional().isString(),
    body('status').optional().isIn(['draft', 'approved', 'executing', 'completed']),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid request', { errors: errors.array() });
        }

        const { id } = req.params;
        const { content, status } = req.body;

        const contract = featuresLib.getContractFeatureStatus(id, context.cwd);
        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        const fs = require('fs');
        const path = require('path');
        const contractPath = path.join(context.cwd, contract.contractPath);

        // Update content if provided
        if (content) {
          fs.writeFileSync(contractPath, content, 'utf8');
        }

        // Update status if provided
        if (status) {
          const updatedContent = fs.readFileSync(contractPath, 'utf8');
          const newContent = updatedContent.replace(
            /\*\*Status:\*\*\s+\w+/,
            `**Status:** ${status}`
          );
          fs.writeFileSync(contractPath, newContent, 'utf8');
        }

        res.json({
          status: 'success',
          data: {
            message: 'Contract updated',
            contract: { id, status }
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
    }
  );

  // DELETE /v1/contracts/:id - Delete contract
  router.delete('/:id',
    param('id').matches(/^[A-Z]+-\d+$/),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid contract ID format');
        }

        const { id } = req.params;
        const contract = featuresLib.getContractFeatureStatus(id, context.cwd);

        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        const fs = require('fs');
        const path = require('path');
        const contractPath = path.join(context.cwd, contract.contractPath);

        // Delete contract file
        fs.unlinkSync(contractPath);

        // Delete associated artifacts
        const planPath = contractPath.replace('.fc.md', '.plan.yaml');
        const auditPath = contractPath.replace('.fc.md', '.audit.md');

        if (fs.existsSync(planPath)) fs.unlinkSync(planPath);
        if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath);

        res.json({
          status: 'success',
          data: {
            message: 'Contract deleted',
            id
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
    }
  );

  // POST /v1/contracts/:id/validate - Run validation
  router.post('/:id/validate',
    param('id').matches(/^[A-Z]+-\d+$/),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid contract ID format');
        }

        const { id } = req.params;
        const contract = featuresLib.getContractFeatureStatus(id, context.cwd);

        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        const path = require('path');
        const contractPath = path.join(context.cwd, contract.contractPath);

        const validation = await commands.validateContract(contractPath, context);

        res.json({
          status: 'success',
          data: {
            valid: validation.errors.length === 0,
            errors: validation.errors,
            warnings: validation.warnings,
            suggestions: validation.suggestions
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
    }
  );

  // POST /v1/contracts/:id/plan - Generate plan
  router.post('/:id/plan',
    param('id').matches(/^[A-Z]+-\d+$/),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid contract ID format');
        }

        const { id } = req.params;
        const contract = featuresLib.getContractFeatureStatus(id, context.cwd);

        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        const path = require('path');
        const contractPath = path.join(context.cwd, contract.contractPath);

        const plan = await commands.plan(contractPath, context);

        res.json({
          status: 'success',
          data: { plan },
          metadata: {
            timestamp: new Date().toISOString(),
            version: context.version,
            requestId: req.requestId
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

module.exports = { createContractsRouter };
```

**Testing Requirements**:
- GET /v1/contracts returns all contracts
- POST /v1/contracts creates new contract
- GET /v1/contracts/:id returns contract + validation
- PUT /v1/contracts/:id updates content/status
- DELETE /v1/contracts/:id removes contract
- POST /v1/contracts/:id/validate runs validation
- POST /v1/contracts/:id/plan generates plan
- Invalid IDs return 400
- Non-existent contracts return 404

---

## Phase 1C: Rules Integration (Week 2, Days 1-2)

### 6. Rules Routes (`lib/api-routes/rules.cjs`)

**Purpose**: Rules repository sync and status endpoints

**Implementation**:

```javascript
const express = require('express');
const rulesSync = require('../rules-sync.cjs');
const syncLock = require('../sync-lock.cjs');
const manifestParser = require('../manifest-parser.cjs');
const config = require('../config.cjs');

function createRulesRouter(context) {
  const router = express.Router();

  // GET /v1/rules - List active rulesets
  router.get('/', async (req, res, next) => {
    try {
      const appConfig = config.loadConfig(context.cwd);
      const activeRulesets = appConfig.rulesets?.active || [];

      const lock = syncLock.readLock(context.cwd);
      const manifest = manifestParser.parseManifest(context.cwd);

      const rulesets = activeRulesets.map(rulesetPath => {
        const [category, name] = rulesetPath.split('/');
        const rulesetInfo = manifest.rulesets.find(r =>
          r.category === category && r.name === name
        );

        return {
          path: rulesetPath,
          category,
          name,
          version: lock.active.find(a => a.path === rulesetPath)?.version,
          ...rulesetInfo
        };
      });

      res.json({
        status: 'success',
        data: {
          rulesets,
          total: rulesets.length,
          lastSync: lock.lastSync,
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

      const result = await rulesSync.syncRules(context.cwd, appConfig);

      res.json({
        status: 'success',
        data: {
          synced: true,
          timestamp: result.lastSync,
          version: result.version,
          commit: result.commit,
          rulesets: result.activeRulesets
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: context.version,
          requestId: req.requestId
        }
      });
    } catch (error) {
      if (error.message.includes('git')) {
        error.statusCode = 503;
        error.code = 'GIT_UNAVAILABLE';
      }
      next(error);
    }
  });

  // GET /v1/rules/status - Check sync status & drift
  router.get('/status', async (req, res, next) => {
    try {
      const appConfig = config.loadConfig(context.cwd);
      const lock = syncLock.readLock(context.cwd);

      const isStale = syncLock.isLockStale(lock, appConfig);
      const hasDrift = syncLock.detectDrift(lock, context.cwd);

      res.json({
        status: 'success',
        data: {
          lastSync: lock.lastSync,
          isStale,
          hasDrift,
          source: lock.source,
          activeRulesets: lock.active.length
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
  router.get('/:category/:name', async (req, res, next) => {
    try {
      const { category, name } = req.params;
      const rulesetPath = `${category}/${name}`;

      const appConfig = config.loadConfig(context.cwd);
      const activeRulesets = appConfig.rulesets?.active || [];

      if (!activeRulesets.includes(rulesetPath)) {
        throw new NotFoundError('Ruleset', rulesetPath);
      }

      const manifest = manifestParser.parseManifest(context.cwd);
      const ruleset = manifest.rulesets.find(r =>
        r.category === category && r.name === name
      );

      if (!ruleset) {
        throw new NotFoundError('Ruleset', rulesetPath);
      }

      // Read ruleset content
      const fs = require('fs');
      const path = require('path');
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
```

**Testing Requirements**:
- GET /v1/rules lists active rulesets
- POST /v1/rules/sync syncs with remote
- GET /v1/rules/status shows drift status
- GET /v1/rules/:category/:name returns ruleset content
- Unconfigured repo returns 400
- Git unavailable returns 503

---

## Phase 1D: System Endpoints & CLI Integration (Week 2, Days 3-4)

### 7. OpenAPI/Swagger Documentation (`docs/openapi.yaml` + `/v1/docs`)

**Purpose**: Interactive API documentation with Swagger UI

**OpenAPI Specification** (`docs/openapi.yaml`):

```yaml
openapi: 3.0.0
info:
  title: Grabby REST API
  version: 1.0.0
  description: |
    Local-first REST API for Grabby contract management and rules repository integration.

    **Base URL**: http://127.0.0.1:3456

    **Authentication**: None (localhost-only, Phase 1)
  contact:
    name: Grabby Support
    url: https://github.com/your-org/grabby
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: http://127.0.0.1:3456
    description: Local development server

tags:
  - name: Contracts
    description: Contract CRUD operations and lifecycle management
  - name: Rules
    description: Rules repository sync and management
  - name: Health
    description: System health and configuration

paths:
  /v1/contracts:
    get:
      tags: [Contracts]
      summary: List all contracts
      description: Returns a list of all feature contracts in the repository
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      contracts:
                        type: array
                        items:
                          $ref: '#/components/schemas/ContractSummary'
                      total:
                        type: integer
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'

    post:
      tags: [Contracts]
      summary: Create new contract
      description: Creates a new feature contract from a title and objective
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [title, objective]
              properties:
                title:
                  type: string
                  minLength: 1
                  example: "Add user authentication"
                objective:
                  type: string
                  minLength: 1
                  example: "Implement JWT-based authentication for API endpoints"
                type:
                  type: string
                  enum: [feat, fix, refactor]
                  default: feat
      responses:
        '201':
          description: Contract created
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      contract:
                        $ref: '#/components/schemas/Contract'
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'
        '400':
          $ref: '#/components/responses/ValidationError'
        '409':
          $ref: '#/components/responses/ConflictError'

  /v1/contracts/{id}:
    parameters:
      - $ref: '#/components/parameters/ContractId'

    get:
      tags: [Contracts]
      summary: Get contract details
      description: Returns contract details including content and validation results
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      contract:
                        allOf:
                          - $ref: '#/components/schemas/Contract'
                          - type: object
                            properties:
                              content:
                                type: string
                              validation:
                                $ref: '#/components/schemas/ValidationResult'
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'
        '400':
          $ref: '#/components/responses/ValidationError'
        '404':
          $ref: '#/components/responses/NotFoundError'

    put:
      tags: [Contracts]
      summary: Update contract
      description: Updates contract content and/or status
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                content:
                  type: string
                  description: Full contract markdown content
                status:
                  type: string
                  enum: [draft, approved, executing, completed]
      responses:
        '200':
          description: Contract updated
        '400':
          $ref: '#/components/responses/ValidationError'
        '404':
          $ref: '#/components/responses/NotFoundError'

    delete:
      tags: [Contracts]
      summary: Delete contract
      description: Deletes a contract and its associated artifacts
      responses:
        '200':
          description: Contract deleted
        '400':
          $ref: '#/components/responses/ValidationError'
        '404':
          $ref: '#/components/responses/NotFoundError'

  /v1/contracts/{id}/validate:
    parameters:
      - $ref: '#/components/parameters/ContractId'

    post:
      tags: [Contracts]
      summary: Validate contract
      description: Runs validation checks on a contract
      responses:
        '200':
          description: Validation results
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    $ref: '#/components/schemas/ValidationResult'
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'
        '404':
          $ref: '#/components/responses/NotFoundError'

  /v1/contracts/{id}/plan:
    parameters:
      - $ref: '#/components/parameters/ContractId'

    post:
      tags: [Contracts]
      summary: Generate plan
      description: Generates an implementation plan for a contract
      responses:
        '200':
          description: Plan generated
        '404':
          $ref: '#/components/responses/NotFoundError'

  /v1/rules:
    get:
      tags: [Rules]
      summary: List active rulesets
      description: Returns all configured active rulesets
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      rulesets:
                        type: array
                        items:
                          $ref: '#/components/schemas/Ruleset'
                      total:
                        type: integer
                      lastSync:
                        type: string
                        format: date-time
                      manifestVersion:
                        type: string
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'

  /v1/rules/sync:
    post:
      tags: [Rules]
      summary: Sync with central repository
      description: Syncs rulesets from the configured central Git repository
      responses:
        '200':
          description: Sync successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      synced:
                        type: boolean
                      timestamp:
                        type: string
                        format: date-time
                      version:
                        type: string
                      commit:
                        type: string
                      rulesets:
                        type: array
                        items:
                          type: string
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'
        '503':
          description: Git unavailable
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /v1/rules/status:
    get:
      tags: [Rules]
      summary: Check sync status
      description: Returns ruleset sync status and drift detection
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      lastSync:
                        type: string
                        format: date-time
                      isStale:
                        type: boolean
                      hasDrift:
                        type: boolean
                      source:
                        type: object
                        properties:
                          repo:
                            type: string
                          branch:
                            type: string
                          commit:
                            type: string
                          version:
                            type: string
                      activeRulesets:
                        type: integer
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'

  /v1/rules/{category}/{name}:
    parameters:
      - name: category
        in: path
        required: true
        schema:
          type: string
        example: languages
      - name: name
        in: path
        required: true
        schema:
          type: string
        example: typescript

    get:
      tags: [Rules]
      summary: Get specific ruleset
      description: Returns details and content of a specific ruleset
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      ruleset:
                        allOf:
                          - $ref: '#/components/schemas/Ruleset'
                          - type: object
                            properties:
                              content:
                                type: string
                                description: Full ruleset markdown content
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'
        '404':
          $ref: '#/components/responses/NotFoundError'

  /v1/health:
    get:
      tags: [Health]
      summary: Health check
      description: Returns system health status and metrics
      responses:
        '200':
          description: System healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      status:
                        type: string
                        enum: [healthy, degraded]
                      services:
                        type: object
                        properties:
                          filesystem:
                            $ref: '#/components/schemas/ServiceStatus'
                          git:
                            $ref: '#/components/schemas/ServiceStatus'
                          rulesets:
                            $ref: '#/components/schemas/ServiceStatus'
                      system:
                        type: object
                        properties:
                          uptime:
                            type: number
                          memory:
                            type: object
                            properties:
                              used:
                                type: integer
                              total:
                                type: integer
                              external:
                                type: integer
                          platform:
                            type: string
                          nodeVersion:
                            type: string
                      version:
                        type: string
                      responseTime:
                        type: number
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'
        '503':
          description: System degraded or unhealthy

  /v1/config:
    get:
      tags: [Health]
      summary: Get configuration
      description: Returns runtime configuration (with secrets redacted)
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [success]
                  data:
                    type: object
                    properties:
                      config:
                        type: object
                  metadata:
                    $ref: '#/components/schemas/ResponseMetadata'

    put:
      tags: [Health]
      summary: Update configuration
      description: Updates runtime configuration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [updates]
              properties:
                updates:
                  type: object
                  description: Configuration fields to update
      responses:
        '200':
          description: Configuration updated
        '400':
          $ref: '#/components/responses/ValidationError'

components:
  parameters:
    ContractId:
      name: id
      in: path
      required: true
      description: Contract ID in format PREFIX-NUMBER (e.g., FC-123)
      schema:
        type: string
        pattern: '^[A-Z]+-\d+$'
      example: FC-123

  schemas:
    ContractSummary:
      type: object
      properties:
        id:
          type: string
          example: FC-123
        title:
          type: string
          example: "Add user authentication"
        status:
          type: string
          enum: [draft, approved, executing, completed]
        type:
          type: string
          enum: [feat, fix, refactor, FEATURE_CONTRACT]
        lastModified:
          type: string
          format: date-time
        path:
          type: string
          example: "contracts/FC-123.fc.md"

    Contract:
      allOf:
        - $ref: '#/components/schemas/ContractSummary'
        - type: object
          properties:
            objective:
              type: string
            planPath:
              type: string
              nullable: true
            auditPath:
              type: string
              nullable: true

    ValidationResult:
      type: object
      properties:
        valid:
          type: boolean
        errors:
          type: array
          items:
            type: string
        warnings:
          type: array
          items:
            type: string
        suggestions:
          type: array
          items:
            type: string

    Ruleset:
      type: object
      properties:
        path:
          type: string
          example: "languages/typescript"
        category:
          type: string
          example: "languages"
        name:
          type: string
          example: "typescript"
        version:
          type: string
          example: "1.0.0"
        description:
          type: string

    ServiceStatus:
      type: object
      properties:
        status:
          type: string
          enum: [ok, degraded, error, unavailable]
        message:
          type: string

    ResponseMetadata:
      type: object
      required: [timestamp, version, requestId]
      properties:
        timestamp:
          type: string
          format: date-time
        version:
          type: string
          example: "3.7.0"
        requestId:
          type: string
          format: uuid

    ErrorResponse:
      type: object
      properties:
        status:
          type: string
          enum: [error]
        error:
          type: object
          properties:
            code:
              type: string
            message:
              type: string
            details:
              type: object
        metadata:
          $ref: '#/components/schemas/ResponseMetadata'

  responses:
    ValidationError:
      description: Validation error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            status: error
            error:
              code: VALIDATION_ERROR
              message: Invalid request body
              details:
                errors:
                  - field: title
                    message: Must not be empty

    NotFoundError:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            status: error
            error:
              code: NOT_FOUND
              message: "Contract not found: FC-999"
              details:
                resource: Contract
                id: FC-999

    ConflictError:
      description: Conflict with existing resource
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            status: error
            error:
              code: CONFLICT
              message: Contract with this title already exists
              details: {}
```

**Swagger Integration** (`lib/api-server-v2.cjs`):

```javascript
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');

function setupSwagger(app, baseDir) {
  // Load OpenAPI spec
  const openapiPath = path.join(baseDir, 'docs', 'openapi.yaml');
  const openapiContent = fs.readFileSync(openapiPath, 'utf8');
  const openapiSpec = YAML.parse(openapiContent);

  // Serve Swagger UI at /v1/docs
  app.use('/v1/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'Grabby API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true
    }
  }));

  // Serve raw OpenAPI spec at /v1/openapi.yaml
  app.get('/v1/openapi.yaml', (req, res) => {
    res.type('text/yaml').send(openapiContent);
  });

  // Serve OpenAPI spec as JSON at /v1/openapi.json
  app.get('/v1/openapi.json', (req, res) => {
    res.json(openapiSpec);
  });
}
```

**Testing Requirements**:
- GET /v1/docs serves Swagger UI
- GET /v1/openapi.yaml returns OpenAPI spec
- GET /v1/openapi.json returns OpenAPI spec as JSON
- Swagger UI loads without errors
- All endpoints documented in OpenAPI spec
- Try It Out feature works for all endpoints

---

### 8. Health Routes (`lib/api-routes/health.cjs`)

**Purpose**: Health checks and configuration management

**Implementation**:

```javascript
const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');

function createHealthRouter(context) {
  const router = express.Router();

  // GET /v1/health - Health check
  router.get('/', async (req, res) => {
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
    const config = require('../config.cjs').loadConfig(context.cwd);

    // Redact sensitive fields
    const safeConfig = JSON.parse(JSON.stringify(config));
    if (safeConfig.ai?.apiKey) safeConfig.ai.apiKey = '***';
    if (safeConfig.jira?.apiToken) safeConfig.jira.apiToken = '***';

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
  router.put('/config',
    express.json(),
    (req, res, next) => {
      try {
        const { updates } = req.body;

        if (!updates || typeof updates !== 'object') {
          throw new ValidationError('Request body must contain "updates" object');
        }

        const config = require('../config.cjs');
        const currentConfig = config.loadConfig(context.cwd);

        // Merge updates
        const newConfig = { ...currentConfig, ...updates };

        // Validate new config
        config.validateConfig(newConfig);

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
    }
  );

  return router;
}

function checkFilesystem(cwd) {
  try {
    const contractsDir = path.join(cwd, 'contracts');
    const grabbyDir = path.join(cwd, '.grabby');

    const contractsExists = fs.existsSync(contractsDir);
    const grabbyExists = fs.existsSync(grabbyDir);

    if (!contractsExists || !grabbyExists) {
      return { status: 'degraded', message: 'Missing required directories' };
    }

    // Check disk space
    const stats = fs.statSync(grabbyDir);
    // Note: Actual disk space check would use a library like 'check-disk-space'

    return { status: 'ok' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

async function checkGit() {
  try {
    const { execSync } = require('child_process');
    execSync('git --version', { stdio: 'ignore' });
    return { status: 'ok' };
  } catch (error) {
    return { status: 'unavailable', message: 'Git not installed' };
  }
}

function checkRulesets(cwd) {
  try {
    const syncLock = require('../sync-lock.cjs');
    const lock = syncLock.readLock(cwd);

    const isStale = syncLock.isLockStale(lock);

    if (isStale) {
      return { status: 'degraded', message: 'Rulesets sync is stale' };
    }

    return { status: 'ok' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

module.exports = { createHealthRouter };
```

**Testing Requirements**:
- GET /v1/health returns 200 when healthy
- GET /v1/health returns 503 when degraded
- Response time < 50ms
- GET /v1/config redacts API keys
- PUT /v1/config validates and saves config

---

### 8. CLI Integration (`bin/index.cjs`)

**Purpose**: Add `grabby serve` command

**Implementation**:

```javascript
// Add to command handlers
.command('serve')
.description('Start REST API server')
.option('-p, --port <number>', 'Port to listen on (default: 3456)', '3456')
.option('-h, --host <address>', 'Host to bind to (default: 127.0.0.1)', '127.0.0.1')
.option('--log-level <level>', 'Logging level (debug, info, warn, error)', 'info')
.action(async (options) => {
  const apiServer = require('../lib/api-server-v2.cjs');

  const config = {
    port: parseInt(options.port, 10),
    host: options.host,
    logLevel: options.logLevel,
    version: packageJson.version,
    cwd: process.cwd()
  };

  try {
    const { server, port } = await apiServer.startServer(config);
    console.log(`✅ Grabby API server started on http://${config.host}:${port}`);
    console.log(`📖 API documentation: http://${config.host}:${port}/v1/docs`);
  } catch (error) {
    console.error('❌ Failed to start API server:', error.message);
    process.exit(1);
  }
});
```

**Testing Requirements**:
- `grabby serve` starts server on port 3456
- `grabby serve --port 4000` uses custom port
- Server logs startup message
- CTRL+C triggers graceful shutdown

---

## Testing Strategy

### Unit Tests (80%+ coverage)

**Contract Routes** (`tests/api/contracts.test.js`):
- ✓ GET /v1/contracts returns empty array
- ✓ GET /v1/contracts returns contracts
- ✓ POST /v1/contracts creates contract
- ✓ POST /v1/contracts validates input
- ✓ GET /v1/contracts/:id returns contract
- ✓ GET /v1/contracts/INVALID-ID returns 400
- ✓ GET /v1/contracts/MISSING-1 returns 404
- ✓ PUT /v1/contracts/:id updates content
- ✓ PUT /v1/contracts/:id updates status
- ✓ DELETE /v1/contracts/:id removes contract
- ✓ POST /v1/contracts/:id/validate runs validation
- ✓ POST /v1/contracts/:id/plan generates plan

**Rules Routes** (`tests/api/rules.test.js`):
- ✓ GET /v1/rules returns active rulesets
- ✓ POST /v1/rules/sync syncs successfully
- ✓ POST /v1/rules/sync handles git errors
- ✓ GET /v1/rules/status detects drift
- ✓ GET /v1/rules/:category/:name returns ruleset
- ✓ GET /v1/rules/invalid/missing returns 404

**Health Routes** (`tests/api/health.test.js`):
- ✓ GET /v1/health returns 200 when healthy
- ✓ GET /v1/health returns 503 when degraded
- ✓ GET /v1/health completes in < 50ms
- ✓ GET /v1/config redacts secrets
- ✓ PUT /v1/config updates configuration
- ✓ PUT /v1/config validates input

### Integration Tests

**End-to-End Workflow**:
1. Start server
2. Create contract via POST
3. Validate via POST /validate
4. Generate plan via POST /plan
5. Retrieve via GET
6. Update status via PUT
7. Delete via DELETE
8. Verify removed

**Sync Workflow**:
1. Start server
2. GET /v1/rules/status (expect stale)
3. POST /v1/rules/sync
4. GET /v1/rules/status (expect clean)
5. GET /v1/rules to list all

### Performance Tests

**Load Testing**:
- 100 concurrent GET requests
- Response time p95 < 100ms
- No memory leaks over 1 hour
- Graceful degradation under load

---

## Security Checklist

- [x] Server binds to 127.0.0.1 only (not 0.0.0.0)
- [x] Rate limiting: 100 req/min per IP
- [x] Input validation on all endpoints
- [x] Path traversal prevention in contract IDs
- [x] CORS restricted to localhost origins
- [x] Helmet security headers applied
- [x] No stack traces in production
- [x] API keys redacted in /v1/config
- [x] No code execution endpoints
- [x] Read-only rules repository access

---

## Deployment Checklist

### Week 1 Deliverables
- [ ] HTTP server with graceful shutdown
- [ ] Request logging middleware
- [ ] Error handling middleware
- [ ] Rate limiting middleware
- [ ] Contract CRUD endpoints
- [ ] Contract validation endpoint
- [ ] Contract plan endpoint

### Week 2 Deliverables
- [ ] Rules listing endpoint
- [ ] Rules sync endpoint
- [ ] Rules status endpoint
- [ ] Health check endpoint
- [ ] Configuration endpoints
- [ ] OpenAPI 3.0 specification (openapi.yaml)
- [ ] Swagger UI at /v1/docs
- [ ] CLI `grabby serve` command
- [ ] API documentation (API.md)

### Quality Gates
- [ ] 80%+ test coverage
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] ESLint clean (no warnings)
- [ ] API documentation complete
- [ ] Performance benchmarks met

---

## Rollback Plan

If critical issues arise:

1. **Stop the server**: Kill the `grabby serve` process
2. **Revert code**: `git revert <commit-hash>`
3. **Reinstall dependencies**: `npm install`
4. **Verify CLI works**: Test `grabby validate`, `grabby plan`, `grabby execute`

**Rollback Time**: < 10 minutes

---

## Next Steps After Completion

1. **Phase 2**: Context optimization and caching
2. **Phase 3**: Agent runtime and workflow engine
3. **Phase 4**: Authentication, SSE, webhooks

---

**End of Implementation Plan**
