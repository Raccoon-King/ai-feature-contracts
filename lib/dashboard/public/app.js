'use strict';

const state = {
  contracts: [],
  history: [],
  selectedId: null,
  contract: null,
  workflow: null,
  commands: null,
  rulesets: null,
  selectedRule: null,
  ruleDetail: null,
  ruleDetailLoading: false,
  ruleDetailError: '',
  ruleContentExpanded: false,
  mode: { externalLlmOnly: false },
  search: '',
  activePage: 'dashboard',
  activeContractsView: 'editor',
  editorMode: 'structured',
  isContractsDrawerOpen: false,
  rawDraft: '',
  editorForm: {
    title: '',
    objective: '',
    scope: '',
    nonGoals: '',
    testing: '',
    doneWhen: [],
  },
};

const els = {};
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  contracts: 'Contracts',
  rules: 'Rules',
  cli: 'CLI',
  history: 'History',
};

const PAGE_PATHS = {
  dashboard: '/dashboard',
  contracts: '/contracts',
  rules: '/rules',
  cli: '/cli',
  history: '/history',
};

function $(id) {
  return document.getElementById(id);
}

function createRuleSelection(scope, value) {
  if (!scope || !value) return null;
  return { scope, value };
}

function getRuleSelectionKey(selection) {
  return selection ? `${selection.scope}:${selection.value}` : '';
}

function hasSelectedRule(rulesets, selection) {
  if (!selection || !rulesets) return false;

  if (selection.scope === 'local') {
    return (rulesets.local || []).some((rule) => rule.file === selection.value);
  }

  if (selection.scope === 'repo') {
    return (rulesets.repo || []).some((rule) => rule.ref === selection.value);
  }

  return false;
}

function getPageLabel(page) {
  return PAGE_TITLES[page] || 'Dashboard';
}

function resolvePageFromPath(pathname) {
  const normalizedPath = String(pathname || '/').replace(/\/+$/, '') || '/';
  const match = Object.entries(PAGE_PATHS)
    .find(([, routePath]) => routePath === normalizedPath);
  return match?.[0] || 'dashboard';
}

