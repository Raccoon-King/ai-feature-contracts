const fs = require('fs');
const { ensureDir } = require('./fs-utils.cjs');
const path = require('path');
const { resolveEnv } = require('./config.cjs');
const { parseWorkItemId, extractContractId } = require('./id-utils.cjs');

function getMetaPath(cwd = process.cwd()) {
  return path.join(cwd, '.grabby', 'jira-links.json');
}

function ensureMeta(cwd = process.cwd()) {
  const file = getMetaPath(cwd);
  const dir = path.dirname(file);
  ensureDir(dir);
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ links: {} }, null, 2));
  return file;
}

function loadMeta(cwd = process.cwd()) {
  ensureMeta(cwd);
  return JSON.parse(fs.readFileSync(getMetaPath(cwd), 'utf8'));
}

function saveMeta(meta, cwd = process.cwd()) {
  ensureMeta(cwd);
  fs.writeFileSync(getMetaPath(cwd), JSON.stringify(meta, null, 2));
}

function apiBase(jira) {
  const version = String(jira.apiVersion || '3');
  return `/rest/api/${version}`;
}

function getJiraAuth(jira) {
  const token = resolveEnv(jira.apiToken);
  const basic = Buffer.from(`${jira.email}:${token}`).toString('base64');
  return { token, basic };
}

async function jiraRequest(jira, endpoint, method = 'GET', body) {
  const { token, basic } = getJiraAuth(jira);
  if (!jira.host || !jira.email || !token) {
    throw new Error('Missing Jira credentials: set jira.host, jira.email, and jira.apiToken=${JIRA_API_TOKEN}');
  }

  const base = String(jira.host).replace(/\/$/, '');
  const res = await fetch(`${base}${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }

  if (!res.ok) {
    const msg = parsed.errorMessages?.join(', ') || parsed.raw || res.statusText;
    throw new Error(`Jira API ${res.status}: ${msg}`);
  }
  return parsed;
}

function resolveContractPath(contractsDir, name) {
  const direct = path.join(contractsDir, name);
  const withExt = path.join(contractsDir, `${name}.fc.md`);
  if (fs.existsSync(direct)) return direct;
  if (fs.existsSync(withExt)) return withExt;
  const targetId = parseWorkItemId(name);
  const files = fs.existsSync(contractsDir) ? fs.readdirSync(contractsDir).filter(f => f.endsWith('.fc.md')) : [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
    const contractId = (() => {
      try {
        return extractContractId(content, file);
      } catch {
        return null;
      }
    })();
    if ((targetId && contractId === targetId) || content.toLowerCase().includes(`# fc: ${String(name).toLowerCase()}`)) {
      return path.join(contractsDir, file);
    }
  }
  return null;
}

