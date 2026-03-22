const { loadConfig, loadRulesetsConfig } = require('../config.cjs');
const {
  addRulesetSnapshotToContract,
  performSyncCheck,
  updateContractDriftCheck,
} = require('./contract-integration.cjs');

function getRulesetsConfig(cwd) {
  const repoConfig = loadConfig(cwd) || {};
  return loadRulesetsConfig(cwd, repoConfig) || repoConfig.rulesets || null;
}

async function runSyncCheck(commandName, context = {}) {
  const cwd = context.cwd || process.cwd();
  const logger = context.logger || console;
  const contractPath = context.contractPath || null;
  const checkResult = await performSyncCheck(commandName, { logger }, cwd);

  if (contractPath && checkResult && !checkResult.skipped) {
    try {
      await updateContractDriftCheck(contractPath, checkResult, commandName, cwd);
    } catch (error) {
      logger.log?.(`Warning: Failed to update contract metadata: ${error.message}`);
    }
  }

  if (checkResult.blocked) {
    const rulesetsConfig = getRulesetsConfig(cwd) || {};
    if (rulesetsConfig.sync?.blocking === true) {
      return {
        cancel: true,
        reason: 'Ruleset sync check blocked execution',
      };
    }

    logger.log?.('Warning: Ruleset drift detected, but blocking is disabled. Continuing.');
  }

  return {
    cancel: false,
    result: checkResult,
  };
}

module.exports = {
  id: 'rulesets',
  name: 'Rulesets',
  version: '1.0.0',
  hooks: {
    onContractCreate: async (context = {}) => {
      if (!context.contractPath) {
        return { cancel: false };
      }
      await addRulesetSnapshotToContract(context.contractPath, context.cwd || process.cwd());
      return { cancel: false };
    },
    onValidate: async (context = {}) => runSyncCheck('validate', context),
    onPlan: async (context = {}) => runSyncCheck('plan', context),
    onExecute: async (context = {}) => runSyncCheck('execute', context),
  },
};
