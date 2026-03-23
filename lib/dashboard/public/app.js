'use strict';

const state = {
  contracts: [],
  history: [],
  selectedId: null,
  selectedHistoryId: null,
  contract: null,
  historyDetail: null,
  historyDetailLoading: false,
  historyDetailError: '',
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
  expandedFields: {},
  rawDraft: '',
  editorForm: {
    title: '',
    targetedRelease: '',
    garbageCollect: false,
    splitStory: false,
    objective: '',
    scope: '',
    nonGoals: '',
    testing: '',
    doneWhen: [],
  },
  // Rules editor state
  drafts: [],
  rulesEditorMode: 'edit',
  rulesEditorContent: '',
  rulesEditorOriginal: '',
  rulesEditorSource: null,
  rulesEditorModified: false,
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
const LIVE_REFRESH_INTERVAL_MS = 10000;
let liveRefreshTimer = null;
let liveRefreshInFlight = false;

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

function isRulesEditorReadOnly() {
  return state.rulesEditorSource?.type === 'repo';
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

function extractMetadataLineFromContent(content, label) {
  return String(content || '').match(new RegExp(`^\\*\\*${escapeRegExp(label)}:\\*\\*\\s*([^\\n\\r]+)$`, 'im'))?.[1]?.trim() || '';
}

function normalizeTargetedRelease(value) {
  const normalized = String(value || '').trim();
  if (!normalized || ['-', 'none', 'n/a', 'unset'].includes(normalized.toLowerCase())) {
    return '';
  }
  return normalized;
}

function parseGarbageCollectValue(value) {
  return /^(yes|true|1|on|enabled)$/i.test(String(value || '').trim());
}

function parseSplitStoryValue(value) {
  return /^(yes|true|1|on|enabled)$/i.test(String(value || '').trim());
}

function shouldSuggestSplit(contract) {
  return (contract?.validation?.warnings || []).some((warning) => /large scope|many files/i.test(String(warning || '')));
}

function isFieldExpanded(key) {
  return state.expandedFields[key] === true;
}

function getExpandToggleLabel(key) {
  return isFieldExpanded(key) ? 'Collapse' : 'Expand';
}

function toggleExpandedField(key) {
  if (!key) return;
  state.expandedFields[key] = !isFieldExpanded(key);
}

function replaceMetadataLine(content, label, value, anchorLabels = []) {
  const nextLine = `**${label}:** ${value}`;
  const pattern = new RegExp(`^\\*\\*${escapeRegExp(label)}:\\*\\*[^\\n\\r]*$`, 'im');

  if (pattern.test(content)) {
    return content.replace(pattern, nextLine);
  }

  for (const anchorLabel of anchorLabels) {
    const anchorPattern = new RegExp(`^(\\*\\*${escapeRegExp(anchorLabel)}:\\*\\*[^\\n\\r]*)$`, 'im');
    if (anchorPattern.test(content)) {
      return content.replace(anchorPattern, `$1\n${nextLine}`);
    }
  }

  return `${nextLine}\n${String(content || '').trimStart()}`;
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
    targetedRelease: normalizeTargetedRelease(extractMetadataLineFromContent(content, 'Targeted Release') || fallback.targetedRelease || ''),
    garbageCollect: extractMetadataLineFromContent(content, 'Garbage Collect')
      ? parseGarbageCollectValue(extractMetadataLineFromContent(content, 'Garbage Collect'))
      : Boolean(fallback.garbageCollect),
    splitStory: extractMetadataLineFromContent(content, 'Split Story')
      ? parseSplitStoryValue(extractMetadataLineFromContent(content, 'Split Story'))
      : Boolean(fallback.splitStory),
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
    targetedRelease: contract?.metadata?.targetedRelease || '',
    garbageCollect: contract?.metadata?.garbageCollect === true,
    splitStory: contract?.metadata?.splitStory === true,
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
  content = replaceMetadataLine(content, 'Targeted Release', state.editorForm.targetedRelease.trim() || '-', ['ID', 'Status']);
  content = replaceMetadataLine(content, 'Garbage Collect', state.editorForm.garbageCollect ? 'yes' : 'no', ['Targeted Release', 'ID', 'Status']);
  content = replaceMetadataLine(content, 'Split Story', state.editorForm.splitStory ? 'yes' : 'no', ['Garbage Collect', 'Targeted Release', 'ID', 'Status']);
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

  filtered.forEach((contract, index) => {
    const card = document.createElement('div');
    card.className = `contract-card${contract.id === state.selectedId ? ' is-selected' : ''}`;
    card.dataset.contractId = contract.id;

    const cardContent = document.createElement('button');
    cardContent.type = 'button';
    cardContent.className = 'contract-card-content';

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

    cardContent.appendChild(title);
    cardContent.appendChild(meta);
    cardContent.appendChild(footer);
    cardContent.addEventListener('click', () => {
      loadContract(contract.id).catch((error) => setLog([error.message]));
    });

    // Reorder controls
    const reorderControls = document.createElement('div');
    reorderControls.className = 'reorder-controls';

    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'reorder-btn';
    moveUp.innerHTML = '&#9650;';
    moveUp.title = 'Move up';
    moveUp.disabled = index === 0;
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation();
      moveContract(contract.id, -1);
    });

    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'reorder-btn';
    moveDown.innerHTML = '&#9660;';
    moveDown.title = 'Move down';
    moveDown.disabled = index === filtered.length - 1;
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation();
      moveContract(contract.id, 1);
    });

    reorderControls.appendChild(moveUp);
    reorderControls.appendChild(moveDown);

    card.appendChild(cardContent);
    card.appendChild(reorderControls);
    els.contractList.appendChild(card);
  });
}

