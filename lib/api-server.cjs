/**
 * REST API Server for Grabby
 * Provides HTTP endpoints for external integrations
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { validateContract, validateContractStrict } = require('./core.cjs');
const { collectMetrics, generateReport } = require('./metrics.cjs');
const { scoreContractComplexity } = require('./complexity.cjs');

/**
 * Parse JSON body from request
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Send error response
 */
function sendError(res, message, status = 400) {
  sendJSON(res, { error: message }, status);
}

/**
 * Create API server
 */
function createAPIServer(context, options = {}) {
  const { contractsDir, grabbyDir } = context;
  const { rateLimit = 100 } = options;

  // Simple rate limiting
  const requestCounts = new Map();
  const resetInterval = setInterval(() => requestCounts.clear(), 60000);

  const checkRateLimit = (ip) => {
    const count = requestCounts.get(ip) || 0;
    requestCounts.set(ip, count + 1);
    return count < rateLimit;
  };

  // Route handlers
  const routes = {
    // List all contracts
    'GET /api/contracts': async (req, res) => {
      if (!fs.existsSync(contractsDir)) {
        return sendJSON(res, { contracts: [] });
      }

      const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.fc.md'));
      const contracts = files.map(file => {
        const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
        const titleMatch = content.match(/^# FC:\s+(.+)$/m);
        const idMatch = content.match(/\*\*ID:\*\*\s*(FC-\d+)/);
        const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);

        return {
          file,
          id: idMatch?.[1] || 'unknown',
          title: titleMatch?.[1] || file,
          status: statusMatch?.[1] || 'unknown',
        };
      });

      sendJSON(res, { contracts });
    },

    // Get single contract
    'GET /api/contracts/:id': async (req, res, params) => {
      const file = findContractByIdOrFile(contractsDir, params.id);
      if (!file) {
        return sendError(res, 'Contract not found', 404);
      }

      const filePath = path.join(contractsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const validation = validateContract(content);
      const complexity = scoreContractComplexity(content);

      sendJSON(res, {
        file,
        content,
        validation,
        complexity,
      });
    },

    // Create contract
    'POST /api/contracts': async (req, res) => {
      const body = await parseBody(req);
      const { name, template = 'contract', content } = body;

      if (!name && !content) {
        return sendError(res, 'Name or content required');
      }

      if (!fs.existsSync(contractsDir)) {
        fs.mkdirSync(contractsDir, { recursive: true });
      }

      if (content) {
        // Direct content creation
        const fileName = `${slugify(name || 'contract')}.fc.md`;
        const filePath = path.join(contractsDir, fileName);
        fs.writeFileSync(filePath, content);
        sendJSON(res, { created: fileName }, 201);
      } else {
        // Use template
        const { createContract } = require('./core.cjs');
        const templatesDir = path.join(__dirname, '..', 'templates');
        try {
          const result = createContract(templatesDir, contractsDir, name, template);
          sendJSON(res, { created: result.fileName, id: result.id }, 201);
        } catch (err) {
          sendError(res, err.message);
        }
      }
    },

    // Update contract
    'PUT /api/contracts/:id': async (req, res, params) => {
      const file = findContractByIdOrFile(contractsDir, params.id);
      if (!file) {
        return sendError(res, 'Contract not found', 404);
      }

      const body = await parseBody(req);
      const { content, status } = body;

      const filePath = path.join(contractsDir, file);
      let fileContent = fs.readFileSync(filePath, 'utf8');

      if (content) {
        fileContent = content;
      }

      if (status) {
        fileContent = fileContent.replace(/\*\*Status:\*\*\s*\w+/, `**Status:** ${status}`);
      }

      fs.writeFileSync(filePath, fileContent);
      sendJSON(res, { updated: file });
    },

    // Delete contract
    'DELETE /api/contracts/:id': async (req, res, params) => {
      const file = findContractByIdOrFile(contractsDir, params.id);
      if (!file) {
        return sendError(res, 'Contract not found', 404);
      }

      fs.unlinkSync(path.join(contractsDir, file));
      sendJSON(res, { deleted: file });
    },

    // Validate contract
    'POST /api/contracts/:id/validate': async (req, res, params) => {
      const file = findContractByIdOrFile(contractsDir, params.id);
      if (!file) {
        return sendError(res, 'Contract not found', 404);
      }

      const body = await parseBody(req);
      const strict = body.strict || false;

      const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
      const result = strict
        ? validateContractStrict(content, path.dirname(contractsDir))
        : validateContract(content);

      sendJSON(res, result);
    },

    // Get metrics
    'GET /api/metrics': async (req, res) => {
      const metrics = collectMetrics(contractsDir);
      sendJSON(res, metrics);
    },

    // Health check
    'GET /api/health': async (req, res) => {
      sendJSON(res, {
        status: 'ok',
        version: '2.0.0',
        uptime: process.uptime(),
      });
    },
  };

  // Route matching
  const matchRoute = (method, pathname) => {
    for (const [route, handler] of Object.entries(routes)) {
      const [routeMethod, routePath] = route.split(' ');
      if (method !== routeMethod) continue;

      // Check for params
      const routeParts = routePath.split('/');
      const pathParts = pathname.split('/');

      if (routeParts.length !== pathParts.length) continue;

      const params = {};
      let match = true;

      for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':')) {
          params[routeParts[i].slice(1)] = pathParts[i];
        } else if (routeParts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }

      if (match) return { handler, params };
    }
    return null;
  };

  // Create server
  const server = http.createServer(async (req, res) => {
    const ip = req.socket.remoteAddress;

    // Rate limiting
    if (!checkRateLimit(ip)) {
      return sendError(res, 'Rate limit exceeded', 429);
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    const { pathname } = url.parse(req.url);
    const route = matchRoute(req.method, pathname);

    if (!route) {
      return sendError(res, 'Not found', 404);
    }

    try {
      await route.handler(req, res, route.params);
    } catch (err) {
      console.error('API Error:', err);
      sendError(res, err.message, 500);
    }
  });

  return {
    start: (port = 3456) => {
      return new Promise((resolve) => {
        server.listen(port, () => {
          console.log(`Grabby API server running on http://localhost:${port}`);
          console.log('\nEndpoints:');
          console.log('  GET    /api/health              Health check');
          console.log('  GET    /api/contracts           List contracts');
          console.log('  GET    /api/contracts/:id       Get contract');
          console.log('  POST   /api/contracts           Create contract');
          console.log('  PUT    /api/contracts/:id       Update contract');
          console.log('  DELETE /api/contracts/:id       Delete contract');
          console.log('  POST   /api/contracts/:id/validate  Validate');
          console.log('  GET    /api/metrics             Get metrics');
          console.log('\nPress Ctrl+C to stop\n');
          resolve(server);
        });
      });
    },

    stop: () => {
      clearInterval(resetInterval);
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

// Helper functions
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findContractByIdOrFile(contractsDir, idOrFile) {
  if (!fs.existsSync(contractsDir)) return null;

  const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.fc.md'));

  // Try exact file match first
  if (files.includes(idOrFile)) return idOrFile;
  if (files.includes(`${idOrFile}.fc.md`)) return `${idOrFile}.fc.md`;

  // Try ID match
  for (const file of files) {
    const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
    const idMatch = content.match(/\*\*ID:\*\*\s*(FC-\d+)/);
    if (idMatch?.[1] === idOrFile) return file;
  }

  return null;
}

module.exports = { createAPIServer };
