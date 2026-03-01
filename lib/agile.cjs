const path = require('path');

function extractContractTitle(content, fileName) {
  const titleMatch = content.match(/^# FC:\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : fileName.replace(/\.fc\.md$/, '');
}

function extractScopeItems(content) {
  const scopeSection = content.match(/## Scope[\s\S]*?(?=##|$)/)?.[0] || '';
  return (scopeSection.match(/^- (.+)$/gm) || []).map((line) => line.replace(/^- /, '').trim());
}

function extractFiles(content) {
  const filesSection = content.match(/## Files[\s\S]*?(?=##|$)/)?.[0] || '';
  const rows = filesSection.split('\n').filter((row) =>
    row.startsWith('|') && !row.includes('Action') && !row.includes('---')
  );

  return rows.map((row) => {
    const cols = row.split('|').map((cell) => cell.trim()).filter(Boolean);
    return {
      action: cols[0],
      path: (cols[1] || '').replace(/`/g, ''),
      reason: cols[2] || 'Implementation',
    };
  });
}

function toId(prefix, index) {
  return `${prefix}-${index}`;
}

function inferSubtasks(scopeItem, files, config) {
  const relevantFiles = files.filter((entry) =>
    scopeItem.toLowerCase().split(/\s+/).some((term) => term.length > 3 && entry.path.toLowerCase().includes(term))
  );

  const selectedFiles = relevantFiles.length > 0 ? relevantFiles : files.slice(0, 2);
  const subtasks = selectedFiles.map((entry, index) => ({
    id: toId(config.agile.naming.subtaskPrefix, index + 1),
    title: `${entry.action} ${entry.path}`,
    type: entry.path.includes('test') ? 'test' : 'implementation',
    file: entry.path,
    reason: entry.reason,
  }));

  subtasks.push({
    id: toId(config.agile.naming.subtaskPrefix, subtasks.length + 1),
    title: 'Run lint, build, and relevant tests',
    type: 'validation',
    file: null,
    reason: 'Close the task with verification',
  });

  return subtasks.slice(0, config.agile.maxSubtasksPerTask);
}

function generateBacklog({ content, fileName, config }) {
  const title = extractContractTitle(content, fileName);
  const scopeItems = extractScopeItems(content);
  const files = extractFiles(content);
  const epicId = toId(config.agile.naming.epicPrefix, 1);

  const tasks = scopeItems.slice(0, config.agile.maxTasksPerEpic).map((scopeItem, index) => ({
    id: toId(config.agile.naming.taskPrefix, index + 1),
    title: scopeItem,
    splitBy: config.agile.splitBy[0] || 'scope',
    subtasks: inferSubtasks(scopeItem, files, config),
  }));

  if (tasks.length === 0) {
    tasks.push({
      id: toId(config.agile.naming.taskPrefix, 1),
      title: 'Implement contract scope',
      splitBy: 'scope',
      subtasks: inferSubtasks('implement contract scope', files, config),
    });
  }

  return {
    version: 1,
    contract: fileName,
    agile: config.agile,
    epics: [
      {
        id: epicId,
        title,
        goal: `Deliver ${title} within contract boundaries`,
        tasks,
      },
    ],
  };
}

function getBacklogPath(contractsDir, fileName) {
  return path.join(contractsDir, fileName.replace(/\.fc\.md$/, '.backlog.yaml'));
}

module.exports = {
  extractContractTitle,
  extractScopeItems,
  extractFiles,
  generateBacklog,
  getBacklogPath,
};