async function moveContract(contractId, direction) {
  const index = state.contracts.findIndex((c) => c.id === contractId);
  if (index === -1) return;

  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.contracts.length) return;

  // Build new run order values
  const updates = state.contracts.map((contract, i) => {
    let targetIndex = i;
    if (i === index) {
      targetIndex = newIndex;
    } else if (direction < 0 && i === newIndex) {
      targetIndex = index;
    } else if (direction > 0 && i === newIndex) {
      targetIndex = index;
    }
    return { id: contract.id, runOrder: targetIndex };
  });

  try {
    const payload = await fetchJson('/api/contracts/reorder', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    });

    if (payload.contracts) {
      state.contracts = payload.contracts;
    }
    renderContractList();
    renderDashboardOverview();
  } catch (error) {
    setLog([`Reorder failed: ${error.message}`]);
  }
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
  els.heroMeta.appendChild(badge('Target Release', contract.metadata?.targetedRelease || '-', { className: 'meta-pill' }));

  els.editorBadges.appendChild(badge('Plan', contract.artifacts.planStatus || 'none', {
    className: 'status-pill',
    dataStatus: contract.artifacts.planStatus || 'draft',
  }));
  els.editorBadges.appendChild(badge('Audit', contract.artifacts.auditStatus || 'none', {
    className: 'status-pill',
    dataStatus: contract.artifacts.auditStatus || 'draft',
  }));
  els.editorBadges.appendChild(badge('GC', contract.metadata?.garbageCollect ? 'on' : 'off', {
    className: 'quiet-pill',
  }));
  if (contract.metadata?.splitStory) {
    els.editorBadges.appendChild(badge('Split', 'flagged', {
      className: 'meta-pill',
    }));
  }

  els.phasePill.textContent = `${contract.phase.label} - ${contract.phase.progressPercent}%`;
  els.phasePill.dataset.phase = contract.phase.id;
  els.statusSelect.value = contract.status;
  els.statusSelect.disabled = false;
  els.saveButton.disabled = false;
  els.modeNote.textContent = contract.mode.externalLlmOnly
    ? 'This repo runs with workflow.externalLlmOnly=true, so execute/audit remain external workflow steps.'
    : 'All lifecycle actions are available locally from the dashboard.';
}

function renderStructuredTextareaField(field, label, placeholder, value, disabledAttr) {
  const expandedClass = isFieldExpanded(field) ? ' is-expanded' : '';
  return `
    <label class="structured-field structured-field-textarea">
      <span class="field-label">${label}</span>
      <textarea class="expandable-textarea${expandedClass}" data-editor-field="${field}" data-expand-key="${field}" placeholder="${escapeHtml(placeholder)}" ${disabledAttr}>${escapeHtml(value)}</textarea>
      <button type="button" class="expand-toggle field-expand-toggle" data-expand-target="${field}" ${disabledAttr}>${getExpandToggleLabel(field)}</button>
    </label>
  `;
}

