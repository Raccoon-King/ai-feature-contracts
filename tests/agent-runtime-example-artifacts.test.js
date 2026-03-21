const assert = require('assert');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

describe('Agent Runtime Example Artifacts', function () {
  const templatesDir = path.join(__dirname, '..', 'templates');
  const docsDir = path.join(__dirname, '..', 'docs');

  describe('Runtime Contract Example', function () {
    let contract;
    const contractPath = path.join(templatesDir, 'agent-runtime-contract.example.yaml');

    beforeAll(function () {
      const content = fs.readFileSync(contractPath, 'utf8');
      contract = yaml.parse(content);
    });

    it('should exist as a valid YAML file', function () {
      assert.ok(fs.existsSync(contractPath), 'Contract file should exist');
      assert.ok(contract, 'Contract should parse as valid YAML');
    });

    it('should have required top-level fields', function () {
      assert.ok(contract.version, 'Should have version');
      assert.ok(contract.type, 'Should have type');
      assert.ok(contract.metadata, 'Should have metadata');
      assert.ok(contract.input, 'Should have input');
      assert.ok(contract.output, 'Should have output');
      assert.ok(contract.tools, 'Should have tools');
      assert.ok(contract.rules, 'Should have rules');
      assert.ok(contract.workflow, 'Should have workflow');
    });

    it('should have valid metadata', function () {
      assert.ok(contract.metadata.id, 'Should have metadata.id');
      assert.ok(contract.metadata.name, 'Should have metadata.name');
      assert.ok(contract.metadata.version, 'Should have metadata.version');
    });

    it('should define input schema', function () {
      assert.ok(Array.isArray(contract.input.required), 'Should have required inputs');
      assert.ok(contract.input.required.length > 0, 'Should have at least one required input');

      const contractPath = contract.input.required.find(i => i.name === 'contractPath');
      assert.ok(contractPath, 'Should require contractPath input');
      assert.strictEqual(contractPath.type, 'string', 'contractPath should be string');
    });

    it('should define output schema', function () {
      assert.ok(contract.output.schema, 'Should have output schema');
      assert.ok(contract.output.properties, 'Should have output properties');
      assert.ok(contract.output.properties.valid, 'Should have valid property');
      assert.ok(contract.output.properties.errors, 'Should have errors property');
    });

    it('should specify allowed and denied tools', function () {
      assert.ok(Array.isArray(contract.tools.allowed), 'Should have allowed tools');
      assert.ok(Array.isArray(contract.tools.denied), 'Should have denied tools');
      assert.ok(contract.tools.allowed.length > 0, 'Should have at least one allowed tool');
      assert.ok(contract.tools.denied.length > 0, 'Should have at least one denied tool');

      // Validation should not allow write-file
      const writeFile = contract.tools.denied.find(t => t.name === 'write-file');
      assert.ok(writeFile, 'write-file should be denied for validation');
    });

    it('should define validation rules by category', function () {
      assert.ok(contract.rules.structural, 'Should have structural rules');
      assert.ok(contract.rules.semantic, 'Should have semantic rules');
      assert.ok(contract.rules.security, 'Should have security rules');

      // Each rule should have required fields
      contract.rules.structural.forEach(rule => {
        assert.ok(rule.id, 'Rule should have id');
        assert.ok(rule.check, 'Rule should have check');
        assert.ok(rule.severity, 'Rule should have severity');
        assert.ok(rule.message, 'Rule should have message');
      });
    });

    it('should define deterministic workflow steps', function () {
      assert.ok(Array.isArray(contract.workflow.steps), 'Should have workflow steps');
      assert.ok(contract.workflow.steps.length > 0, 'Should have at least one step');

      // Each step should have required fields
      contract.workflow.steps.forEach(step => {
        assert.ok(step.id, 'Step should have id');
        assert.ok(step.action, 'Step should have action');
      });

      // Should have a parse step first
      assert.strictEqual(contract.workflow.steps[0].id, 'parse', 'First step should be parse');
    });

    it('should have only one LLM step', function () {
      const llmSteps = contract.workflow.steps.filter(s => s.action === 'llm-call');
      assert.strictEqual(llmSteps.length, 1, 'Should have exactly one LLM step');
      assert.strictEqual(llmSteps[0].id, 'generate-summary', 'LLM step should be for summary generation');
    });

    it('should define minimal LLM prompt template', function () {
      assert.ok(contract.llm, 'Should have llm section');
      assert.ok(contract.llm.prompts, 'Should have prompts');
      assert.ok(contract.llm.prompts['minimal-validation-summary'], 'Should have validation summary prompt');

      const prompt = contract.llm.prompts['minimal-validation-summary'];
      assert.ok(prompt.template, 'Prompt should have template');
      assert.ok(prompt.max_tokens, 'Prompt should have max_tokens');
      assert.ok(prompt.max_tokens <= 500, 'Prompt max_tokens should be small');
    });

    it('should define success criteria', function () {
      assert.ok(contract.success, 'Should have success section');
      assert.ok(Array.isArray(contract.success.conditions), 'Should have conditions');
      assert.ok(contract.success.on_failure, 'Should have on_failure handler');
      assert.ok(contract.success.on_success, 'Should have on_success handler');
    });
  });

  describe('Minimal Prompt Example', function () {
    const promptPath = path.join(templatesDir, 'agent-runtime-minimal-prompt.md');
    let content;

    beforeAll(function () {
      content = fs.readFileSync(promptPath, 'utf8');
    });

    it('should exist as a markdown file', function () {
      assert.ok(fs.existsSync(promptPath), 'Prompt file should exist');
    });

    it('should contain before/after comparison', function () {
      assert.ok(content.includes('Current Prompt (Before'), 'Should have before section');
      assert.ok(content.includes('Minimal Prompt (After'), 'Should have after section');
    });

    it('should demonstrate token reduction', function () {
      assert.ok(content.includes('token'), 'Should discuss token usage');
      assert.ok(content.includes('reduction') || content.includes('efficient'), 'Should mention efficiency');
    });

    it('should include implementation notes', function () {
      assert.ok(content.includes('Implementation Notes'), 'Should have implementation section');
      assert.ok(content.includes('buildValidationContext') || content.includes('context-builder'),
        'Should reference context builder');
    });

    it('should include comparison table', function () {
      assert.ok(content.includes('| Aspect |'), 'Should have comparison table');
    });
  });

  describe('Evaluation Document', function () {
    const evalPath = path.join(docsDir, 'AGENT_PROMPT_EVALUATION.md');
    let content;

    beforeAll(function () {
      content = fs.readFileSync(evalPath, 'utf8');
    });

    it('should exist', function () {
      assert.ok(fs.existsSync(evalPath), 'Evaluation doc should exist');
    });

    it('should have executive summary', function () {
      assert.ok(content.includes('Executive Summary') || content.includes('Summary'),
        'Should have summary section');
    });

    it('should analyze current state', function () {
      assert.ok(content.includes('Current State') || content.includes('As-Is'),
        'Should analyze current state');
    });

    it('should define target architecture', function () {
      assert.ok(content.includes('Target') || content.includes('To-Be'),
        'Should define target architecture');
    });

    it('should include gap analysis', function () {
      assert.ok(content.includes('Gap'), 'Should have gap analysis');
    });

    it('should recommend pilot candidate', function () {
      assert.ok(content.includes('Pilot') || content.includes('pilot'),
        'Should recommend pilot');
    });
  });

  describe('Migration Plan Document', function () {
    const planPath = path.join(docsDir, 'AGENT_RUNTIME_MIGRATION_PLAN.md');
    let content;

    beforeAll(function () {
      content = fs.readFileSync(planPath, 'utf8');
    });

    it('should exist', function () {
      assert.ok(fs.existsSync(planPath), 'Migration plan should exist');
    });

    it('should define phases', function () {
      assert.ok(content.includes('Phase'), 'Should define phases');
    });

    it('should include pilot selection', function () {
      assert.ok(content.includes('Pilot'), 'Should include pilot selection');
    });

    it('should have risk analysis', function () {
      assert.ok(content.includes('Risk'), 'Should have risk analysis');
    });

    it('should define rollback plan', function () {
      assert.ok(content.includes('Rollback'), 'Should have rollback plan');
    });

    it('should include success metrics', function () {
      assert.ok(content.includes('Metric') || content.includes('Success'),
        'Should define success metrics');
    });

    it('should have timeline', function () {
      assert.ok(content.includes('Timeline') || content.includes('Week'),
        'Should have timeline');
    });
  });

  describe('Cross-Document Consistency', function () {
    let evaluation, plan, contract;

    beforeAll(function () {
      evaluation = fs.readFileSync(path.join(docsDir, 'AGENT_PROMPT_EVALUATION.md'), 'utf8');
      plan = fs.readFileSync(path.join(docsDir, 'AGENT_RUNTIME_MIGRATION_PLAN.md'), 'utf8');
      contract = fs.readFileSync(path.join(templatesDir, 'agent-runtime-contract.example.yaml'), 'utf8');
    });

    it('should reference same pilot candidate', function () {
      // All documents should mention validate-contract as pilot
      assert.ok(evaluation.includes('validate') || evaluation.includes('Validate'),
        'Evaluation should mention validation');
      assert.ok(plan.includes('validate-contract'),
        'Plan should reference validate-contract');
      assert.ok(contract.includes('validate'),
        'Contract example should be for validation');
    });

    it('should use consistent terminology', function () {
      // Check for four-layer model terminology
      const layers = ['contract', 'runtime', 'tool', 'llm'];
      layers.forEach(layer => {
        assert.ok(
          evaluation.toLowerCase().includes(layer) &&
          plan.toLowerCase().includes(layer),
          `Both docs should mention ${layer} layer`
        );
      });
    });

    it('should cross-reference each other', function () {
      assert.ok(evaluation.includes('AGENT_RUNTIME_MIGRATION_PLAN') ||
                evaluation.includes('migration plan'),
        'Evaluation should reference migration plan');
      assert.ok(plan.includes('AGENT_PROMPT_EVALUATION') ||
                plan.includes('evaluation'),
        'Plan should reference evaluation');
    });
  });
});
