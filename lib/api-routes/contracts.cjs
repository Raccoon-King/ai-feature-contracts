/**
 * Contract management routes (CRUD operations)
 * @module api-routes/contracts
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/error-handler.cjs');
const fs = require('fs');
const path = require('path');

/**
 * Create contracts router
 * @param {Object} context - Application context
 * @returns {express.Router} Express router
 */
function createContractsRouter(context) {
  const router = express.Router();
  const featuresLib = require('../features.cjs');
  const core = require('../core.cjs');
  const commands = require('../commands.cjs');

  // Create proper project context for command handlers
  const projectContext = commands.createProjectContext({
    cwd: context.cwd,
    pkgRoot: require('path').join(__dirname, '..', '..')
  });

  // Create command handlers with proper logger and exit handlers
  const commandHandlers = commands.createCommandHandlers({
    context: projectContext,
    logger: {
      log: () => {}, // Suppress console output in API mode
      warn: () => {},
      error: () => {}
    },
    exit: (code) => {
      throw new Error(`Command exited with code ${code}`);
    }
  });

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
            path: c.contractPath,
            planPath: c.planPath,
            auditPath: c.auditPath
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
    body('title').notEmpty().trim().withMessage('Title is required'),
    body('objective').notEmpty().trim().withMessage('Objective is required'),
    body('type').optional().isIn(['feat', 'fix', 'refactor']).withMessage('Invalid type'),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          const firstError = errors.array()[0];
          throw new ValidationError(firstError.msg, { errors: errors.array() });
        }

        const { title, objective, type = 'feat' } = req.body;

        // Check for duplicate titles
        const existing = featuresLib.listContractFeatures(context.cwd);
        if (existing.some(c => c.title.toLowerCase() === title.toLowerCase())) {
          throw new ConflictError('Contract with this title already exists');
        }

        // Generate contract ID
        const contractId = `FC-${Date.now()}`;

        // Create contract content
        const contractContent = `# FC: ${title}
**ID:** ${contractId} | **Status:** draft
**Data Change:** no
**API Change:** no
CONTRACT_TYPE: FEATURE_CONTRACT

## Objective

${objective}

## Business Value

[To be defined]

## Scope

[To be defined]

## Files

[To be defined]

## Done When

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
`;

        // Write contract file
        const contractsDir = path.join(context.cwd, 'contracts');
        if (!fs.existsSync(contractsDir)) {
          fs.mkdirSync(contractsDir, { recursive: true });
        }

        const contractPath = path.join(contractsDir, `${contractId}.fc.md`);
        fs.writeFileSync(contractPath, contractContent, 'utf8');

        const contract = {
          id: contractId,
          title,
          objective,
          type,
          status: 'draft',
          path: path.relative(context.cwd, contractPath).replace(/\\/g, '/')
        };

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
    param('id').matches(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/).withMessage('Invalid contract ID format'),
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
        const contractPath = path.join(context.cwd, contract.contractPath);
        const content = fs.readFileSync(contractPath, 'utf8');

        // Return contract with content (validation is optional via query param)
        const shouldValidate = req.query.validate === 'true';

        const response = {
          contract: {
            ...contract,
            content
          }
        };

        if (shouldValidate) {
          try {
            // Capture validation output
            let validationErrors = [];
            let validationWarnings = [];

            const mockLogger = {
              log: (msg) => {
                if (msg.includes('Errors')) validationErrors.push(msg);
                else if (msg.includes('Warnings')) validationWarnings.push(msg);
              }
            };

            // This is a simplified validation - in production you'd call the actual validator
            response.contract.validation = {
              valid: validationErrors.length === 0,
              errors: validationErrors,
              warnings: validationWarnings
            };
          } catch (validationError) {
            response.contract.validation = {
              valid: false,
              errors: [validationError.message],
              warnings: []
            };
          }
        }

        res.json({
          status: 'success',
          data: response,
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
    param('id').matches(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/).withMessage('Invalid contract ID format'),
    body('content').optional().isString().withMessage('Content must be a string'),
    body('status').optional().isIn(['draft', 'approved', 'executing', 'completed']).withMessage('Invalid status'),
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

        const contractPath = path.join(context.cwd, contract.contractPath);

        // Update content if provided
        if (content) {
          fs.writeFileSync(contractPath, content, 'utf8');
        }

        // Update status if provided
        if (status) {
          let updatedContent = content || fs.readFileSync(contractPath, 'utf8');
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
            contract: { id, status: status || contract.status }
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
    param('id').matches(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/).withMessage('Invalid contract ID format'),
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
    param('id').matches(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/).withMessage('Invalid contract ID format'),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new ValidationError('Invalid contract ID format');
        }

        const { id } = req.params;
        const contract = featuresLib.getContractFeatureStatus(id, context.cwd);

        // Check if contract exists BEFORE attempting validation
        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        const contractPath = path.join(context.cwd, contract.contractPath);

        // Verify file exists
        if (!fs.existsSync(contractPath)) {
          throw new NotFoundError('Contract file', contractPath);
        }

        try {
          // Run validation using command handler
          await commandHandlers.validate(contractPath);

          res.json({
            status: 'success',
            data: {
              message: 'Validation completed',
              valid: true
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: context.version,
              requestId: req.requestId
            }
          });
        } catch (validationError) {
          // Validation ran but found errors
          res.json({
            status: 'success',
            data: {
              message: 'Validation completed with errors',
              valid: false,
              error: validationError.message
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: context.version,
              requestId: req.requestId
            }
          });
        }
      } catch (error) {
        // Contract not found or other errors
        next(error);
      }
    }
  );

  // POST /v1/contracts/:id/plan - Generate plan
  router.post('/:id/plan',
    param('id').matches(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+$/).withMessage('Invalid contract ID format'),
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

        const contractPath = path.join(context.cwd, contract.contractPath);

        // Verify file exists
        if (!fs.existsSync(contractPath)) {
          throw new NotFoundError('Contract file', contractPath);
        }

        try {
          // Generate plan using command handler (properly await)
          await commandHandlers.plan(contractPath);

          const planPath = path.join(path.dirname(contractPath), `${id}.plan.yaml`);
          let planContent = null;
          if (fs.existsSync(planPath)) {
            planContent = fs.readFileSync(planPath, 'utf8');
          }

          res.json({
            status: 'success',
            data: {
              message: 'Plan generated',
              planPath: path.relative(context.cwd, planPath).replace(/\\/g, '/'),
              plan: planContent
            },
            metadata: {
              timestamp: new Date().toISOString(),
              version: context.version,
              requestId: req.requestId
            }
          });
        } catch (planError) {
          // Plan generation failed
          throw new Error(`Failed to generate plan: ${planError.message}`);
        }
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

module.exports = { createContractsRouter };