function applyContractDetailUpdate(contract) {
  state.contract = contract;
  syncEditorStateFromContract(state.contract);

  const match = state.contracts.find((item) => item.id === contract.id);
  if (match) {
    match.status = contract.status;
    match.phase = contract.phase;
    match.lastModifiedAt = contract.lastModifiedAt;
    match.artifacts = contract.artifacts;
    match.title = contract.title;
    match.metadata = contract.metadata;
  }
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
      <div class="structured-row">
        <label class="structured-field">
          <span class="field-label">Targeted Release</span>
          <input type="text" data-editor-field="targetedRelease" value="${escapeHtml(state.editorForm.targetedRelease)}" placeholder="vX.Y.Z or release branch" ${disabledAttr}>
        </label>
        <label class="structured-field structured-field-checkbox">
          <span class="field-label">Garbage Collect</span>
          <span class="structured-check-toggle structured-inline-toggle">
            <input type="checkbox" data-editor-field="garbageCollect" ${state.editorForm.garbageCollect ? 'checked' : ''} ${disabledAttr}>
            <span>Archive automatically when the contract is completed</span>
          </span>
        </label>
      </div>
      <label class="structured-field structured-field-checkbox">
        <span class="field-label">Split Story</span>
        <span class="structured-check-toggle structured-inline-toggle">
          <input type="checkbox" data-editor-field="splitStory" ${state.editorForm.splitStory ? 'checked' : ''} ${disabledAttr}>
          <span>Mark this contract so an LLM will split it into smaller stories.</span>
        </span>
      </label>
      ${renderStructuredTextareaField('objective', 'Objective', 'Describe the contract objective.', state.editorForm.objective, disabledAttr)}
      ${renderStructuredTextareaField('scope', 'Scope', 'List the contract scope.', state.editorForm.scope, disabledAttr)}
      ${renderStructuredTextareaField('nonGoals', 'Non-Goals', 'Capture what is intentionally out of scope.', state.editorForm.nonGoals, disabledAttr)}
      ${renderStructuredTextareaField('testing', 'Testing', 'Document the planned testing.', state.editorForm.testing, disabledAttr)}
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
  const rawEditorShell = els.contractEditor?.parentElement;
  els.editorModeSwitch.querySelectorAll('[data-editor-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.editorMode === state.editorMode);
    button.disabled = !hasContract;
  });

  els.structuredEditor.classList.toggle('is-hidden', state.editorMode !== 'structured');
  if (rawEditorShell) {
    rawEditorShell.classList.toggle('is-hidden', state.editorMode !== 'raw');
  } else {
    els.contractEditor.classList.toggle('is-hidden', state.editorMode !== 'raw');
  }
}