function navigateToPage(page, options = {}) {
  const nextPage = Object.prototype.hasOwnProperty.call(PAGE_PATHS, page) ? page : 'dashboard';
  const nextPath = PAGE_PATHS[nextPage] || PAGE_PATHS.dashboard;
  const currentPath = String(window.location.pathname || '/').replace(/\/+$/, '') || '/';

  state.activePage = nextPage;

  if (currentPath !== nextPath) {
    const historyMethod = options.replace ? 'replaceState' : 'pushState';
    window.history[historyMethod]({ page: nextPage }, '', nextPath);
  }

  renderPageNav();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function formatDate(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function truncateText(value, maxLength = 140) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function setLog(lines) {
  const output = Array.isArray(lines) && lines.length > 0 ? lines.join('\n') : 'No action output.';
  els.actionLog.textContent = output;
}

function badge(label, value, extra = {}) {
  const span = document.createElement('span');
  span.className = extra.className || 'meta-pill';
  if (extra.dataStatus) span.dataset.status = extra.dataStatus;
  if (extra.dataPhase) span.dataset.phase = extra.dataPhase;
  span.textContent = `${label}: ${value}`;
  return span;
}

function pill(value, className = 'meta-pill', data = {}) {
  const span = document.createElement('span');
  span.className = className;
  Object.entries(data).forEach(([key, itemValue]) => {
    span.dataset[key] = itemValue;
  });
  span.textContent = value;
  return span;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSectionFromContent(content, heading) {
  return String(content || '').match(new RegExp(`## ${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i'))?.[1]?.trim() || '';
}

function extractChecklistFromContent(content, heading) {
  return extractSectionFromContent(content, heading)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^- \[[ xX]\]/.test(line))
    .map((line) => ({
      text: line.replace(/^- \[[ xX]\]\s*/, ''),
      done: /^- \[[xX]\]/.test(line),
    }));
}

function replaceSectionInContent(content, heading, body) {
  const normalizedBody = String(body || '').trim();
  const nextSection = `## ${heading}\n${normalizedBody}`;
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*\\n[\\s\\S]*?(?=\\n## |$)`, 'im');

  if (pattern.test(content)) {
    return content.replace(pattern, nextSection);
  }

  const trimmed = String(content || '').trimEnd();
  return `${trimmed}\n\n${nextSection}\n`;
}

function replaceTitleInContent(content, title) {
  const nextTitle = String(title || '').trim() || 'Untitled Contract';
  if (/^#\s+.+$/m.test(content)) {
    return content.replace(/^#\s+.+$/m, `# FC: ${nextTitle}`);
  }
  return `# FC: ${nextTitle}\n\n${String(content || '').trimStart()}`;
}

function formatChecklist(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => `- [${item.done ? 'x' : ' '}] ${String(item.text || '').trim()}`)
    .join('\n')
    .trim();
}

function createEditorFormFromContent(content, fallback = {}) {
  return {
    title: String(content.match(/^#\s+(?:FC:\s*)?(.+)$/m)?.[1] || fallback.title || '').trim(),
    objective: extractSectionFromContent(content, 'Objective') || fallback.objective || '',
    scope: extractSectionFromContent(content, 'Scope') || fallback.scope || '',
    nonGoals: extractSectionFromContent(content, 'Non-Goals') || fallback.nonGoals || '',
    testing: extractSectionFromContent(content, 'Testing') || fallback.testing || '',
    doneWhen: extractChecklistFromContent(content, 'Done When').length > 0
      ? extractChecklistFromContent(content, 'Done When')
      : ((fallback.doneWhen || []).map((item) => ({ ...item }))),
  };
}

function syncEditorStateFromContract(contract) {
  const fallback = {
    title: contract?.title || '',
    objective: contract?.summary.objective || '',
    scope: contract?.summary.scope || '',
    nonGoals: contract?.summary.nonGoals || '',
    testing: contract?.summary.testing || '',
    doneWhen: (contract?.summary.doneWhen || []).map((item) => ({ ...item })),
  };

  state.rawDraft = contract?.content || '';
  state.editorForm = createEditorFormFromContent(state.rawDraft, fallback);
}

function buildDraftContent() {
  let content = state.rawDraft || state.contract?.content || '';
  content = replaceTitleInContent(content, state.editorForm.title);
  content = replaceSectionInContent(content, 'Objective', state.editorForm.objective);
  content = replaceSectionInContent(content, 'Scope', state.editorForm.scope);
  content = replaceSectionInContent(content, 'Non-Goals', state.editorForm.nonGoals);
  content = replaceSectionInContent(content, 'Testing', state.editorForm.testing);
  content = replaceSectionInContent(content, 'Done When', formatChecklist(state.editorForm.doneWhen));
  state.rawDraft = content;
  return content;
}

function renderStatusSummary() {
  const counts = state.contracts.reduce((acc, contract) => {
    const key = contract.status || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  els.statusSummary.innerHTML = '';
  if (state.contracts.length === 0) {
    els.statusSummary.appendChild(badge('Contracts', 0, { className: 'quiet-pill' }));
    els.statusSummary.appendChild(badge('History', state.history.length, { className: 'quiet-pill' }));
    return;
  }

  els.statusSummary.appendChild(badge('Contracts', state.contracts.length, { className: 'quiet-pill' }));
  els.statusSummary.appendChild(badge('History', state.history.length, { className: 'quiet-pill' }));
  Object.entries(counts)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .forEach(([status, count]) => {
      els.statusSummary.appendChild(badge(status, count, {
        className: 'status-pill',
        dataStatus: status,
      }));
    });
}

function renderContractList() {
  const query = state.search.trim().toLowerCase();
  const filtered = state.contracts.filter((contract) => {
    if (!query) return true;
    return contract.id.toLowerCase().includes(query) || contract.title.toLowerCase().includes(query);
  });

  els.contractCount.textContent = String(filtered.length);
  els.contractList.innerHTML = '';

  if (filtered.length === 0) {
    els.contractList.innerHTML = '<div class="empty-state">No contracts match the current filter.</div>';
    return;
  }

  filtered.forEach((contract) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `contract-card${contract.id === state.selectedId ? ' is-selected' : ''}`;
    button.dataset.contractId = contract.id;

    const title = document.createElement('h4');
    title.textContent = contract.title;
    const meta = document.createElement('p');
    meta.textContent = `${contract.id} - ${contract.phase.label}`;

    const footer = document.createElement('footer');
    footer.appendChild(badge(contract.status, `${contract.phase.progressPercent}%`, {
      className: 'status-pill',
      dataStatus: contract.status,
    }));
    footer.appendChild(badge('Updated', formatDate(contract.lastModifiedAt), { className: 'quiet-pill' }));

    button.appendChild(title);
    button.appendChild(meta);
    button.appendChild(footer);
    button.addEventListener('click', () => loadContract(contract.id));
    els.contractList.appendChild(button);
  });
}

function renderHero() {
  const contract = state.contract;
  const hasContract = Boolean(contract);

  els.heroTitle.textContent = hasContract ? contract.title : 'Choose a contract';
  els.heroSubtitle.textContent = hasContract
    ? `${contract.id} - ${contract.type} - Last updated ${formatDate(contract.lastModifiedAt)}`
    : 'The dashboard will load the contract body, artifacts, workflow position, and available actions.';

  els.heroMeta.innerHTML = '';
  els.editorBadges.innerHTML = '';

  if (!hasContract) {
    els.phasePill.textContent = 'Not loaded';
    els.phasePill.dataset.phase = '';
    els.statusSelect.value = 'draft';
    els.statusSelect.disabled = true;
    els.saveButton.disabled = true;
    els.modeNote.textContent = '';
    return;
  }

  els.heroMeta.appendChild(badge('Status', contract.status, {
    className: 'status-pill',
    dataStatus: contract.status,
  }));
  els.heroMeta.appendChild(badge('Phase', contract.phase.label, {
    className: 'phase-pill',
    dataPhase: contract.phase.id,
  }));
  els.heroMeta.appendChild(badge('Branch', contract.branch || '-', { className: 'meta-pill' }));

  els.editorBadges.appendChild(badge('Plan', contract.artifacts.planStatus || 'none', {
    className: 'status-pill',
    dataStatus: contract.artifacts.planStatus || 'draft',
  }));
  els.editorBadges.appendChild(badge('Audit', contract.artifacts.auditStatus || 'none', {
    className: 'status-pill',
    dataStatus: contract.artifacts.auditStatus || 'draft',
  }));

  els.phasePill.textContent = `${contract.phase.label} - ${contract.phase.progressPercent}%`;
  els.phasePill.dataset.phase = contract.phase.id;
  els.statusSelect.value = contract.status;
  els.statusSelect.disabled = false;
  els.saveButton.disabled = false;
  els.modeNote.textContent = contract.mode.externalLlmOnly
    ? 'This repo runs with workflow.externalLlmOnly=true, so execute/audit remain external workflow steps.'
    : 'All lifecycle actions are available locally from the dashboard.';
}

function renderStructuredEditor() {
  const hasContract = Boolean(state.contract);
  const disabledAttr = hasContract ? '' : 'disabled';
  const checklistRows = state.editorForm.doneWhen.length > 0
    ? state.editorForm.doneWhen.map((item, index) => `
      <div class="structured-checklist-row">
        <label class="structured-check-toggle">
          <input type="checkbox" data-done-when-toggle="${index}" ${item.done ? 'checked' : ''} ${disabledAttr}>
          <span>Done</span>
        </label>
        <input type="text" data-done-when-text="${index}" value="${escapeHtml(item.text)}" placeholder="Checklist item" ${disabledAttr}>
        <button type="button" class="ghost-button compact-button" data-done-when-remove="${index}" ${disabledAttr}>Remove</button>
      </div>
    `).join('')
    : '<div class="empty-state compact-empty">No checklist items yet.</div>';

  els.structuredEditor.innerHTML = `
    <div class="structured-grid">
      <label class="structured-field structured-field-title">
        <span class="field-label">Title</span>
        <input type="text" data-editor-field="title" value="${escapeHtml(state.editorForm.title)}" placeholder="Contract title" ${disabledAttr}>
      </label>
      <label class="structured-field">
        <span class="field-label">Objective</span>
        <textarea data-editor-field="objective" placeholder="Describe the contract objective." ${disabledAttr}>${escapeHtml(state.editorForm.objective)}</textarea>
      </label>
      <label class="structured-field">
        <span class="field-label">Scope</span>
        <textarea data-editor-field="scope" placeholder="List the contract scope." ${disabledAttr}>${escapeHtml(state.editorForm.scope)}</textarea>
      </label>
      <label class="structured-field">
        <span class="field-label">Non-Goals</span>
        <textarea data-editor-field="nonGoals" placeholder="Capture what is intentionally out of scope." ${disabledAttr}>${escapeHtml(state.editorForm.nonGoals)}</textarea>
      </label>
      <label class="structured-field">
        <span class="field-label">Testing</span>
        <textarea data-editor-field="testing" placeholder="Document the planned testing." ${disabledAttr}>${escapeHtml(state.editorForm.testing)}</textarea>
      </label>
      <section class="structured-field structured-checklist">
        <div class="section-heading">
          <span>Done When</span>
          <button type="button" class="ghost-button compact-button" id="add-done-when-button" ${disabledAttr}>Add Item</button>
        </div>
        <div class="structured-checklist-list">
          ${checklistRows}
        </div>
      </section>
    </div>
  `;
}

function renderEditorMode() {
  const hasContract = Boolean(state.contract);
  els.editorModeSwitch.querySelectorAll('[data-editor-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.editorMode === state.editorMode);
    button.disabled = !hasContract;
  });

  els.structuredEditor.classList.toggle('is-hidden', state.editorMode !== 'structured');
  els.contractEditor.classList.toggle('is-hidden', state.editorMode !== 'raw');
}

function renderEditor() {
  if (!state.contract) {
    state.rawDraft = '';
    state.editorForm = {
      title: '',
      objective: '',
      scope: '',
      nonGoals: '',
      testing: '',
      doneWhen: [],
    };
  }

  renderStructuredEditor();
  els.contractEditor.value = state.rawDraft || state.contract?.content || '';
  els.contractEditor.disabled = !state.contract;
  renderEditorMode();
}

function renderValidation() {
  const contract = state.contract;
  els.validationSummary.innerHTML = '';

  if (!contract) {
    els.validationSummary.innerHTML = '<div class="empty-state">Validation details appear after a contract is selected.</div>';
    return;
  }

  const validity = document.createElement('div');
  validity.className = `validation-badge ${contract.validation.valid ? 'ok' : 'error'}`;
  validity.textContent = contract.validation.valid
    ? `Valid contract. ${contract.validation.warnings.length} warnings.`
    : `${contract.validation.errors.length} validation errors detected.`;
  els.validationSummary.appendChild(validity);

  if (contract.validation.errors.length > 0) {
    const errors = document.createElement('div');
    errors.className = 'validation-badge error';
    errors.innerHTML = contract.validation.errors.map((item) => `<div>${item}</div>`).join('');
    els.validationSummary.appendChild(errors);
  }

  if (contract.validation.warnings.length > 0) {
    const warnings = document.createElement('div');
    warnings.className = 'validation-badge';
    warnings.innerHTML = contract.validation.warnings.map((item) => `<div>${item}</div>`).join('');
    els.validationSummary.appendChild(warnings);
  }
}

function renderActions() {
  els.actionButtons.innerHTML = '';
  if (!state.contract) return;

  state.contract.availableActions.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.enabled ? 'action-button' : 'ghost-button';
    button.disabled = !action.enabled;
    button.textContent = action.label;
    button.title = action.note;
    button.addEventListener('click', () => runAction(action.id));
    els.actionButtons.appendChild(button);
  });
}

function renderWorkflow() {
  const contract = state.contract;
  const workflow = state.workflow;

  els.phaseTrack.innerHTML = '';
  if (!workflow || !contract) {
    els.phaseTrack.innerHTML = '<div class="empty-state">Workflow state will appear after a contract is selected.</div>';
    els.workflowDiagram.innerHTML = '<div class="empty-state">Workflow diagram will render here.</div>';
    return;
  }

  workflow.phases.forEach((phase, index) => {
    const card = document.createElement('div');
    const currentIndex = workflow.phases.findIndex((item) => item.id === contract.phase.id);
    const statusClass = index < currentIndex ? ' is-complete' : (index === currentIndex ? ' is-current' : '');
    card.className = `phase-step${statusClass}`;
    card.innerHTML = `<strong>${phase.name}</strong><div>${phase.description}</div>`;
    els.phaseTrack.appendChild(card);
  });

  renderMermaid(contract.phase.id);
}

async function renderMermaid(currentPhase) {
  if (!window.mermaid || !state.workflow) {
    els.workflowDiagram.innerHTML = '<div class="empty-state">Mermaid failed to load.</div>';
    return;
  }

  const graph = [
    'flowchart LR',
    ...state.workflow.phases.map((phase) => `  ${phase.id}["${phase.name}"]`),
    ...state.workflow.transitions.map((edge) => `  ${edge.from} --> ${edge.to}`),
    '  classDef current fill:#ff7a45,stroke:#ffd4a8,color:#101923,stroke-width:3px;',
    '  classDef passive fill:#152230,stroke:#38506a,color:#f8f1e3;',
    `  class ${currentPhase} current;`,
    ...state.workflow.phases.filter((phase) => phase.id !== currentPhase).map((phase) => `  class ${phase.id} passive;`),
  ].join('\n');

  try {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
    const rendered = await window.mermaid.render(`workflow-${Date.now()}`, graph);
    els.workflowDiagram.innerHTML = rendered.svg;
  } catch (error) {
    els.workflowDiagram.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderTimeline() {
  els.timeline.innerHTML = '';
  if (!state.contract || state.contract.timeline.length === 0) {
    els.timeline.innerHTML = '<div class="empty-state">No lifecycle events recorded yet.</div>';
    return;
  }

  state.contract.timeline.forEach((event) => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `<time>${formatDate(event.timestamp)}</time><strong>${event.label}</strong><div>${event.detail}</div>`;
    els.timeline.appendChild(item);
  });
}

function renderArtifacts() {
  els.artifactList.innerHTML = '';
  if (!state.contract) {
    els.artifactList.innerHTML = '<div class="empty-state">Artifacts appear after a contract is selected.</div>';
    return;
  }

  [
    ['Contract', state.contract.artifacts.contractPath || '-'],
    ['Plan', state.contract.artifacts.planPath || '-'],
    ['Audit', state.contract.artifacts.auditPath || '-'],
  ].forEach(([label, value]) => {
    const chip = document.createElement('div');
    chip.className = 'artifact-chip';
    chip.innerHTML = `<strong>${label}</strong><code>${value}</code>`;
    els.artifactList.appendChild(chip);
  });
}

function renderSummary() {
  const contract = state.contract;

  els.summaryObjective.textContent = contract?.summary.objective || 'No objective loaded.';
  els.summaryScope.textContent = contract?.summary.scope || 'No scope section.';
  els.summaryTesting.textContent = contract?.summary.testing || 'No testing section.';
  els.planContent.textContent = contract?.planText || 'No plan artifact.';
  els.auditContent.textContent = contract?.auditText || 'No audit artifact.';

  els.doneWhenList.innerHTML = '';
  if (!contract || contract.summary.doneWhen.length === 0) {
    els.doneWhenList.innerHTML = '<div class="empty-state">No done-when checklist found.</div>';
    return;
  }

  contract.summary.doneWhen.forEach((item) => {
    const row = document.createElement('div');
    row.className = `checklist-item${item.done ? ' done' : ''}`;
    row.innerHTML = '<span class="marker"></span>';
    const text = document.createElement('span');
    text.textContent = item.text;
    row.appendChild(text);
    els.doneWhenList.appendChild(row);
  });
}

function renderCommands() {
  if (!state.commands) {
    els.commandsPanel.innerHTML = '<div class="empty-state">Loading command catalog...</div>';
    return;
  }

  els.commandsPanel.innerHTML = '';
  Object.values(state.commands).forEach((category) => {
    const card = document.createElement('section');
    card.className = 'command-card';
    card.innerHTML = `<h4>${category.name}</h4><p class="lede">${category.description}</p>`;

    category.commands.forEach((command) => {
      const item = document.createElement('div');
      item.className = 'command-item';
      item.innerHTML = `<code>${command.name}</code><div>${command.description}</div><div class="lede">${command.usage}</div>`;
      card.appendChild(item);
    });

    els.commandsPanel.appendChild(card);
  });
}

function renderRulesets() {
  const rulesets = state.rulesets;
  if (state.selectedRule && !hasSelectedRule(rulesets, state.selectedRule)) {
    state.selectedRule = null;
    state.ruleDetail = null;
    state.ruleDetailLoading = false;
    state.ruleDetailError = '';
  }

  // Render sync status pill in header
  if (els.rulesetsSyncStatus) {
    if (!rulesets) {
      els.rulesetsSyncStatus.className = 'sync-status-pill';
      els.rulesetsSyncStatus.textContent = '';
    } else if (rulesets.sync) {
      const staleClass = rulesets.sync.stale ? 'stale' : 'fresh';
      const staleLabel = rulesets.sync.stale ? 'Stale' : 'Current';
      els.rulesetsSyncStatus.className = `sync-status-pill ${staleClass}`;
      els.rulesetsSyncStatus.textContent = `${staleLabel} (${rulesets.sync.ageHours}h ago)`;
    } else if (rulesets.configured) {
      els.rulesetsSyncStatus.className = 'sync-status-pill not-synced';
      els.rulesetsSyncStatus.textContent = 'Not synced';
    } else {
      els.rulesetsSyncStatus.className = 'sync-status-pill';
      els.rulesetsSyncStatus.textContent = '';
    }
  }

  if (els.localRulesetsCount) {
    els.localRulesetsCount.textContent = rulesets?.local?.length || '0';
  }

  if (els.repoRulesetsCount) {
    els.repoRulesetsCount.textContent = rulesets?.repo?.length || '0';
  }

  // Render sync info panel
  if (els.syncInfoPanel) {
    els.syncInfoPanel.innerHTML = '';
    if (!rulesets) {
      els.syncInfoPanel.innerHTML = '<div class="empty-state">Loading sync info...</div>';
    } else if (rulesets.sync) {
      const syncInfo = document.createElement('div');
      syncInfo.className = 'sync-info';

      const items = [
        ['Last Sync', formatDate(rulesets.sync.lastSync)],
        ['Mode', rulesets.sync.mode],
      ];
      if (rulesets.sync.source?.repo) {
        items.push(['Source', rulesets.sync.source.repo]);
      }
      if (rulesets.sync.source?.branch) {
        items.push(['Branch', rulesets.sync.source.branch]);
      }
      if (rulesets.sync.source?.version) {
        items.push(['Version', rulesets.sync.source.version]);
      }

      items.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'sync-info-row';
        row.innerHTML = `<span class="sync-info-label">${escapeHtml(label)}</span><span class="sync-info-value">${escapeHtml(value)}</span>`;
        syncInfo.appendChild(row);
      });

      els.syncInfoPanel.appendChild(syncInfo);
    } else {
      els.syncInfoPanel.innerHTML = '<div class="empty-state compact-empty">No sync data available.</div>';
    }
  }

  if (els.localRulesetsPanel) {
    els.localRulesetsPanel.innerHTML = '';
    if (!rulesets) {
      els.localRulesetsPanel.innerHTML = '<div class="empty-state">Loading local rules...</div>';
    } else if ((rulesets.local || []).length === 0) {
      els.localRulesetsPanel.innerHTML = '<div class="empty-state compact-empty">No local rules discovered.</div>';
    } else {
      rulesets.local.forEach((ruleset) => {
        const selected = getRuleSelectionKey(state.selectedRule) === getRuleSelectionKey(createRuleSelection('local', ruleset.file));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ruleset-card ruleset-selection${selected ? ' is-selected' : ''}`;
        button.dataset.ruleScope = 'local';
        button.dataset.ruleValue = ruleset.file;

        const name = document.createElement('div');
        name.className = 'ruleset-name';
        name.textContent = ruleset.name || 'unnamed';

        const subtitle = document.createElement('div');
        subtitle.className = 'ruleset-subtitle';
        subtitle.textContent = ruleset.file;

        const meta = document.createElement('div');
        meta.className = 'ruleset-meta';
        meta.appendChild(pill(ruleset.type, 'ruleset-type-pill', { type: ruleset.type }));
        if (Array.isArray(ruleset.extends) && ruleset.extends.length > 0) {
          meta.appendChild(pill(`extends ${ruleset.extends.length}`, 'quiet-pill'));
        }

        button.appendChild(name);
        button.appendChild(subtitle);
        button.appendChild(meta);
        els.localRulesetsPanel.appendChild(button);
      });
    }
  }

  if (els.repoRulesetsPanel) {
    els.repoRulesetsPanel.innerHTML = '';
    if (!rulesets) {
      els.repoRulesetsPanel.innerHTML = '<div class="empty-state">Loading repo rules...</div>';
    } else if ((rulesets.repo || []).length === 0) {
      const message = rulesets.configured
        ? 'No repo rules synced yet. Run: grabby rules sync'
        : 'Rulesets not configured.';
      els.repoRulesetsPanel.innerHTML = `<div class="empty-state compact-empty">${escapeHtml(message)}</div>`;
    } else {
      rulesets.repo.forEach((ruleset) => {
        const selected = getRuleSelectionKey(state.selectedRule) === getRuleSelectionKey(createRuleSelection('repo', ruleset.ref));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ruleset-card ruleset-selection${ruleset.active ? ' active-ruleset' : ''}${selected ? ' is-selected' : ''}`;
        button.dataset.ruleScope = 'repo';
        button.dataset.ruleValue = ruleset.ref;

        const name = document.createElement('div');
        name.className = 'ruleset-name';
        name.textContent = ruleset.ref;

        const subtitle = document.createElement('div');
        subtitle.className = 'ruleset-subtitle';
        subtitle.textContent = ruleset.description || ruleset.name || 'Central repository rule';

        const meta = document.createElement('div');
        meta.className = 'ruleset-meta';
        meta.appendChild(pill('repo', 'ruleset-type-pill', { type: 'repo' }));
        if (ruleset.version) {
          meta.appendChild(pill(`v${ruleset.version}`));
        }
        if (ruleset.active) {
          meta.appendChild(pill('active', 'quiet-pill'));
        }
        if (ruleset.fetchedAt) {
          meta.appendChild(pill(`Fetched ${formatDate(ruleset.fetchedAt)}`, 'quiet-pill'));
        }

        button.appendChild(name);
        button.appendChild(subtitle);
        button.appendChild(meta);
        els.repoRulesetsPanel.appendChild(button);
      });
    }
  }

  if (els.rulesetReaderPanel) {
    els.rulesetReaderPanel.innerHTML = '';

    if (state.ruleDetailLoading) {
      els.rulesetReaderPanel.innerHTML = '<div class="empty-state">Loading rule content...</div>';
      return;
    }

    if (state.ruleDetailError) {
      els.rulesetReaderPanel.innerHTML = `<div class="empty-state">${escapeHtml(state.ruleDetailError)}</div>`;
      return;
    }

    if (!state.ruleDetail) {
      els.rulesetReaderPanel.innerHTML = '<div class="empty-state">Select a local or repo rule to read it here.</div>';
      return;
    }

    const rule = state.ruleDetail;
    const header = document.createElement('div');
    header.className = 'ruleset-reader-header';

    const title = document.createElement('h4');
    title.textContent = rule.scope === 'repo' ? rule.ref : (rule.name || 'unnamed');

    const source = document.createElement('p');
    source.className = 'ruleset-reader-source';
    source.textContent = rule.file || rule.ref || '';

    const meta = document.createElement('div');
    meta.className = 'ruleset-meta';
    meta.appendChild(pill(rule.scope, 'ruleset-type-pill', { type: rule.scope }));
    if (rule.type) {
      meta.appendChild(pill(rule.type, 'ruleset-type-pill', { type: rule.type }));
    }
    if (rule.version) {
      meta.appendChild(pill(`v${rule.version}`));
    }
    if (rule.active) {
      meta.appendChild(pill('active', 'quiet-pill'));
    }
    if (rule.fetchedAt) {
      meta.appendChild(pill(`Fetched ${formatDate(rule.fetchedAt)}`, 'quiet-pill'));
    }

    header.appendChild(title);
    header.appendChild(source);
    header.appendChild(meta);

    const info = document.createElement('div');
    info.className = 'ruleset-reader-info';
    if (rule.description) {
      info.innerHTML += `<div class="ruleset-reader-row"><span>Description</span><span>${escapeHtml(rule.description)}</span></div>`;
    }
    if (Array.isArray(rule.extends) && rule.extends.length > 0) {
      info.innerHTML += `<div class="ruleset-reader-row"><span>Extends</span><span>${escapeHtml(rule.extends.join(', '))}</span></div>`;
    }
    if (Array.isArray(rule.tags) && rule.tags.length > 0) {
      info.innerHTML += `<div class="ruleset-reader-row"><span>Tags</span><span>${escapeHtml(rule.tags.join(', '))}</span></div>`;
    }

    const ruleContent = rule.content || '';
    const lineCount = ruleContent.split('\n').length;
    const isLongContent = lineCount > 15;

    const content = document.createElement('pre');
    content.className = 'code-block ruleset-reader-content';
    content.textContent = ruleContent || 'No rule content available.';

    if (isLongContent) {
      content.classList.add(state.ruleContentExpanded ? 'is-expanded' : 'is-collapsed');
    }

    els.rulesetReaderPanel.appendChild(header);
    if (info.innerHTML) {
      els.rulesetReaderPanel.appendChild(info);
    }
    els.rulesetReaderPanel.appendChild(content);

    if (isLongContent) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'expand-toggle';
      toggle.id = 'rule-content-expand-toggle';
      toggle.innerHTML = state.ruleContentExpanded
        ? 'Collapse'
        : `Expand <span class="line-count">${lineCount} lines</span>`;
      els.rulesetReaderPanel.appendChild(toggle);
    }
  }
}

function renderDashboardOverview() {
  // Render dashboard status summary
  if (els.dashboardStatusSummary) {
    const counts = state.contracts.reduce((acc, contract) => {
      const key = contract.status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    els.dashboardStatusSummary.innerHTML = '';
    els.dashboardStatusSummary.appendChild(badge('Contracts', state.contracts.length, { className: 'quiet-pill' }));
    els.dashboardStatusSummary.appendChild(badge('History', state.history.length, { className: 'quiet-pill' }));
    Object.entries(counts)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .forEach(([status, count]) => {
        els.dashboardStatusSummary.appendChild(badge(status, count, {
          className: 'status-pill',
          dataStatus: status,
        }));
      });
  }

  // Render dashboard contract count
  if (els.dashboardContractCount) {
    els.dashboardContractCount.textContent = String(state.contracts.length);
  }

  // Render dashboard contract list
  if (els.dashboardContractList) {
    els.dashboardContractList.innerHTML = '';
    if (state.contracts.length === 0) {
      els.dashboardContractList.innerHTML = '<div class="empty-state">No active contracts.</div>';
    } else {
      state.contracts.forEach((contract) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `contract-card${contract.id === state.selectedId ? ' is-selected' : ''}`;
        card.dataset.contractId = contract.id;

        const title = document.createElement('h4');
        title.textContent = contract.title;
        const meta = document.createElement('p');
        meta.textContent = `${contract.id} - ${contract.phase.label}`;

        const footer = document.createElement('footer');
        footer.appendChild(badge(contract.status, `${contract.phase.progressPercent}%`, {
          className: 'status-pill',
          dataStatus: contract.status,
        }));
        footer.appendChild(badge('Updated', formatDate(contract.lastModifiedAt), { className: 'quiet-pill' }));

        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(footer);
        card.addEventListener('click', () => {
          navigateToPage('contracts');
          loadContract(contract.id);
        });
        els.dashboardContractList.appendChild(card);
      });
    }
  }

  // Render dashboard phase track and workflow diagram
  if (els.dashboardPhaseTrack) {
    els.dashboardPhaseTrack.innerHTML = '';
    if (!state.workflow || !state.contract) {
      els.dashboardPhaseTrack.innerHTML = '<div class="empty-state compact-empty">Select a contract to view phases.</div>';
    } else {
      state.workflow.phases.forEach((phase, index) => {
        const card = document.createElement('div');
        const currentIndex = state.workflow.phases.findIndex((item) => item.id === state.contract.phase.id);
        const statusClass = index < currentIndex ? ' is-complete' : (index === currentIndex ? ' is-current' : '');
        card.className = `phase-step${statusClass}`;
        card.innerHTML = `<strong>${phase.name}</strong><div>${phase.description}</div>`;
        els.dashboardPhaseTrack.appendChild(card);
      });
    }
  }

  if (els.dashboardWorkflowDiagram) {
    if (!state.workflow || !state.contract) {
      els.dashboardWorkflowDiagram.innerHTML = '<div class="empty-state">Select a contract to view workflow</div>';
    } else {
      renderDashboardMermaid(state.contract.phase.id);
    }
  }
}

async function renderDashboardMermaid(currentPhase) {
  if (!window.mermaid || !state.workflow || !els.dashboardWorkflowDiagram) {
    return;
  }

  const graph = [
    'flowchart LR',
    ...state.workflow.phases.map((phase) => `  ${phase.id}["${phase.name}"]`),
    ...state.workflow.transitions.map((edge) => `  ${edge.from} --> ${edge.to}`),
    '  classDef current fill:#ff7a45,stroke:#ffd4a8,color:#101923,stroke-width:3px;',
    '  classDef passive fill:#152230,stroke:#38506a,color:#f8f1e3;',
    `  class ${currentPhase} current;`,
    ...state.workflow.phases.filter((phase) => phase.id !== currentPhase).map((phase) => `  class ${phase.id} passive;`),
  ].join('\n');

  try {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
    const rendered = await window.mermaid.render(`dashboard-workflow-${Date.now()}`, graph);
    els.dashboardWorkflowDiagram.innerHTML = rendered.svg;
  } catch (error) {
    els.dashboardWorkflowDiagram.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderHistory() {
  const query = state.activePage === 'contracts'
    ? state.search.trim().toLowerCase()
    : '';
  const filtered = state.history.filter((entry) => {
    if (!query) return true;
    return String(entry.id || '').toLowerCase().includes(query)
      || String(entry.title || '').toLowerCase().includes(query)
      || String(entry.objective || '').toLowerCase().includes(query);
  });

  els.historyCount.textContent = String(filtered.length);
  els.historyList.innerHTML = '';

  if (filtered.length === 0) {
    els.historyList.innerHTML = '<div class="empty-state">No archived contracts match the current filter.</div>';
    return;
  }

  filtered.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'history-card';

    const title = document.createElement('h4');
    title.textContent = truncateText(entry.title || entry.id, 72);

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.innerHTML = `<p class="lede">${entry.id} - ${entry.type || 'FEATURE_CONTRACT'}</p><p class="long-copy">${truncateText(entry.objective || 'No archived objective captured for this contract.', 180)}</p>`;

    const footer = document.createElement('footer');
    footer.appendChild(badge('Closed', formatDate(entry.closedAt), {
      className: 'status-pill',
      dataStatus: entry.status || 'archived',
    }));

    if (entry.archivePath) {
      footer.appendChild(badge('Archive', entry.archivePath, { className: 'meta-pill' }));
    }
    if (Array.isArray(entry.files) && entry.files.length > 0) {
      footer.appendChild(badge('Files', entry.files.length, { className: 'quiet-pill' }));
    }

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(footer);
    els.historyList.appendChild(card);
  });
}

function renderPageNav() {
  const activePage = Object.prototype.hasOwnProperty.call(PAGE_TITLES, state.activePage)
    ? state.activePage
    : 'dashboard';

  state.activePage = activePage;
  if (activePage !== 'contracts') {
    state.isContractsDrawerOpen = false;
  }
  els.shell.dataset.activePage = activePage;
  els.board.dataset.activePage = activePage;
  els.board.dataset.activeTab = activePage;
  document.body.dataset.activePage = activePage;
  document.body.dataset.activeTab = activePage;
  document.title = `Grabby - ${getPageLabel(activePage)}`;

  els.pageNav.querySelectorAll('[data-page]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.page === activePage);
  });

  els.pagePanels.forEach((panel) => {
    panel.classList.toggle('is-hidden', panel.dataset.pagePanel !== activePage);
  });

  renderContractsDrawer();
  renderHistory();
}

function renderContractsDrawer() {
  const isContractsPage = state.activePage === 'contracts';
  const isOpen = isContractsPage && state.isContractsDrawerOpen;

  els.shell.dataset.contractsDrawerOpen = isOpen ? 'true' : 'false';
  els.contractsDrawer.classList.toggle('is-open', isOpen);
  els.contractsDrawer.setAttribute('aria-hidden', String(!isOpen));
  els.contractsDrawerBackdrop.classList.toggle('is-visible', isOpen);
  els.contractsDrawerBackdrop.setAttribute('aria-hidden', String(!isOpen));
  els.contractsDrawerToggle.classList.toggle('is-active', isOpen);
  els.contractsDrawerToggle.setAttribute('aria-expanded', String(isOpen));
}

function renderContractsWorkspace() {
  const validViews = ['editor', 'summary', 'lifecycle'];
  const activeView = validViews.includes(state.activeContractsView) ? state.activeContractsView : 'editor';
  state.activeContractsView = activeView;

  els.contractWorkspaceNav.querySelectorAll('[data-contracts-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.contractsView === activeView);
  });

  els.contractsPanels.forEach((panel) => {
    panel.classList.toggle('is-hidden', panel.dataset.contractsPanel !== activeView);
  });
}

function renderAll() {
  renderStatusSummary();
  renderContractList();
  renderHero();
  renderPageNav();
  renderContractsWorkspace();
  renderEditor();
  renderValidation();
  renderActions();
  renderWorkflow();
  renderTimeline();
  renderArtifacts();
  renderSummary();
  renderCommands();
  renderRulesets();
  renderDashboardOverview();
}

async function loadBootstrap() {
  const payload = await fetchJson('/api/bootstrap');
  state.contracts = payload.contracts || [];
  state.history = payload.history || [];
  state.workflow = payload.workflow || null;
  state.commands = payload.commands || null;
  state.rulesets = payload.rulesets || null;
  state.mode = payload.status?.mode || { externalLlmOnly: false };

  if (state.selectedId && !state.contracts.some((contract) => contract.id === state.selectedId)) {
    state.selectedId = null;
  }
  if (!state.selectedId && state.contracts.length > 0) {
    state.selectedId = state.contracts[0].id;
  }

  if (state.selectedId) {
    await loadContract(state.selectedId);
  } else {
    state.contract = null;
    renderAll();
  }
}

async function loadContract(id) {
  state.selectedId = id;
  const payload = await fetchJson(`/api/contracts/${encodeURIComponent(id)}`);
  state.contract = payload.contract;
  if (state.activePage === 'contracts') {
    state.isContractsDrawerOpen = false;
  }
  syncEditorStateFromContract(state.contract);
  renderAll();
}

async function loadRuleDetail(scope, value) {
  const selection = createRuleSelection(scope, value);
  if (!selection) return;
  const selectionKey = getRuleSelectionKey(selection);

  state.selectedRule = selection;
  state.ruleDetail = null;
  state.ruleDetailError = '';
  state.ruleDetailLoading = true;
  state.ruleContentExpanded = false;
  renderRulesets();

  const params = new URLSearchParams({ scope });
  if (scope === 'local') {
    params.set('file', value);
  } else {
    params.set('ref', value);
  }

  try {
    const payload = await fetchJson(`/api/rulesets/read?${params.toString()}`);
    if (getRuleSelectionKey(state.selectedRule) !== selectionKey) {
      return;
    }
    state.ruleDetail = payload.rule || null;
  } catch (error) {
    if (getRuleSelectionKey(state.selectedRule) !== selectionKey) {
      return;
    }
    state.ruleDetailError = error.message;
  } finally {
    if (getRuleSelectionKey(state.selectedRule) !== selectionKey) {
      return;
    }
    state.ruleDetailLoading = false;
    renderRulesets();
  }
}

async function saveContract() {
  if (!state.contract) return;
  if (state.editorMode === 'raw') {
    state.rawDraft = els.contractEditor.value;
    state.editorForm = createEditorFormFromContent(state.rawDraft, state.editorForm);
  }

  const content = state.editorMode === 'structured'
    ? buildDraftContent()
    : state.rawDraft;

  const previousStatus = state.contract.status;
  const nextStatus = els.statusSelect.value;

  const payload = await fetchJson(`/api/contracts/${encodeURIComponent(state.contract.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      content,
      status: nextStatus,
    }),
  });

  state.contract = payload.contract;
  syncEditorStateFromContract(state.contract);
  const match = state.contracts.find((item) => item.id === payload.contract.id);
  if (match) {
    match.status = payload.contract.status;
    match.phase = payload.contract.phase;
    match.lastModifiedAt = payload.contract.lastModifiedAt;
    match.artifacts = payload.contract.artifacts;
    match.title = payload.contract.title;
  }

  const logs = ['Contract saved.'];

  // Auto-trigger garbage collection when status changes to complete
  const isNowComplete = nextStatus === 'complete' || nextStatus === 'completed';
  const wasNotComplete = previousStatus !== 'complete' && previousStatus !== 'completed';
  if (isNowComplete && wasNotComplete) {
    try {
      const gcPayload = await fetchJson(`/api/contracts/${encodeURIComponent(state.contract.id)}/actions/gc`, {
        method: 'POST',
      });
      logs.push(`Auto-archived to history: ${gcPayload.archivePath || 'done'}`);
      // Remove from active contracts list and reload
      state.contracts = state.contracts.filter((item) => item.id !== payload.contract.id);
      state.contract = null;
      state.selectedId = state.contracts.length > 0 ? state.contracts[0].id : null;
      // Refresh to get updated history
      const bootstrap = await fetchJson('/api/bootstrap');
      state.history = bootstrap.history || [];
      if (state.selectedId) {
        await loadContract(state.selectedId);
        setLog(logs);
        return;
      }
    } catch (gcError) {
      logs.push(`Auto-archive failed: ${gcError.message}`);
    }
  }

  setLog(logs);
  renderAll();
}

async function runAction(action) {
  if (!state.contract) return;

  try {
    const payload = await fetchJson(`/api/contracts/${encodeURIComponent(state.contract.id)}/actions/${encodeURIComponent(action)}`, {
      method: 'POST',
    });

    // Handle gc action - contract is archived and removed
    if (action === 'gc' && payload.archived) {
      const archivedId = state.contract.id;
      state.contracts = state.contracts.filter((item) => item.id !== archivedId);
      state.contract = null;
      state.selectedId = state.contracts.length > 0 ? state.contracts[0].id : null;
      // Refresh history
      const bootstrap = await fetchJson('/api/bootstrap');
      state.history = bootstrap.history || [];
      setLog(payload.logs);
      if (state.selectedId) {
        await loadContract(state.selectedId);
      } else {
        renderAll();
      }
      return;
    }

    state.contract = payload.contract;
    syncEditorStateFromContract(state.contract);
    const match = state.contracts.find((item) => item.id === payload.contract.id);
    if (match) {
      match.title = payload.contract.title;
      match.status = payload.contract.status;
      match.phase = payload.contract.phase;
      match.lastModifiedAt = payload.contract.lastModifiedAt;
      match.artifacts = payload.contract.artifacts;
    }

    setLog(payload.logs);
    renderAll();
  } catch (error) {
    setLog([error.message]);
  }
}

function handleStructuredFieldUpdate(field, value) {
  state.editorForm[field] = value;
  buildDraftContent();

  if (field === 'title' && state.contract) {
    state.contract.title = value;
    renderHero();
  }
}

function bindEvents() {
  els.contractSearch.addEventListener('input', (event) => {
    state.search = event.target.value || '';
    renderContractList();
    renderHistory();
  });

  els.refreshButton.addEventListener('click', async () => {
    setLog(['Refreshing dashboard data...']);
    await loadBootstrap();
  });

  if (els.refreshDashboardButton) {
    els.refreshDashboardButton.addEventListener('click', async () => {
      await loadBootstrap();
    });
  }

  const handleRulesetSelection = (event) => {
    const button = event.target.closest('[data-rule-scope][data-rule-value]');
    if (!button) return;
    loadRuleDetail(button.dataset.ruleScope, button.dataset.ruleValue);
  };

  if (els.localRulesetsPanel) {
    els.localRulesetsPanel.addEventListener('click', handleRulesetSelection);
  }

  if (els.repoRulesetsPanel) {
    els.repoRulesetsPanel.addEventListener('click', handleRulesetSelection);
  }

  // Expand/collapse toggle for rule content
  if (els.rulesetReaderPanel) {
    els.rulesetReaderPanel.addEventListener('click', (event) => {
      if (event.target.closest('#rule-content-expand-toggle')) {
        state.ruleContentExpanded = !state.ruleContentExpanded;
        renderRulesets();
      }
    });
  }

  els.pageNav.addEventListener('click', (event) => {
    const link = event.target.closest('[data-page]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    navigateToPage(link.dataset.page);
  });

  els.contractsDrawerToggle.addEventListener('click', () => {
    if (state.activePage !== 'contracts') return;
    state.isContractsDrawerOpen = !state.isContractsDrawerOpen;
    renderContractsDrawer();
  });

  els.contractsDrawerClose.addEventListener('click', () => {
    state.isContractsDrawerOpen = false;
    renderContractsDrawer();
  });

  els.contractsDrawerBackdrop.addEventListener('click', () => {
    state.isContractsDrawerOpen = false;
    renderContractsDrawer();
  });

  els.contractWorkspaceNav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-contracts-view]');
    if (!button) return;

    const view = button.dataset.contractsView;
    state.activeContractsView = ['editor', 'summary', 'lifecycle'].includes(view) ? view : 'editor';
    renderContractsWorkspace();
  });

  window.addEventListener('popstate', () => {
    state.activePage = resolvePageFromPath(window.location.pathname);
    renderPageNav();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !state.isContractsDrawerOpen) return;
    state.isContractsDrawerOpen = false;
    renderContractsDrawer();
  });

  els.editorModeSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('[data-editor-mode]');
    if (!button || !state.contract) return;

    if (button.dataset.editorMode === 'structured') {
      state.rawDraft = els.contractEditor.value;
      state.editorForm = createEditorFormFromContent(state.rawDraft, state.editorForm);
      state.editorMode = 'structured';
    } else {
      buildDraftContent();
      state.editorMode = 'raw';
    }

    renderEditor();
  });

  els.contractEditor.addEventListener('input', (event) => {
    state.rawDraft = event.target.value || '';
  });

  els.structuredEditor.addEventListener('input', (event) => {
    if (!state.contract) return;

    const field = event.target.dataset.editorField;
    if (field) {
      handleStructuredFieldUpdate(field, event.target.value || '');
      return;
    }

    const itemIndex = event.target.dataset.doneWhenText;
    if (itemIndex !== undefined && state.editorForm.doneWhen[itemIndex]) {
      state.editorForm.doneWhen[itemIndex].text = event.target.value || '';
      buildDraftContent();
    }
  });

  els.structuredEditor.addEventListener('change', (event) => {
    if (!state.contract) return;

    const itemIndex = event.target.dataset.doneWhenToggle;
    if (itemIndex !== undefined && state.editorForm.doneWhen[itemIndex]) {
      state.editorForm.doneWhen[itemIndex].done = event.target.checked;
      buildDraftContent();
    }
  });

  els.structuredEditor.addEventListener('click', (event) => {
    if (!state.contract) return;

    if (event.target.id === 'add-done-when-button') {
      state.editorForm.doneWhen.push({ text: '', done: false });
      buildDraftContent();
      renderStructuredEditor();
      return;
    }

    const removeIndex = event.target.dataset.doneWhenRemove;
    if (removeIndex !== undefined) {
      state.editorForm.doneWhen.splice(Number(removeIndex), 1);
      buildDraftContent();
      renderStructuredEditor();
    }
  });

  els.saveButton.addEventListener('click', saveContract);

  els.statusSelect.addEventListener('change', () => {
    if (!state.contract) return;
    state.contract.status = els.statusSelect.value;
    renderHero();
  });

  els.clearLogButton.addEventListener('click', () => {
    setLog([]);
  });
}

async function init() {
  state.activePage = resolvePageFromPath(window.location.pathname);

  Object.assign(els, {
    contractSearch: $('contract-search'),
    refreshButton: $('refresh-button'),
    refreshDashboardButton: $('refresh-dashboard-button'),
    statusSummary: $('status-summary'),
    contractCount: $('contract-count'),
    contractList: $('contract-list'),
    heroTitle: $('hero-title'),
    heroSubtitle: $('hero-subtitle'),
    heroMeta: $('hero-meta'),
    statusSelect: $('status-select'),
    saveButton: $('save-button'),
    modeNote: $('mode-note'),
    editorBadges: $('editor-badges'),
    editorModeSwitch: $('editor-mode-switch'),
    structuredEditor: $('structured-editor'),
    contractEditor: $('contract-editor'),
    actionButtons: $('action-buttons'),
    actionLog: $('action-log'),
    clearLogButton: $('clear-log-button'),
    validationSummary: $('validation-summary'),
    phasePill: $('phase-pill'),
    phaseTrack: $('phase-track'),
    workflowDiagram: $('workflow-diagram'),
    timeline: $('timeline'),
    artifactList: $('artifact-list'),
    summaryObjective: $('summary-objective'),
    summaryScope: $('summary-scope'),
    summaryTesting: $('summary-testing'),
    doneWhenList: $('done-when-list'),
    planContent: $('plan-content'),
    auditContent: $('audit-content'),
    commandsPanel: $('commands-panel'),
    historyCount: $('history-count'),
    historyList: $('history-list'),
    // Rules tab panels
    localRulesetsCount: $('local-rulesets-count'),
    repoRulesetsCount: $('repo-rulesets-count'),
    rulesetsSyncStatus: $('rulesets-sync-status'),
    localRulesetsPanel: $('local-rulesets-panel'),
    repoRulesetsPanel: $('repo-rulesets-panel'),
    rulesetReaderPanel: $('ruleset-reader-panel'),
    syncInfoPanel: $('sync-info-panel'),
    // Dashboard overview panels
    dashboardStatusSummary: $('dashboard-status-summary'),
    dashboardContractCount: $('dashboard-contract-count'),
    dashboardContractList: $('dashboard-contract-list'),
    dashboardPhaseTrack: $('dashboard-phase-track'),
    dashboardWorkflowDiagram: $('dashboard-workflow-diagram'),
    // Navigation and layout
    pageNav: $('page-nav'),
    contractWorkspaceNav: $('contract-workspace-nav'),
    contractsDrawer: $('contracts-drawer'),
    contractsDrawerBackdrop: $('contracts-drawer-backdrop'),
    contractsDrawerToggle: $('contracts-drawer-toggle'),
    contractsDrawerClose: $('contracts-drawer-close'),
    shell: document.querySelector('.shell'),
    board: document.querySelector('.board'),
  });
  els.pagePanels = Array.from(document.querySelectorAll('[data-page-panel]'));
  els.contractsPanels = Array.from(document.querySelectorAll('[data-contracts-panel]'));

  navigateToPage(state.activePage, { replace: true });

  bindEvents();
  setLog([]);

  try {
    await loadBootstrap();
  } catch (error) {
    setLog([error.message]);
    els.contractList.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

window.addEventListener('DOMContentLoaded', init);
