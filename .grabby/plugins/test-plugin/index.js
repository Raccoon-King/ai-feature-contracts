/**
 * test-plugin plugin
 */

module.exports = {
  hooks: {
    // beforeValidate: (context) => { ... },
    // afterValidate: (context) => { ... },
  },

  runCommand: async (args, context) => {
    console.log('Running test-plugin command with args:', args);
    return { success: true };
  },
};