function renderEditor() {
  if (!state.contract) {
    state.rawDraft = '';
    state.editorForm = {
      title: '',
      targetedRelease: '',
      garbageCollect: false,
      splitStory: false,
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
  els.contractEditor.classList.toggle('is-expanded', isFieldExpanded('raw'));
  if (els.contractEditorExpand) {
    els.contractEditorExpand.disabled = !state.contract;
    els.contractEditorExpand.textContent = getExpandToggleLabel('raw');
  }
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

  if (contract.metadata?.splitStory) {
    const flagged = document.createElement('div');
    flagged.className = 'validation-badge split-flagged';
    flagged.textContent = 'Split Story flag is enabled for this contract.';
    els.validationSummary.appendChild(flagged);
  } else if (shouldSuggestSplit(contract)) {
    const actions = document.createElement('div');
    actions.className = 'validation-actions';

    const splitButton = document.createElement('button');
    splitButton.type = 'button';
    splitButton.className = 'ghost-button compact-button';
    splitButton.textContent = 'Mark For Split';
    splitButton.addEventListener('click', () => {
      markContractForSplit().catch((error) => setLog([error.message]));
    });

    actions.appendChild(splitButton);
    els.validationSummary.appendChild(actions);
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

function renderRulesEditor() {
  const readOnly = isRulesEditorReadOnly();
  const editModeButton = els.rulesEditorModeSwitch?.querySelector('[data-rules-editor-mode="edit"]');

  // Render drafts list
  if (els.draftsPanel) {
    els.draftsPanel.innerHTML = '';
    if (els.draftsCount) {
      els.draftsCount.textContent = String(state.drafts.length);
    }

    if (state.drafts.length === 0) {
      els.draftsPanel.innerHTML = '<div class="empty-state compact-empty">No pending drafts</div>';
    } else {
      state.drafts.forEach((draft) => {
        const button = document.createElement('button');
        button.type = 'button';
        const isSelected = state.rulesEditorSource?.type === 'draft' && state.rulesEditorSource?.id === draft.id;
        button.className = `draft-card${isSelected ? ' is-selected' : ''}`;
        button.dataset.draftId = draft.id;

        const name = document.createElement('div');
        name.className = 'draft-name';
        name.textContent = draft.id;

        const meta = document.createElement('div');
        meta.className = 'draft-meta';
        meta.textContent = `Created: ${formatDate(draft.createdAt)}`;

        button.appendChild(name);
        button.appendChild(meta);
        els.draftsPanel.appendChild(button);
      });
    }
  }

  // Render editor mode switch
  if (els.rulesEditorModeSwitch) {
    if (editModeButton) {
      editModeButton.hidden = readOnly;
    }

    els.rulesEditorModeSwitch.querySelectorAll('[data-rules-editor-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.rulesEditorMode === state.rulesEditorMode);
    });
  }

  // Render editor content
  if (els.rulesEditorTextarea) {
    if (state.rulesEditorMode === 'edit') {
      els.rulesEditorTextarea.classList.remove('is-hidden');
      els.rulesEditorPreview.classList.add('is-hidden');
      els.rulesEditorTextarea.disabled = !state.rulesEditorSource;
      els.rulesEditorTextarea.readOnly = Boolean(state.rulesEditorSource) && readOnly;
      els.rulesEditorTextarea.classList.toggle('is-expanded', isFieldExpanded('rulesEditor'));
      if (els.rulesEditorExpand) {
        els.rulesEditorExpand.hidden = false;
        els.rulesEditorExpand.disabled = !state.rulesEditorSource;
        els.rulesEditorExpand.textContent = getExpandToggleLabel('rulesEditor');
      }
    } else {
      els.rulesEditorTextarea.classList.add('is-hidden');
      els.rulesEditorPreview.classList.remove('is-hidden');
      if (els.rulesEditorExpand) {
        els.rulesEditorExpand.hidden = true;
      }
      renderRulesPreview();
    }
  }

  // Render editor title
  if (els.rulesEditorTitle) {
    if (state.rulesEditorSource) {
      const sourceType = state.rulesEditorSource.type;
      const sourceId = state.rulesEditorSource.id || state.rulesEditorSource.file || state.rulesEditorSource.ref;
      els.rulesEditorTitle.textContent = `${sourceType}: ${sourceId}`;
    } else {
      els.rulesEditorTitle.textContent = 'Rule Content';
    }
  }

  // Render status
  if (els.rulesEditorStatus) {
    els.rulesEditorStatus.textContent = readOnly
      ? 'Read-only'
      : (state.rulesEditorModified ? 'Modified' : '');
    els.rulesEditorStatus.classList.toggle('modified', state.rulesEditorModified);
  }

  // Update button states
  if (els.rulesSaveDraftBtn) {
    els.rulesSaveDraftBtn.disabled = readOnly || !state.rulesEditorModified;
  }

  if (els.rulesApplyBtn) {
    els.rulesApplyBtn.disabled = readOnly || !state.rulesEditorModified;
  }

  if (els.rulesDiscardBtn) {
    els.rulesDiscardBtn.disabled = readOnly || !state.rulesEditorModified;
  }

  // Render diff
  renderRulesDiff();
}

function renderRulesPreview() {
  if (!els.rulesEditorPreview) return;

  const content = state.rulesEditorContent;
  if (!content) {
    els.rulesEditorPreview.innerHTML = '<div class="empty-state">No content to preview</div>';
    return;
  }

  // Simple markdown to HTML conversion
  let html = escapeHtml(content);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```([^`]+)```/gs, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');

  els.rulesEditorPreview.innerHTML = html;
}

function renderRulesDiff() {
  if (!els.rulesDiffPanel || !window.RulesDiff) return;

  if (!state.rulesEditorModified || !state.rulesEditorOriginal) {
    els.rulesDiffPanel.innerHTML = '<div class="empty-state">Edit a rule to see changes here</div>';
    return;
  }

  const diff = window.RulesDiff.computeDiff(state.rulesEditorOriginal, state.rulesEditorContent);
  els.rulesDiffPanel.innerHTML = window.RulesDiff.renderDiffHtml(diff);
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
          loadContract(contract.id).catch((error) => setLog([error.message]));
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
    card.className = `history-card${entry.id === state.selectedHistoryId ? ' is-selected' : ''}`;
    card.dataset.historyId = entry.id;

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
    card.addEventListener('click', () => {
      loadHistoryDetail(entry.id, { refreshHistory: true }).catch((error) => setLog([error.message]));
    });
    els.historyList.appendChild(card);
  });
}

function renderHistoryDetailModal() {
  const isOpen = Boolean(state.selectedHistoryId);

  if (!els.historyDetailBackdrop || !els.historyDetailModal) {
    return;
  }

  els.historyDetailBackdrop.classList.toggle('is-visible', isOpen);
  els.historyDetailBackdrop.setAttribute('aria-hidden', String(!isOpen));
  els.historyDetailModal.classList.toggle('is-open', isOpen);
  els.historyDetailModal.setAttribute('aria-hidden', String(!isOpen));

  if (!isOpen) {
    els.historyDetailTitle.textContent = 'Archived Contract';
    els.historyDetailMeta.innerHTML = '';
    els.historyDetailBody.innerHTML = '<div class="empty-state">Select a history tile to inspect the archived details.</div>';
    return;
  }

  if (state.historyDetailLoading) {
    els.historyDetailTitle.textContent = state.selectedHistoryId;
    els.historyDetailMeta.innerHTML = '';
    els.historyDetailBody.innerHTML = '<div class="empty-state">Loading archived details...</div>';
    return;
  }

  if (state.historyDetailError) {
    els.historyDetailTitle.textContent = state.selectedHistoryId;
    els.historyDetailMeta.innerHTML = '';
    els.historyDetailBody.innerHTML = `<div class="empty-state">${escapeHtml(state.historyDetailError)}</div>`;
    return;
  }

  const detail = state.historyDetail;
  if (!detail) {
    els.historyDetailTitle.textContent = state.selectedHistoryId;
    els.historyDetailMeta.innerHTML = '';
    els.historyDetailBody.innerHTML = '<div class="empty-state">No archived detail loaded.</div>';
    return;
  }

  els.historyDetailTitle.textContent = detail.title || detail.id;
  els.historyDetailMeta.innerHTML = '';
  els.historyDetailMeta.appendChild(badge('ID', detail.id, { className: 'meta-pill' }));
  els.historyDetailMeta.appendChild(badge('Type', detail.type || 'FEATURE_CONTRACT', { className: 'meta-pill' }));
  els.historyDetailMeta.appendChild(badge('Closed', formatDate(detail.closedAt), {
    className: 'status-pill',
    dataStatus: detail.status || 'archived',
  }));

  if (detail.targetedRelease) {
    els.historyDetailMeta.appendChild(badge('Target Release', detail.targetedRelease, { className: 'meta-pill' }));
  }
  if (detail.garbageCollect) {
    els.historyDetailMeta.appendChild(badge('GC', 'on', { className: 'quiet-pill' }));
  }
  if (detail.splitStory) {
    els.historyDetailMeta.appendChild(badge('Split', 'flagged', { className: 'meta-pill' }));
  }
  if (Array.isArray(detail.files) && detail.files.length > 0) {
    els.historyDetailMeta.appendChild(badge('Files', detail.files.length, { className: 'quiet-pill' }));
  }

  const filesMarkup = Array.isArray(detail.files) && detail.files.length > 0
    ? `<ul class="history-file-list">${detail.files.map((file) => `<li>${escapeHtml(file)}</li>`).join('')}</ul>`
    : '<div class="empty-state compact-empty">No file list captured for this archived contract.</div>';
  const planMarkup = detail.planText
    ? `<pre class="code-block history-detail-code">${escapeHtml(detail.planText)}</pre>`
    : '<div class="empty-state compact-empty">No archived plan file is available for this contract.</div>';
  const archiveMarkup = detail.archiveText
    ? `<pre class="code-block history-detail-code">${escapeHtml(detail.archiveText)}</pre>`
    : '<div class="empty-state compact-empty">No archived bundle text is available.</div>';

  els.historyDetailBody.innerHTML = `
    <div class="history-detail-grid">
      <section class="summary-card">
        <h4>Objective</h4>
        <p class="history-detail-copy">${escapeHtml(detail.objective || 'No archived objective captured for this contract.')}</p>
      </section>
      <section class="summary-card">
        <h4>Archive Source</h4>
        <p class="history-detail-copy">${escapeHtml(detail.archivePath || 'No archive path recorded.')}</p>
      </section>
      <section class="summary-card">
        <h4>Files</h4>
        ${filesMarkup}
      </section>
      <section class="summary-card">
        <h4>Archived Plan</h4>
        ${planMarkup}
      </section>
      <section class="summary-card">
        <h4>Bundle Preview</h4>
        ${archiveMarkup}
      </section>
    </div>
  `;
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
  renderRulesEditor();
  renderDashboardOverview();
  renderHistoryDetailModal();
}

async function refreshPageData(options = {}) {
  if (liveRefreshInFlight) {
    return;
  }

  liveRefreshInFlight = true;
  try {
    const payload = await fetchJson('/api/bootstrap');
    state.contracts = payload.contracts || [];
    state.history = payload.history || [];
    state.workflow = payload.workflow || state.workflow;
    state.commands = payload.commands || state.commands;
    state.rulesets = payload.rulesets || state.rulesets;
    state.mode = payload.status?.mode || state.mode;

    await loadDrafts();

    if (state.selectedId && !state.contracts.some((contract) => contract.id === state.selectedId)) {
      state.selectedId = null;
      state.contract = null;
    }

    if (!state.selectedId && state.contracts.length > 0) {
      state.selectedId = state.contracts[0].id;
    }

    if (state.selectedHistoryId && options.reloadHistoryDetail !== false) {
      await loadHistoryDetail(state.selectedHistoryId, { refreshHistory: false });
    }
    renderAll();
  } finally {
    liveRefreshInFlight = false;
  }
}

function startLiveRefresh() {
  stopLiveRefresh();
  liveRefreshTimer = window.setInterval(() => {
    if (document.hidden) {
      return;
    }

    refreshPageData({ reloadHistoryDetail: state.activePage === 'history' })
      .catch(() => {});
  }, LIVE_REFRESH_INTERVAL_MS);
}

function stopLiveRefresh() {
  if (liveRefreshTimer) {
    window.clearInterval(liveRefreshTimer);
    liveRefreshTimer = null;
  }
}

async function loadBootstrap(options = {}) {
  const payload = await fetchJson('/api/bootstrap');
  state.contracts = payload.contracts || [];
  state.history = payload.history || [];
  state.workflow = payload.workflow || null;
  state.commands = payload.commands || null;
  state.rulesets = payload.rulesets || null;
  state.mode = payload.status?.mode || { externalLlmOnly: false };

  // Load drafts for rules editor
  await loadDrafts();

  if (state.selectedId && !state.contracts.some((contract) => contract.id === state.selectedId)) {
    state.selectedId = null;
  }
  if (!state.selectedId && state.contracts.length > 0) {
    state.selectedId = state.contracts[0].id;
  }

  if (state.selectedId && options.reloadSelectedContract !== false) {
    await loadContract(state.selectedId, { refreshCollections: false });
  } else {
    if (state.contract && (!state.selectedId || state.contract.id !== state.selectedId)) {
      state.contract = null;
    }
    renderAll();
  }
}

async function loadContract(id, options = {}) {
  if (options.refreshCollections !== false) {
    await refreshPageData({ reloadHistoryDetail: false });
  }

  state.selectedId = id;
  const payload = await fetchJson(`/api/contracts/${encodeURIComponent(id)}`);
  applyContractDetailUpdate(payload.contract);
  if (state.activePage === 'contracts') {
    state.isContractsDrawerOpen = false;
  }
  renderAll();
}

async function loadHistoryDetail(id, options = {}) {
  const selectedId = String(id || '').trim().toUpperCase();
  if (!selectedId) return;

  if (options.refreshHistory !== false) {
    const payload = await fetchJson('/api/history');
    state.history = payload.history || [];
  }

  state.selectedHistoryId = selectedId;
  state.historyDetail = null;
  state.historyDetailError = '';
  state.historyDetailLoading = true;
  renderHistory();
  renderHistoryDetailModal();

  try {
    const payload = await fetchJson(`/api/history/${encodeURIComponent(selectedId)}`);
    if (state.selectedHistoryId !== selectedId) {
      return;
    }
    state.historyDetail = payload.history || null;
  } catch (error) {
    if (state.selectedHistoryId !== selectedId) {
      return;
    }
    state.historyDetailError = error.message;
  } finally {
    if (state.selectedHistoryId !== selectedId) {
      return;
    }
    state.historyDetailLoading = false;
    renderHistory();
    renderHistoryDetailModal();
  }
}

function closeHistoryDetail() {
  state.selectedHistoryId = null;
  state.historyDetail = null;
  state.historyDetailError = '';
  state.historyDetailLoading = false;
  renderHistory();
  renderHistoryDetailModal();
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

    if (state.ruleDetail?.content) {
      loadRuleIntoEditor(
        scope === 'local'
          ? { type: 'local', file: value, scope: 'local' }
          : { type: 'repo', ref: value, scope: 'repo' },
        state.ruleDetail.content
      );
    }
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

async function loadDrafts() {
  try {
    const payload = await fetchJson('/api/rulesets/drafts');
    state.drafts = payload.drafts || [];
  } catch {
    state.drafts = [];
  }
}

function loadRuleIntoEditor(source, content) {
  if (source?.type === 'repo' && state.rulesEditorMode === 'edit') {
    state.rulesEditorMode = 'preview';
  }

  state.rulesEditorSource = source;
  state.rulesEditorOriginal = content;
  state.rulesEditorContent = content;
  state.rulesEditorModified = false;

  if (els.rulesEditorTextarea) {
    els.rulesEditorTextarea.value = content;
  }

  renderRulesEditor();
}

function updateRulesEditorContent(content) {
  state.rulesEditorContent = content;
  state.rulesEditorModified = window.RulesDiff?.hasChanges(state.rulesEditorOriginal, content) || false;
  renderRulesEditor();
}

function discardRulesEditorChanges() {
  state.rulesEditorContent = state.rulesEditorOriginal;
  state.rulesEditorModified = false;

  if (els.rulesEditorTextarea) {
    els.rulesEditorTextarea.value = state.rulesEditorOriginal;
  }

  renderRulesEditor();
}

async function saveDraftToServer() {
  if (!state.rulesEditorModified || !state.rulesEditorContent) return;

  try {
    const payload = await fetchJson('/api/rulesets/draft', {
      method: 'POST',
      body: JSON.stringify({
        goal: 'User-edited draft',
        save: true,
      }),
    });

    await loadDrafts();
    renderRulesEditor();
  } catch (error) {
    setLog([`Failed to save draft: ${error.message}`]);
  }
}

async function applyRulesChanges() {
  if (!state.rulesEditorModified || !state.rulesEditorSource) return;

  const source = state.rulesEditorSource;

  // For drafts, apply them
  if (source.type === 'draft') {
    try {
      await fetchJson('/api/rulesets/drafts/apply', {
        method: 'POST',
        body: JSON.stringify({ file: source.file }),
      });

      state.rulesEditorSource = null;
      state.rulesEditorContent = '';
      state.rulesEditorOriginal = '';
      state.rulesEditorModified = false;

      await loadDrafts();
      await loadBootstrap();
    } catch (error) {
      setLog([`Failed to apply draft: ${error.message}`]);
    }
    return;
  }

  // For other rules, we'd need to save the content back
  // This would require additional backend support
  setLog(['Changes recorded. Use CLI to apply: grabby rules update']);
}

async function detectTechnologies() {
  try {
    const payload = await fetchJson('/api/rulesets/detect');
    const proposals = payload.proposals || [];

    if (proposals.length === 0) {
      setLog(['No technologies detected']);
      return;
    }

    const summary = proposals.map((p) => `${p.rulesetId} (${Math.round(p.confidence * 100)}%)`).join(', ');
    setLog([`Detected: ${summary}`, 'Use CLI to add: grabby rules add <ruleset>']);
  } catch (error) {
    setLog([`Detection failed: ${error.message}`]);
  }
}

async function generateRulesDraft() {
  try {
    setLog(['Generating draft...']);
    const payload = await fetchJson('/api/rulesets/draft', {
      method: 'POST',
      body: JSON.stringify({
        goal: 'Create new ruleset draft',
        save: true,
      }),
    });

    await loadDrafts();

    if (payload.draft?.markdown) {
      loadRuleIntoEditor(
        { type: 'new', id: 'new-draft' },
        payload.draft.markdown
      );
    }

    setLog(['Draft generated and saved']);
  } catch (error) {
    setLog([`Generation failed: ${error.message}`]);
  }
}

async function markContractForSplit() {
  if (!state.contract || state.contract.metadata?.splitStory) {
    return;
  }

  if (state.editorMode === 'raw') {
    state.rawDraft = els.contractEditor.value;
    state.editorForm = createEditorFormFromContent(state.rawDraft, state.editorForm);
  }

  state.editorForm.splitStory = true;
  const content = buildDraftContent();
  const payload = await fetchJson(`/api/contracts/${encodeURIComponent(state.contract.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      content,
      status: els.statusSelect?.value || state.contract.status,
    }),
  });

  applyContractDetailUpdate(payload.contract);
  setLog(['Contract saved and marked for split.']);
  renderAll();
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

  applyContractDetailUpdate(payload.contract);

  const logs = ['Contract saved.'];

  // Auto-trigger garbage collection when status changes to complete
  const isNowComplete = nextStatus === 'complete' || nextStatus === 'completed';
  const wasNotComplete = previousStatus !== 'complete' && previousStatus !== 'completed';
  const shouldArchive = payload.contract.metadata?.garbageCollect === true;
  if (isNowComplete && wasNotComplete && shouldArchive) {
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
      await refreshPageData({ reloadHistoryDetail: false });
      if (state.selectedId) {
        await loadContract(state.selectedId, { refreshCollections: false });
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
      await refreshPageData({ reloadHistoryDetail: false });
      setLog(payload.logs);
      if (state.selectedId) {
        await loadContract(state.selectedId, { refreshCollections: false });
      } else {
        renderAll();
      }
      return;
    }

    applyContractDetailUpdate(payload.contract);

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

  els.pageNav.addEventListener('click', async (event) => {
    const link = event.target.closest('[data-page]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    navigateToPage(link.dataset.page);
    try {
      await refreshPageData({ reloadHistoryDetail: link.dataset.page === 'history' });
    } catch (error) {
      setLog([error.message]);
    }
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

  window.addEventListener('popstate', async () => {
    state.activePage = resolvePageFromPath(window.location.pathname);
    renderPageNav();
    try {
      await refreshPageData({ reloadHistoryDetail: state.activePage === 'history' });
    } catch (error) {
      setLog([error.message]);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (state.selectedHistoryId) {
      closeHistoryDetail();
      return;
    }

    if (!state.isContractsDrawerOpen) return;
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

  if (els.contractEditorExpand) {
    els.contractEditorExpand.addEventListener('click', () => {
      toggleExpandedField('raw');
      renderEditor();
    });
  }

  els.structuredEditor.addEventListener('input', (event) => {
    if (!state.contract) return;

    const field = event.target.dataset.editorField;
    if (field && event.target.type !== 'checkbox') {
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

    const field = event.target.dataset.editorField;
    if (field && event.target.type === 'checkbox') {
      handleStructuredFieldUpdate(field, event.target.checked);
      return;
    }

    const itemIndex = event.target.dataset.doneWhenToggle;
    if (itemIndex !== undefined && state.editorForm.doneWhen[itemIndex]) {
      state.editorForm.doneWhen[itemIndex].done = event.target.checked;
      buildDraftContent();
    }
  });

  els.structuredEditor.addEventListener('click', (event) => {
    if (!state.contract) return;

    const expandTarget = event.target.closest('[data-expand-target]')?.dataset.expandTarget;
    if (expandTarget) {
      toggleExpandedField(expandTarget);
      renderEditor();
      return;
    }

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

  // Rules editor mode switch
  if (els.rulesEditorModeSwitch) {
    els.rulesEditorModeSwitch.addEventListener('click', (event) => {
      const button = event.target.closest('[data-rules-editor-mode]');
      if (!button) return;
      state.rulesEditorMode = button.dataset.rulesEditorMode === 'preview' ? 'preview' : 'edit';
      renderRulesEditor();
    });
  }

  // Rules editor textarea
  if (els.rulesEditorTextarea) {
    els.rulesEditorTextarea.addEventListener('input', (event) => {
      updateRulesEditorContent(event.target.value || '');
    });
  }

  if (els.rulesEditorExpand) {
    els.rulesEditorExpand.addEventListener('click', () => {
      toggleExpandedField('rulesEditor');
      renderRulesEditor();
    });
  }

  // Drafts panel click to load draft
  if (els.draftsPanel) {
    els.draftsPanel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-draft-id]');
      if (!button) return;
      const draftId = button.dataset.draftId;
      const draft = state.drafts.find((d) => d.id === draftId);
      if (draft && draft.content) {
        loadRuleIntoEditor(
          { type: 'draft', id: draft.id, file: draft.file },
          draft.content
        );
      }
    });
  }

  // Rules editor action buttons
  if (els.rulesDetectBtn) {
    els.rulesDetectBtn.addEventListener('click', detectTechnologies);
  }

  if (els.rulesGenerateBtn) {
    els.rulesGenerateBtn.addEventListener('click', generateRulesDraft);
  }

  if (els.rulesSaveDraftBtn) {
    els.rulesSaveDraftBtn.addEventListener('click', saveDraftToServer);
  }

  if (els.rulesApplyBtn) {
    els.rulesApplyBtn.addEventListener('click', applyRulesChanges);
  }

  if (els.rulesDiscardBtn) {
    els.rulesDiscardBtn.addEventListener('click', discardRulesEditorChanges);
  }

  if (els.historyDetailClose) {
    els.historyDetailClose.addEventListener('click', closeHistoryDetail);
  }

  if (els.historyDetailBackdrop) {
    els.historyDetailBackdrop.addEventListener('click', closeHistoryDetail);
  }
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
    contractEditorExpand: $('contract-editor-expand'),
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
    // Rules editor elements
    draftsPanel: $('drafts-panel'),
    draftsCount: $('drafts-count'),
    rulesEditorTitle: $('rules-editor-title'),
    rulesEditorTextarea: $('rules-editor-textarea'),
    rulesEditorExpand: $('rules-editor-expand'),
    rulesEditorPreview: $('rules-editor-preview'),
    rulesEditorStatus: $('rules-editor-status'),
    rulesDiffPanel: $('rules-diff-panel'),
    rulesDetectBtn: $('rules-detect-btn'),
    rulesGenerateBtn: $('rules-generate-btn'),
    rulesSaveDraftBtn: $('rules-save-draft-btn'),
    rulesApplyBtn: $('rules-apply-btn'),
    rulesDiscardBtn: $('rules-discard-btn'),
    rulesEditorModeSwitch: document.querySelector('.rules-editor-mode-switch'),
    // Navigation and layout
    pageNav: $('page-nav'),
    contractWorkspaceNav: $('contract-workspace-nav'),
    contractsDrawer: $('contracts-drawer'),
    contractsDrawerBackdrop: $('contracts-drawer-backdrop'),
    contractsDrawerToggle: $('contracts-drawer-toggle'),
    contractsDrawerClose: $('contracts-drawer-close'),
    historyDetailBackdrop: $('history-detail-backdrop'),
    historyDetailModal: $('history-detail-modal'),
    historyDetailTitle: $('history-detail-title'),
    historyDetailMeta: $('history-detail-meta'),
    historyDetailBody: $('history-detail-body'),
    historyDetailClose: $('history-detail-close'),
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
    startLiveRefresh();
  } catch (error) {
    setLog([error.message]);
    els.contractList.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

window.addEventListener('DOMContentLoaded', init);
window.addEventListener('beforeunload', stopLiveRefresh);
