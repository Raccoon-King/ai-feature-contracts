module.exports = {
  sync: require('./sync.cjs'),
  cli: require('./cli.cjs'),
  contractIntegration: require('./contract-integration.cjs'),
  authoring: require('./authoring.cjs'),
  builder: require('./builder.cjs'),
  registry: require('./registry.cjs'),
  plugin: require('./plugin.cjs'),
  common: {
    manifestParser: require('./common/manifest-parser.cjs'),
    syncLock: require('./common/sync-lock.cjs'),
  },
};
