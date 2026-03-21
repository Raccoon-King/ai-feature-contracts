/**
 * Agents and Workflows API Routes
 * Exposes dedicated agents and their workflows through the REST API
 * @module api-routes/agents
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('yaml');
const { validationResult, param } = require('express-validator');

const personasLib = require('../personas.cjs');
const { ValidationError, NotFoundError } = require('../middleware/error-handler.cjs');

/**
 * Create agents router
 * @param {Object} context - API context
 * @returns {express.Router} Express router
 */
function createAgentsRouter(context) {
  const router = express.Router();

  // GET /v1/agents - List all agents
  router.get('/', async (req, res, next) => {
    try {
      const catalog = personasLib.loadAgentCatalog({ useCache: false });
      const agents = Object.entries(catalog.personas).map(([key, persona]) => ({
        id: key,
        name: persona.agentName,
        title: persona.title,
        mode: persona.mode,
        handoffCommand: persona.handoffCommand,
        rationale: persona.rationale,
        fileName: persona.fileName,
        menuCount: persona.menu?.length || 0,
        metadata: persona.metadata || {}
      }));

      res.json({
        status: 'success',
        data: {
          agents,
          total: agents.length
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: context.version
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // STATIC ROUTES MUST COME BEFORE DYNAMIC /:id ROUTES

  // GET /v1/agents/all/workflows - List all workflows
  router.get('/all/workflows', async (req, res, next) => {
    try {
      const workflowsDir = path.join(__dirname, '..', '..', 'workflows');
      const workflows = [];

      if (fs.existsSync(workflowsDir)) {
        const dirs = fs.readdirSync(workflowsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        for (const dir of dirs) {
          const workflowFile = path.join(workflowsDir, dir, 'workflow.yaml');
          if (fs.existsSync(workflowFile)) {
            try {
              const content = fs.readFileSync(workflowFile, 'utf8');
              const parsed = yaml.parse(content);
              workflows.push({
                id: dir,
                name: parsed?.workflow?.name || dir,
                description: parsed?.workflow?.description || '',
                steps: parsed?.workflow?.steps?.length || 0,
                path: `workflows/${dir}/workflow.yaml`
              });
            } catch {
              workflows.push({
                id: dir,
                name: dir,
                description: 'Failed to parse workflow',
                steps: 0,
                path: `workflows/${dir}/workflow.yaml`
              });
            }
          }
        }
      }

      res.json({
        status: 'success',
        data: {
          workflows,
          total: workflows.length
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: context.version
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /v1/agents/lint/all - Lint all agent definitions
  router.get('/lint/all', async (req, res, next) => {
    try {
      const lintResults = personasLib.lintAgentDefinitions();

      res.json({
        status: 'success',
        data: {
          valid: lintResults.valid,
          results: lintResults.results.map(r => ({
            fileName: r.fileName,
            valid: r.valid,
            errors: r.errors,
            warnings: r.warnings,
            personaKey: r.personaKey
          }))
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: context.version
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /v1/agents/route - Route a request to the appropriate agent
  router.post('/route', async (req, res, next) => {
    try {
      const { request, context: routingContext = {} } = req.body;

      if (!request || typeof request !== 'string') {
        throw new ValidationError('Request string is required');
      }

      const routing = personasLib.deriveWorkflowRoles(
        { ...routingContext, request },
        {}
      );

      res.json({
        status: 'success',
        data: {
          primary: {
            id: routing.primary.agentKey,
            name: routing.primary.agentName,
            title: routing.primary.title,
            mode: routing.primary.mode,
            handoffCommand: routing.primary.handoffCommand
          },
          next: routing.next ? {
            id: routing.next.agentKey,
            name: routing.next.agentName,
            title: routing.next.title
          } : null,
          decision: routing.decision,
          transitions: routing.transitions.map(t => ({
            stage: t.stage,
            owner: t.owner.agentKey
          }))
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: context.version
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // DYNAMIC ROUTES AFTER STATIC ROUTES

  // GET /v1/agents/:id - Get agent details
  router.get('/:id',
    param('id').isString().notEmpty().withMessage('Agent ID required'),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid agent ID');
        }

        const { id } = req.params;
        const persona = personasLib.getPersonaByKey(id);

        if (!persona) {
          throw new NotFoundError('Agent', id);
        }

        // Load full agent definition if file exists
        let agentDefinition = null;
        if (persona.fileName) {
          const agentPath = path.join(__dirname, '..', '..', 'agents', persona.fileName);
          if (fs.existsSync(agentPath)) {
            const content = fs.readFileSync(agentPath, 'utf8');
            agentDefinition = yaml.parse(content);
          }
        }

        res.json({
          status: 'success',
          data: {
            agent: {
              id,
              name: persona.agentName,
              title: persona.title,
              mode: persona.mode,
              handoffCommand: persona.handoffCommand,
              rationale: persona.rationale,
              menu: persona.menu || [],
              metadata: persona.metadata || {},
              definition: agentDefinition
            }
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: context.version
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /v1/agents/:id/workflows - List agent workflows
  router.get('/:id/workflows',
    param('id').isString().notEmpty().withMessage('Agent ID required'),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid agent ID');
        }

        const { id } = req.params;
        const persona = personasLib.getPersonaByKey(id);

        if (!persona) {
          throw new NotFoundError('Agent', id);
        }

        const workflows = (persona.menu || []).map(item => ({
          trigger: item.trigger,
          command: item.command,
          workflowPath: item.workflow,
          description: item.description
        }));

        res.json({
          status: 'success',
          data: {
            agentId: id,
            workflows,
            total: workflows.length
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: context.version
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

module.exports = {
  createAgentsRouter
};
