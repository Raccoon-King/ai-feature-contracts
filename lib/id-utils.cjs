const fs = require('fs');
const path = require('path');

const WORK_ITEM_ID_RE = /([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)-(\d+)\b/;

function parseWorkItemId(input) {
  if (!input) return null;
  const match = String(input).match(WORK_ITEM_ID_RE);
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}

function stripContractSuffix(fileName) {
  return String(fileName || '')
    .replace(/\.(fc|plan|audit)\.md$/i, '')
    .replace(/\.plan\.yaml$/i, '')
    .replace(/\.metrics\.json$/i, '');
}

function extractIdFromContent(content) {
  const idLineMatch = String(content || '').match(/\*\*ID:\*\*\s*([^|\n\r]+)/i);
  return parseWorkItemId(idLineMatch ? idLineMatch[1] : '');
}

function extractIdFromFilename(filePath) {
  const fileBase = stripContractSuffix(path.basename(filePath || ''));
  return parseWorkItemId(fileBase);
}

function extractContractId(content, fallbackFilename = '') {
  const fromContent = extractIdFromContent(content);
  if (fromContent) return fromContent;

  const fromFilename = extractIdFromFilename(fallbackFilename);
  if (fromFilename) return fromFilename;

  throw new Error('Unable to determine contract ID. Add "**ID:** <KEY-123>" to the contract or rename the file to include the ID.');
}

function ensureIdMatchesFilename(contractPath) {
  const content = fs.readFileSync(contractPath, 'utf8');
  const extractedId = extractContractId(content, contractPath);
  const fileName = path.basename(contractPath);
  const filenameId = extractIdFromFilename(fileName);

  if (filenameId && extractedId !== filenameId) {
    throw new Error(
      `Contract ID mismatch for ${fileName}: content ID is ${extractedId}, filename ID is ${filenameId}. ` +
      `Fix by editing the "**ID:**" line or renaming the file to contracts/${extractedId}.fc.md.`
    );
  }

  return extractedId;
}

function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join('-');
}

module.exports = {
  WORK_ITEM_ID_RE,
  parseWorkItemId,
  extractIdFromContent,
  extractIdFromFilename,
  extractContractId,
  ensureIdMatchesFilename,
  slugifyTitle,
};
