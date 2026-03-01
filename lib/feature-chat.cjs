/**
 * Feature Chat - Conversational interface for feature management
 * Enables natural language discussions about features
 */

const readline = require('readline');
const features = require('./features.cjs');

const STATUSES = ['proposed', 'approved', 'in-progress', 'completed', 'deprecated'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

/**
 * Create readline interface
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt user for input
 */
function prompt(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

/**
 * Display feature in a readable format
 */
function displayFeature(feature, verbose = false) {
  const statusColors = {
    'proposed': '\x1b[33m',
    'approved': '\x1b[36m',
    'in-progress': '\x1b[34m',
    'completed': '\x1b[32m',
    'deprecated': '\x1b[90m'
  };
  const reset = '\x1b[0m';
  const color = statusColors[feature.status] || '';

  console.log(`\n${color}━━━ ${feature.id}: ${feature.name} ━━━${reset}`);
  console.log(`Status: ${color}${feature.status}${reset}`);

  if (feature.description) {
    console.log(`\nDescription:\n  ${feature.description}`);
  }

  if (feature.tags?.length > 0) {
    console.log(`Tags: ${feature.tags.join(', ')}`);
  }

  if (feature.contracts?.length > 0) {
    console.log(`Linked Contracts: ${feature.contracts.join(', ')}`);
  }

  if (verbose) {
    console.log(`Created: ${feature.created}`);
    console.log(`Updated: ${feature.updated}`);

    if (feature.enhancements?.length > 0) {
      console.log(`\nEnhancements:`);
      for (const e of feature.enhancements) {
        console.log(`  ${e.id}: ${e.description} [${e.status}]`);
      }
    }

    if (feature.notes) {
      console.log(`\nNotes:\n  ${feature.notes}`);
    }
  }
}

/**
 * Interactive feature creation
 */
async function interactiveAddFeature(baseDir = process.cwd()) {
  const rl = createInterface();

  console.log('\n\x1b[36m━━━ Add New Feature ━━━\x1b[0m\n');

  try {
    const name = await prompt(rl, 'Feature name: ');
    if (!name) {
      console.log('Feature name is required.');
      rl.close();
      return null;
    }

    const description = await prompt(rl, 'Description: ');
    const tagsStr = await prompt(rl, 'Tags (comma-separated): ');
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    console.log(`\nStatuses: ${STATUSES.join(', ')}`);
    const status = await prompt(rl, 'Status [proposed]: ') || 'proposed';

    const contractsStr = await prompt(rl, 'Link to contracts (comma-separated IDs): ');
    const contracts = contractsStr ? contractsStr.split(',').map(c => c.trim()).filter(Boolean) : [];

    const notes = await prompt(rl, 'Additional notes: ');

    rl.close();

    const feature = features.addFeature({
      name,
      description,
      status: STATUSES.includes(status) ? status : 'proposed',
      tags,
      contracts,
      notes
    }, baseDir);

    console.log(`\n\x1b[32m✓ Feature ${feature.id} created successfully!\x1b[0m`);
    displayFeature(feature);

    return feature;
  } catch (err) {
    rl.close();
    throw err;
  }
}

/**
 * Interactive enhancement discussion
 */
async function interactiveEnhance(featureId, baseDir = process.cwd()) {
  const feature = features.getFeature(featureId, baseDir);

  if (!feature) {
    console.log(`\x1b[31mFeature ${featureId} not found.\x1b[0m`);
    return null;
  }

  const rl = createInterface();

  console.log(`\n\x1b[36m━━━ Enhance Feature: ${feature.name} ━━━\x1b[0m`);
  displayFeature(feature, true);

  console.log('\n\x1b[33mLet\'s discuss improvements for this feature.\x1b[0m\n');

  try {
    const description = await prompt(rl, 'What enhancement would you like to propose?\n> ');
    if (!description) {
      console.log('Enhancement description is required.');
      rl.close();
      return null;
    }

    console.log(`\nPriorities: ${PRIORITIES.join(', ')}`);
    const priority = await prompt(rl, 'Priority [medium]: ') || 'medium';

    const rationale = await prompt(rl, 'Why is this enhancement needed?\n> ');

    const contractId = await prompt(rl, 'Create a contract for this? (y/n) [n]: ');

    rl.close();

    const enhancement = features.addEnhancement(featureId, {
      description: `${description}${rationale ? `\n\nRationale: ${rationale}` : ''}`,
      priority: PRIORITIES.includes(priority) ? priority : 'medium',
      status: 'proposed'
    }, baseDir);

    console.log(`\n\x1b[32m✓ Enhancement ${enhancement.id} added to ${featureId}!\x1b[0m`);

    if (contractId === 'y' || contractId === 'Y') {
      console.log(`\n\x1b[33mRun: grabby task "${feature.name} - ${description.slice(0, 50)}"${reset}\x1b[0m`);
    }

    return enhancement;
  } catch (err) {
    rl.close();
    throw err;
  }
}

/**
 * Interactive feature chat session
 */
async function startChatSession(baseDir = process.cwd()) {
  const rl = createInterface();

  console.log('\n\x1b[36m━━━ Feature Chat ━━━\x1b[0m');
  console.log('Discuss your application features. Type "help" for commands.\n');

  const help = () => {
    console.log(`
Commands:
  list              List all features
  list <status>     List features by status
  show <id>         Show feature details
  add               Add a new feature
  enhance <id>      Propose enhancement
  search <term>     Search features
  stats             Show feature statistics
  discover          Discover features from contracts
  import            Import discovered features
  tags              Show all tags
  status <id> <s>   Update feature status
  help              Show this help
  exit              Exit chat
    `);
  };

  const processCommand = async (input) => {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'list': {
        const status = args[0];
        const list = features.listFeatures(baseDir, status ? { status } : {});
        if (list.length === 0) {
          console.log('No features found.');
        } else {
          console.log(`\nFeatures${status ? ` (${status})` : ''}:`);
          for (const f of list) {
            console.log(`  ${f.id}: ${f.name} [${f.status}]`);
          }
        }
        break;
      }

      case 'show': {
        const id = args[0];
        if (!id) {
          console.log('Usage: show <feature-id>');
          break;
        }
        const feature = features.getFeature(id.toUpperCase(), baseDir);
        if (feature) {
          displayFeature(feature, true);
        } else {
          console.log(`Feature ${id} not found.`);
        }
        break;
      }

      case 'add': {
        rl.close();
        await interactiveAddFeature(baseDir);
        return false; // Signal to restart
      }

      case 'enhance': {
        const id = args[0];
        if (!id) {
          console.log('Usage: enhance <feature-id>');
          break;
        }
        rl.close();
        await interactiveEnhance(id.toUpperCase(), baseDir);
        return false;
      }

      case 'search': {
        const term = args.join(' ');
        if (!term) {
          console.log('Usage: search <term>');
          break;
        }
        const results = features.searchFeatures(term, baseDir);
        if (results.length === 0) {
          console.log(`No features matching "${term}".`);
        } else {
          console.log(`\nSearch results for "${term}":`);
          for (const f of results) {
            console.log(`  ${f.id}: ${f.name} [${f.status}]`);
          }
        }
        break;
      }

      case 'stats': {
        const stats = features.getFeatureStats(baseDir);
        console.log('\nFeature Statistics:');
        console.log(`  Total features: ${stats.total}`);
        console.log(`  With enhancements: ${stats.withEnhancements}`);
        console.log(`  Total enhancements: ${stats.totalEnhancements}`);
        console.log(`  Linked to contracts: ${stats.linkedToContracts}`);
        console.log('\n  By Status:');
        for (const [status, count] of Object.entries(stats.byStatus)) {
          console.log(`    ${status}: ${count}`);
        }
        break;
      }

      case 'discover': {
        const discovered = features.discoverFeatures(baseDir);
        if (discovered.length === 0) {
          console.log('No features discovered from contracts.');
        } else {
          console.log(`\nDiscovered ${discovered.length} features:`);
          for (const f of discovered) {
            console.log(`  - ${f.name} (from ${f.source})`);
          }
          console.log('\nRun "import" to add these features.');
        }
        break;
      }

      case 'import': {
        const imported = features.importDiscoveredFeatures(baseDir);
        if (imported.length === 0) {
          console.log('No new features to import.');
        } else {
          console.log(`\nImported ${imported.length} features:`);
          for (const f of imported) {
            console.log(`  ${f.id}: ${f.name}`);
          }
        }
        break;
      }

      case 'tags': {
        const tags = features.getAllTags(baseDir);
        if (tags.length === 0) {
          console.log('No tags defined.');
        } else {
          console.log(`\nTags: ${tags.join(', ')}`);
        }
        break;
      }

      case 'status': {
        const [id, newStatus] = args;
        if (!id || !newStatus) {
          console.log('Usage: status <feature-id> <new-status>');
          console.log(`Statuses: ${STATUSES.join(', ')}`);
          break;
        }
        if (!STATUSES.includes(newStatus)) {
          console.log(`Invalid status. Use: ${STATUSES.join(', ')}`);
          break;
        }
        try {
          const updated = features.updateFeature(id.toUpperCase(), { status: newStatus }, baseDir);
          console.log(`\x1b[32m✓ ${updated.id} status updated to ${newStatus}\x1b[0m`);
        } catch (err) {
          console.log(`\x1b[31m${err.message}\x1b[0m`);
        }
        break;
      }

      case 'help':
        help();
        break;

      case 'exit':
      case 'quit':
      case 'q':
        console.log('Goodbye!');
        rl.close();
        return true; // Signal to exit

      case '':
        break;

      default:
        console.log(`Unknown command: ${cmd}. Type "help" for commands.`);
    }

    return null; // Continue chat
  };

  help();

  const chatLoop = async () => {
    while (true) {
      const input = await prompt(rl, '\n\x1b[36mfeatures>\x1b[0m ');
      const result = await processCommand(input);

      if (result === true) {
        break; // Exit
      } else if (result === false) {
        // Restart the chat session
        return startChatSession(baseDir);
      }
    }
  };

  try {
    await chatLoop();
  } catch (err) {
    if (err.code !== 'ERR_USE_AFTER_CLOSE') {
      throw err;
    }
  }
}

/**
 * Display features summary
 */
function displayFeaturesSummary(baseDir = process.cwd()) {
  const list = features.listFeatures(baseDir);
  const stats = features.getFeatureStats(baseDir);

  console.log('\n\x1b[1m\x1b[36mApplication Features\x1b[0m');
  console.log('─'.repeat(50));

  if (list.length === 0) {
    console.log('\nNo features tracked yet.');
    console.log('Run: grabby feature add "Feature Name"');
    console.log('  or: grabby feature discover');
  } else {
    // Group by status
    const grouped = {};
    for (const f of list) {
      if (!grouped[f.status]) grouped[f.status] = [];
      grouped[f.status].push(f);
    }

    for (const status of STATUSES) {
      if (grouped[status]?.length > 0) {
        console.log(`\n\x1b[33m${status.toUpperCase()}\x1b[0m`);
        for (const f of grouped[status]) {
          const enhCount = f.enhancements?.length || 0;
          const enhStr = enhCount > 0 ? ` (+${enhCount} enhancements)` : '';
          console.log(`  ${f.id}: ${f.name}${enhStr}`);
        }
      }
    }

    console.log('\n' + '─'.repeat(50));
    console.log(`Total: ${stats.total} features, ${stats.totalEnhancements} enhancements`);
  }

  console.log('\nCommands: feature add | feature chat | feature describe <id>');
}

module.exports = {
  interactiveAddFeature,
  interactiveEnhance,
  startChatSession,
  displayFeature,
  displayFeaturesSummary,
  STATUSES,
  PRIORITIES
};
