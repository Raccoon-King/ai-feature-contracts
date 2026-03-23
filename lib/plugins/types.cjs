const HOOK_TYPES = Object.freeze([
  'onInit',
  'onCommand',
  'onContractCreate',
  'onValidate',
  'onPlan',
  'onExecute',
  'onAudit',
]);

function normalizePluginDefinition(plugin) {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('Plugin definition must be an object');
  }

  const id = String(plugin.id || plugin.name || '').trim();
  if (!id) {
    throw new Error('Plugin must define an id or name');
  }

  return {
    id,
    name: String(plugin.name || id).trim(),
    version: String(plugin.version || '0.0.0').trim(),
    hooks: plugin.hooks && typeof plugin.hooks === 'object' ? plugin.hooks : {},
    meta: plugin.meta && typeof plugin.meta === 'object' ? plugin.meta : {},
  };
}

module.exports = {
  HOOK_TYPES,
  normalizePluginDefinition,
};