function parseContract(content, fileName) {
  const title = content.match(/^# FC:\s+(.+)$/m)?.[1] || fileName;
  const id = extractContractId(content, fileName);
  const status = content.match(/\*\*Status:\*\*\s*(\w+)/)?.[1] || 'draft';
  const objective = content.match(/## Objective\s*\n([\s\S]*?)(?:\n## |$)/)?.[1]?.trim() || '';
  const scope = content.match(/## Scope\s*\n([\s\S]*?)(?:\n## |$)/)?.[1]?.trim() || '';
  return { title, id, status, objective, scope };
}

function upsertIntegrationMetadata(filePath, issueKey) {
  let content = fs.readFileSync(filePath, 'utf8');
  const line = `- Jira: ${issueKey}`;
  if (/## Integrations\s*\n([\s\S]*?)(?:\n## |$)/m.test(content)) {
    if (!content.includes(line)) content = content.replace(/## Integrations\s*\n/, `## Integrations\n${line}\n`);
  } else {
    content += `\n## Integrations\n${line}\n`;
  }
  fs.writeFileSync(filePath, content);
}

function buildIssueFields(config, parsed) {
  const fields = {
    project: { key: config.jira.project },
    summary: parsed.title,
    description: `${parsed.objective || `Generated from ${parsed.id}`}\n\nScope:\n${parsed.scope || '- N/A'}`,
    issuetype: { name: config.jira.defaults?.issueType || 'Story' },
    labels: config.jira.defaults?.labels || ['grabby', 'feature-contract'],
  };

  const contractField = config.jira.customFields?.contractId;
  if (contractField) fields[contractField] = parsed.id;
  if (config.jira.defaults?.epicKey) fields.parent = { key: config.jira.defaults.epicKey };

  return fields;
}

async function testConnection(config) {
  if (!config?.jira?.enabled) throw new Error('Jira is not enabled in config');
  return jiraRequest(config.jira, `${apiBase(config.jira)}/myself`);
}

async function createIssueFromContract(config, contractsDir, contractRef, cwd = process.cwd()) {
  const contractPath = resolveContractPath(contractsDir, contractRef);
  if (!contractPath) throw new Error(`Contract not found: ${contractRef}`);

  const parsed = parseContract(fs.readFileSync(contractPath, 'utf8'), path.basename(contractPath));
  const issue = await jiraRequest(config.jira, `${apiBase(config.jira)}/issue`, 'POST', { fields: buildIssueFields(config, parsed) });

  const meta = loadMeta(cwd);
  meta.links[parsed.id] = { issueKey: issue.key, syncedAt: new Date().toISOString(), status: parsed.status };
  saveMeta(meta, cwd);
  upsertIntegrationMetadata(contractPath, issue.key);
  return { issueKey: issue.key, contractId: parsed.id, contractPath };
}

function listLinks(cwd = process.cwd()) {
  return loadMeta(cwd).links;
}

function linkIssue(contractId, issueKey, cwd = process.cwd()) {
  const meta = loadMeta(cwd);
  meta.links[contractId] = { issueKey, syncedAt: new Date().toISOString(), status: 'linked' };
  saveMeta(meta, cwd);
  return meta.links[contractId];
}

function unlinkIssue(contractId, cwd = process.cwd()) {
  const meta = loadMeta(cwd);
  delete meta.links[contractId];
  saveMeta(meta, cwd);
}

async function transitionIssueToStatus(config, issueKey, statusName) {
  const transitions = await jiraRequest(config.jira, `${apiBase(config.jira)}/issue/${issueKey}/transitions`);
  const transition = (transitions.transitions || []).find(t => t.name.toLowerCase() === String(statusName).toLowerCase());
  if (!transition) return { transitioned: false, reason: `No transition found for status: ${statusName}` };

  await jiraRequest(config.jira, `${apiBase(config.jira)}/issue/${issueKey}/transitions`, 'POST', {
    transition: { id: transition.id },
  });
  return { transitioned: true };
}

async function syncContract(config, contractsDir, contractRef, { dryRun = false } = {}, cwd = process.cwd()) {
  const contractPath = resolveContractPath(contractsDir, contractRef);
  if (!contractPath) throw new Error(`Contract not found: ${contractRef}`);

  const parsed = parseContract(fs.readFileSync(contractPath, 'utf8'), path.basename(contractPath));
  const meta = loadMeta(cwd);
  const link = meta.links[parsed.id];
  if (!link?.issueKey) throw new Error(`No Jira link found for ${parsed.id}`);

  const jiraStatus = config.jira?.sync?.statusMapping?.[parsed.status] || parsed.status;
  if (dryRun) return { contractId: parsed.id, issueKey: link.issueKey, jiraStatus, dryRun: true };

  await jiraRequest(config.jira, `${apiBase(config.jira)}/issue/${link.issueKey}`, 'PUT', { fields: buildIssueFields(config, parsed) });
  const transitionResult = await transitionIssueToStatus(config, link.issueKey, jiraStatus);

  link.status = jiraStatus;
  link.syncedAt = new Date().toISOString();
  saveMeta(meta, cwd);
  return { contractId: parsed.id, issueKey: link.issueKey, jiraStatus, transitioned: transitionResult.transitioned, transitionReason: transitionResult.reason };
}

function toContractContentFromIssue(issue) {
  const issueKey = issue.key;
  const title = issue.fields?.summary || issueKey;
  const description = issue.fields?.description;
  const objective = typeof description === 'string' ? description : 'Imported from Jira';
  return `# FC: ${title}\n**ID:** ${issueKey.replace(/[^A-Z0-9-]/g, '')} | **Status:** draft\n\n## Objective\n${String(objective).slice(0, 500)}\n\n## Scope\n- Imported from Jira issue ${issueKey}\n\n## Done When\n- Contract validated\n\n## Integrations\n- Jira: ${issueKey}\n`;
}

function contractExistsForIssue(contractsDir, issueKey) {
  if (!fs.existsSync(contractsDir)) return false;
  for (const file of fs.readdirSync(contractsDir).filter(f => f.endsWith('.fc.md'))) {
    const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
    if (content.includes(`- Jira: ${issueKey}`) || content.includes(`**ID:** ${issueKey}`)) return true;
  }
  return false;
}

async function importIssue(config, contractsDir, issueKey, options = {}) {
  const issue = await jiraRequest(config.jira, `${apiBase(config.jira)}/issue/${issueKey}`);
  ensureDir(contractsDir);

  if (options.idempotent !== false && contractExistsForIssue(contractsDir, issueKey)) {
    return { file: null, issueKey, skipped: true };
  }

  const title = issue.fields?.summary || issueKey;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = `${slug || issueKey.toLowerCase()}.fc.md`;
  fs.writeFileSync(path.join(contractsDir, file), toContractContentFromIssue(issue));
  return { file, issueKey, skipped: false };
}

async function importIssuesByJql(config, contractsDir, jql, options = {}) {
  const result = await jiraRequest(config.jira, `${apiBase(config.jira)}/search`, 'POST', {
    jql,
    maxResults: options.maxResults || 50,
    fields: ['summary', 'description'],
  });
  const out = [];
  for (const issue of result.issues || []) out.push(await importIssue(config, contractsDir, issue.key, options));
  return out;
}

module.exports = {
  testConnection,
  createIssueFromContract,
  listLinks,
  linkIssue,
  unlinkIssue,
  syncContract,
  transitionIssueToStatus,
  importIssue,
  importIssuesByJql,
  resolveContractPath,
  parseContract,
  upsertIntegrationMetadata,
  contractExistsForIssue,
};
