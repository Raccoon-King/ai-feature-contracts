/**
 * REST API Server for Grabby
 * Local-first control plane for contract management and rules repository integration
 * @module api-server-v2
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');
const net = require('net');

const { createRequestLogger } = require('./middleware/request-logger.cjs');
const { createErrorHandler } = require('./middleware/error-handler.cjs');
const { createRateLimiter } = require('./middleware/rate-limiter.cjs');
const { createContractsRouter } = require('./api-routes/contracts.cjs');
const { createRulesRouter } = require('./api-routes/rules.cjs');
const { createHealthRouter } = require('./api-routes/health.cjs');
const { getProjectMetadata } = require('./project-metadata.cjs');

/**
 * Create Express application
 * @param {Object} config - Server configuration
 * @returns {express.Application} Express app
 */
function createApp(config) {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false // Disable for Swagger UI
  }));

  // CORS - only allow localhost
  const metadata = getProjectMetadata(config.cwd);
  app.use(cors({
    origin: metadata.defaults.api.corsOrigins,
    credentials: true
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(createRequestLogger(config));

  // Rate limiting (except health checks)
  app.use(createRateLimiter(config));

  // Setup Swagger documentation
  setupSwagger(app, config);

  // API routes
  const context = {
    cwd: config.cwd || process.cwd(),
    version: config.version || '3.7.0'
  };

  app.use('/v1/contracts', createContractsRouter(context));
  app.use('/v1/rules', createRulesRouter(context));
  app.use('/v1', createHealthRouter(context));

  // Root endpoint - API info
  app.get('/', (req, res) => {
    res.json({
      name: 'Grabby REST API',
      version: config.version || '3.7.0',
      documentation: '/v1/docs',
      endpoints: {
        contracts: '/v1/contracts',
        rules: '/v1/rules',
        health: '/v1/health',
        config: '/v1/config'
      }
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      error: {
        code: 'NOT_FOUND',
        message: `Route not found: ${req.method} ${req.path}`,
        details: {}
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: config.version || '3.7.0',
        requestId: req.requestId || 'unknown'
      }
    });
  });

  // Error handler (must be last)
  app.use(createErrorHandler(config));

  return app;
}

/**
 * Setup Swagger UI and OpenAPI spec endpoints
 * @param {express.Application} app - Express app
 * @param {Object} config - Server configuration
 */
function setupSwagger(app, config) {
  const baseDir = config.cwd || process.cwd();
  const openapiPath = path.join(baseDir, 'docs', 'openapi.yaml');

  // Check if OpenAPI spec exists
  if (!fs.existsSync(openapiPath)) {
    console.warn('OpenAPI spec not found at', openapiPath);
    return;
  }

  try {
    // Load OpenAPI spec
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

    // Serve raw OpenAPI spec
    app.get('/v1/openapi.yaml', (req, res) => {
      res.type('text/yaml').send(openapiContent);
    });

    app.get('/v1/openapi.json', (req, res) => {
      res.json(openapiSpec);
    });
  } catch (error) {
    console.error('Failed to load OpenAPI spec:', error.message);
  }
}

/**
 * Find available port in range
 * @param {number} startPort - Starting port number
 * @param {number} maxAttempts - Maximum attempts
 * @returns {Promise<number>} Available port
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const isAvailable = await checkPort(port);
    if (isAvailable) return port;
  }
  throw new Error(`No available port in range ${startPort}-${startPort + maxAttempts}`);
}

/**
 * Check if port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if available
 */
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

/**
 * Setup graceful shutdown
 * @param {http.Server} server - HTTP server
 * @param {Object} logger - Logger instance
 */
function setupGracefulShutdown(server, logger) {
  const shutdown = async (signal) => {
    if (logger) {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
    } else {
      console.log(`Received ${signal}, starting graceful shutdown...`);
    }

    // Stop accepting new connections
    server.close(() => {
      if (logger) {
        logger.info('HTTP server closed');
      } else {
        console.log('HTTP server closed');
      }
      process.exit(0);
    });

    // Force shutdown after 30s
    setTimeout(() => {
      if (logger) {
        logger.error('Forced shutdown after timeout');
      } else {
        console.error('Forced shutdown after timeout');
      }
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Start API server
 * @param {Object} config - Server configuration
 * @returns {Promise<Object>} Server instance and port
 */
async function startServer(config) {
  // Create Express app
  const app = createApp(config);

  // Get metadata for defaults
  const metadata = getProjectMetadata(config.cwd);
  const defaultHost = metadata.defaults.api.host;

  // Find available port
  const port = await findAvailablePort(config.port || metadata.defaults.api.portRange[0]);

  // Start HTTP server
  const server = app.listen(port, defaultHost, () => {
    console.log(`✅ Grabby API server started on http://${defaultHost}:${port}`);
    console.log(`📖 API documentation: http://${defaultHost}:${port}/v1/docs`);
  });

  // Setup graceful shutdown
  setupGracefulShutdown(server, null);

  return { server, port, app };
}

module.exports = {
  createApp,
  startServer,
  findAvailablePort,
  setupGracefulShutdown
};
