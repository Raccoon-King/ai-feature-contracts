const REQUIRED_FIELDS = ['who', 'what', 'why', 'dod'];

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeDodList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeWhitespace(String(item || '').replace(/^(?:[-*]|\d+\.)\s+/, '')))
      .filter(Boolean);
  }

  const text = String(value || '').replace(/\r/g, '').trim();
  if (!text) return [];

  const bulletMatches = text.match(/^(?:[-*]|\d+\.)\s+.+$/gm);
  if (bulletMatches && bulletMatches.length > 0) {
    return bulletMatches.map((line) => normalizeWhitespace(line.replace(/^(?:[-*]|\d+\.)\s+/, ''))).filter(Boolean);
  }

  return text
    .split(/[,\n]/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function inferDraftTicket(request = '') {
  const normalized = normalizeWhitespace(request);
  if (!normalized) {
    return {
      ticketId: null,
      who: '',
      what: '',
      why: '',
      dod: [],
    };
  }

  return {
    ticketId: null,
    who: '',
    what: normalized,
    why: '',
    dod: [],
  };
}

function extractField(lines, name) {
  const prefix = new RegExp(`^${name}:\\s*(.*)$`, 'i');
  for (const line of lines) {
    const match = line.match(prefix);
    if (match) {
      return normalizeWhitespace(match[1]);
    }
  }
  return '';
}

function extractDodSection(lines, headings = ['Definition of Done', 'DoD']) {
  const headingRegex = new RegExp(`^(?:${headings.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):?\\s*(.*)$`, 'i');
  let startIndex = -1;
  let inlineValue = '';

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(headingRegex);
    if (match) {
      startIndex = index;
      inlineValue = normalizeWhitespace(match[1]);
      break;
    }
  }

  if (startIndex === -1) {
    return [];
  }

  const collected = [];
  if (inlineValue) {
    collected.push(inlineValue);
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[A-Za-z][A-Za-z ]+:\s*/.test(line)) {
      break;
    }
    if (!line.trim()) {
      continue;
    }
    collected.push(line);
  }

  return normalizeDodList(collected);
}

function parseStructuredTicket(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const who = extractField(lines, 'Who');
  const what = extractField(lines, 'What');
  const why = extractField(lines, 'Why');
  const ticketId = extractField(lines, 'Ticket ID') || null;
  const dod = extractDodSection(lines);

  const ticket = { ticketId, who, what, why, dod };
  const missingFields = getMissingTicketFields(ticket);

  return {
    kind: 'structured',
    ticket,
    missingFields,
  };
}

function parseLegacyTicket(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const ticketId = extractField(lines, 'Ticket ID') || null;
  const who = extractField(lines, 'Who');
  const what = extractField(lines, 'What');
  const whatSystem = extractField(lines, 'What System');
  const dod = extractDodSection(lines);

  if (!who && !what && !whatSystem && !ticketId && dod.length === 0) {
    return null;
  }

  const why = whatSystem ? `Requested for ${whatSystem}.` : '';
  const ticket = { ticketId, who, what, why, dod };

  return {
    kind: 'legacy',
    ticket,
    missingFields: getMissingTicketFields(ticket),
    mappedFromLegacy: true,
    legacySystem: whatSystem || null,
  };
}

function parseTicketInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return {
      kind: 'missing',
      ticket: inferDraftTicket(''),
      missingFields: [...REQUIRED_FIELDS],
      rawRequest: '',
    };
  }

  if (/^What System:/im.test(text)) {
    const legacy = parseLegacyTicket(text);
    if (legacy) {
      return legacy;
    }
  }

  const structured = parseStructuredTicket(text);
  if (structured.ticket.who || structured.ticket.what || structured.ticket.why || structured.ticket.ticketId || structured.ticket.dod.length > 0) {
    return structured;
  }

  const inferred = inferDraftTicket(text);
  return {
    kind: 'unstructured',
    ticket: inferred,
    missingFields: getMissingTicketFields(inferred),
    rawRequest: text,
  };
}

function getMissingTicketFields(ticket) {
  const normalized = {
    who: normalizeWhitespace(ticket?.who),
    what: normalizeWhitespace(ticket?.what),
    why: normalizeWhitespace(ticket?.why),
    dod: normalizeDodList(ticket?.dod),
  };

  return REQUIRED_FIELDS.filter((field) => {
    if (field === 'dod') {
      return normalized.dod.length === 0;
    }
    return !normalized[field];
  });
}

function isCompleteTicket(ticket) {
  return getMissingTicketFields(ticket).length === 0;
}

function mergeTicketInput(baseTicket, overrides = {}) {
  return {
    ticketId: normalizeWhitespace(overrides.ticketId || baseTicket.ticketId || '') || null,
    who: normalizeWhitespace(overrides.who || baseTicket.who || ''),
    what: normalizeWhitespace(overrides.what || baseTicket.what || ''),
    why: normalizeWhitespace(overrides.why || baseTicket.why || ''),
    dod: normalizeDodList(overrides.dod !== undefined ? overrides.dod : baseTicket.dod),
  };
}

function getWizardQuestions(ticket, options = {}) {
  const {
    maxQuestions = 5,
    rawRequest = '',
  } = options;
  const merged = mergeTicketInput(inferDraftTicket(rawRequest), ticket);
  const questions = [];

  if (!merged.who) {
    questions.push({
      field: 'who',
      prompt: 'Who is this for?',
      defaultValue: '',
    });
  }

  if (!merged.what) {
    questions.push({
      field: 'what',
      prompt: 'What should be built or changed?',
      defaultValue: rawRequest ? normalizeWhitespace(rawRequest) : '',
    });
  }

  if (!merged.why) {
    questions.push({
      field: 'why',
      prompt: 'Why is this needed?',
      defaultValue: '',
    });
  }

  if (merged.dod.length === 0) {
    questions.push({
      field: 'dod',
      prompt: 'What is the definition of done? (comma-separated or bullets)',
      defaultValue: '',
    });
  }

  return questions.slice(0, maxQuestions);
}

function applyWizardAnswer(ticket, field, value) {
  if (field === 'dod') {
    return mergeTicketInput(ticket, { dod: normalizeDodList(value) });
  }
  return mergeTicketInput(ticket, { [field]: value });
}

function validateTicket(ticket) {
  const missingFields = getMissingTicketFields(ticket);
  const errors = [];

  if (missingFields.length > 0) {
    errors.push(`Missing required ticket fields: ${missingFields.join(', ')}`);
  }

  const dod = normalizeDodList(ticket?.dod);
  if (dod.length === 0) {
    errors.push('Definition of Done must be a bullet list.');
  }

  return {
    valid: errors.length === 0,
    errors,
    missingFields,
  };
}

function buildTicketMarkdown(ticket) {
  const merged = mergeTicketInput({}, ticket);
  const dod = normalizeDodList(merged.dod).map((item) => `- ${item}`).join('\n');
  const lines = [];

  if (merged.ticketId) {
    lines.push(`Ticket ID: ${merged.ticketId}`);
  }
  lines.push(`Who: ${merged.who}`);
  lines.push(`What: ${merged.what}`);
  lines.push(`Why: ${merged.why}`);
  lines.push('');
  lines.push('Definition of Done');
  lines.push(dod);

  return `${lines.join('\n').trim()}\n`;
}

module.exports = {
  REQUIRED_FIELDS,
  normalizeDodList,
  inferDraftTicket,
  parseTicketInput,
  getMissingTicketFields,
  isCompleteTicket,
  mergeTicketInput,
  getWizardQuestions,
  applyWizardAnswer,
  validateTicket,
  buildTicketMarkdown,
};
