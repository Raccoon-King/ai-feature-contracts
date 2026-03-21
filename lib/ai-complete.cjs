/**
 * AI Auto-Complete for Grabby
 * LLM-powered contract field suggestions
 * Supports cloud APIs (OpenAI, Anthropic, Gemini) and local APIs (Ollama)
 */

const http = require('http');
const https = require('https');
const { generateSmartPrompts, detectProjectType, getProjectDirs } = require('./smart-prompts.cjs');
const { getMetadataValue } = require('./project-metadata.cjs');

/**
 * Configuration for AI providers
 */
const PROVIDERS = {
  openai: {
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
  },
  anthropic: {
    host: 'api.anthropic.com',
    path: '/v1/messages',
    model: 'claude-3-haiku-20240307',
    envKey: 'ANTHROPIC_API_KEY',
  },
  gemini: {
    host: 'generativelanguage.googleapis.com',
    path: '/v1beta/models/gemini-1.5-flash:generateContent',
    model: 'gemini-1.5-flash',
    envKey: 'GEMINI_API_KEY',
  },
  ollama: {
    host: 'localhost',
    port: 11434,
    path: '/api/generate',
    model: 'llama3.1',
    envKey: null,
  },
};

/**
 * Get API key from environment
 */
function getApiKey(provider) {
  const config = PROVIDERS[provider];
  if (!config || !config.envKey) return null;
  return process.env[config.envKey];
}

function getOllamaConfig() {
  const defaultHost = getMetadataValue('defaults.ollama.host') || 'http://localhost:11434';
  const rawHost = process.env.OLLAMA_HOST || defaultHost;
  const model = process.env.OLLAMA_MODEL || PROVIDERS.ollama.model;
  let parsed;

  try {
    parsed = new URL(rawHost);
  } catch {
    parsed = new URL(`http://${rawHost}`);
  }

  return {
    protocol: parsed.protocol === 'https:' ? 'https:' : 'http:',
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
    path: PROVIDERS.ollama.path,
    model,
  };
}

/**
 * Check if AI features are available
 */
function isAIAvailable() {
  return Boolean(getAvailableProvider());
}

/**
 * Get the available provider
 */
function getAvailableProvider() {
  if (getApiKey('gemini')) return 'gemini';
  if (getApiKey('anthropic')) return 'anthropic';
  if (getApiKey('openai')) return 'openai';
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL || process.env.AI_PROVIDER === 'ollama') {
    return 'ollama';
  }
  return null;
}

/**
 * Make a request to the LLM API
 */
async function callLLM(prompt, options = {}) {
  const provider = options.provider || getAvailableProvider();
  if (!provider) {
    throw new Error('No AI API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY');
  }

  const config = PROVIDERS[provider] || {};
  const apiKey = getApiKey(provider);
  const requestLib = provider === 'ollama' ? (getOllamaConfig().protocol === 'https:' ? https : http) : https;
  const ollamaConfig = provider === 'ollama' ? getOllamaConfig() : null;

  return new Promise((resolve, reject) => {
    let body, headers;

    if (provider === 'openai') {
      body = JSON.stringify({
        model: options.model || config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
      });
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
    } else if (provider === 'anthropic') {
      body = JSON.stringify({
        model: options.model || config.model,
        max_tokens: options.maxTokens || 1000,
        messages: [{ role: 'user', content: prompt }],
      });
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
    } else if (provider === 'gemini') {
      body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 1000,
        },
      });
      headers = {
        'Content-Type': 'application/json',
      };
    } else if (provider === 'ollama') {
      body = JSON.stringify({
        model: options.model || ollamaConfig.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 1000,
        },
      });
      headers = {
        'Content-Type': 'application/json',
      };
    } else {
      reject(new Error(`Unsupported provider: ${provider}`));
      return;
    }

    const req = requestLib.request({
      hostname: provider === 'ollama' ? ollamaConfig.host : config.host,
      port: provider === 'ollama' ? ollamaConfig.port : 443,
      path: provider === 'gemini'
        ? `${config.path}?key=${encodeURIComponent(apiKey)}`
        : (provider === 'ollama' ? ollamaConfig.path : config.path),
      method: 'POST',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const message = json.error.message || json.error;
            reject(new Error(`LLM API error: ${message}`));
            return;
          }
          if (provider === 'openai') {
            resolve(json.choices?.[0]?.message?.content || '');
          } else if (provider === 'anthropic') {
            resolve(json.content?.[0]?.text || '');
          } else if (provider === 'gemini') {
            resolve(json.candidates?.[0]?.content?.parts?.[0]?.text || '');
          } else {
            resolve(json.response || '');
          }
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Generate suggestions for contract scope
 */
async function suggestScope(taskDescription, context = {}) {
  const prompt = `You are helping create a feature contract for a software project.

Task: ${taskDescription}

Project context:
- Type: ${context.projectTypes?.join(', ') || 'unknown'}
- Directories: ${context.projectDirs?.join(', ') || 'standard'}

Generate 3-5 concise scope items for this feature contract. Each should be:
- Specific and actionable
- Focused on what will be delivered
- Written as a bullet point starting with a verb

Format as a simple list with - prefix. No explanations.`;

  const response = await callLLM(prompt, { maxTokens: 500 });
  return parseListResponse(response);
}

/**
 * Generate suggestions for files to modify/create
 */
async function suggestFiles(taskDescription, context = {}) {
  const prompt = `You are helping create a feature contract for a software project.

Task: ${taskDescription}

Project structure:
- Type: ${context.projectTypes?.join(', ') || 'unknown'}
- Existing directories: ${context.projectDirs?.join(', ') || 'src'}

Suggest files to create or modify for this feature. Include:
- Main implementation files
- Test files
- Type definitions (if TypeScript)

Format each line as: action|path|reason
Where action is "create" or "modify"
Example: create|src/hooks/useFeature.ts|Custom hook for feature state

List 3-6 files. No explanations, just the formatted lines.`;

  const response = await callLLM(prompt, { maxTokens: 500 });
  return parseFilesResponse(response);
}

/**
 * Generate suggestions for done-when criteria
 */
async function suggestDoneWhen(taskDescription, scope = []) {
  const prompt = `You are helping create a feature contract for a software project.

Task: ${taskDescription}

Scope:
${scope.map(s => `- ${s}`).join('\n')}

Generate 4-6 "Done When" criteria. Each should be:
- Verifiable (can be checked off)
- Specific to this feature
- Include at least one test-related criterion

Format as checkboxes: - [ ] Criterion text

No explanations, just the criteria.`;

  const response = await callLLM(prompt, { maxTokens: 500 });
  return parseCheckboxResponse(response);
}

/**
 * Generate security considerations
 */
async function suggestSecurityChecks(taskDescription, scope = []) {
  const prompt = `You are a security-focused code reviewer helping create a feature contract.

Task: ${taskDescription}

Scope:
${scope.map(s => `- ${s}`).join('\n')}

Identify security considerations for this feature. Consider:
- Input validation
- Authentication/authorization
- Data exposure risks
- Dependency security

Format as checkboxes: - [ ] Security check

Only include relevant checks. 3-5 items max.`;

  const response = await callLLM(prompt, { maxTokens: 400 });
  return parseCheckboxResponse(response);
}

/**
 * Auto-complete a partial contract
 */
async function completeContract(partialContract, cwd = process.cwd()) {
  const context = generateSmartPrompts(cwd, '', partialContract);

  // Extract task from partial contract
  const titleMatch = partialContract.match(/^# FC:\s+(.+)$/m);
  const objectiveMatch = partialContract.match(/## Objective\s*\n([^\n#]+)/);
  const taskDescription = objectiveMatch?.[1] || titleMatch?.[1] || 'feature implementation';

  const suggestions = {
    scope: [],
    files: [],
    doneWhen: [],
    security: [],
  };

  // Only suggest missing sections
  if (!partialContract.includes('## Scope') || partialContract.match(/## Scope\s*\n\s*\n/)) {
    suggestions.scope = await suggestScope(taskDescription, context);
  }

  if (!partialContract.includes('## Files') || partialContract.match(/## Files\s*\n[^|]*\n\s*\n/)) {
    suggestions.files = await suggestFiles(taskDescription, context);
  }

  if (!partialContract.includes('## Done When') || partialContract.match(/## Done When\s*\n\s*\n/)) {
    suggestions.doneWhen = await suggestDoneWhen(taskDescription, suggestions.scope);
  }

  if (!partialContract.includes('## Security')) {
    suggestions.security = await suggestSecurityChecks(taskDescription, suggestions.scope);
  }

  return suggestions;
}

// Helper functions to parse LLM responses
function parseListResponse(response) {
  return response
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

function parseFilesResponse(response) {
  return response
    .split('\n')
    .map(line => {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 3) {
        return { action: parts[0], path: parts[1], reason: parts[2] };
      }
      return null;
    })
    .filter(Boolean);
}

function parseCheckboxResponse(response) {
  return response
    .split('\n')
    .map(line => line.replace(/^-\s*\[\s*[x ]?\s*\]\s*/i, '').trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

function buildProjectAssessmentPrompt(assessment = {}) {
  return `You are assessing a software repository so Grabby can generate baseline feature contracts.

Repository summary:
- Package/Application: ${assessment.packageName || 'unknown'}
- Stack summary: ${assessment.stackSummary || 'unknown'}
- Project types: ${(assessment.projectTypes || []).join(', ') || 'unknown'}
- Project directories: ${(assessment.projectDirs || []).join(', ') || 'none detected'}
- Root entries: ${(assessment.rootEntries || []).slice(0, 10).map((entry) => entry.name).join(', ') || 'none detected'}
- Scripts: ${(assessment.scripts || []).join(', ') || 'none detected'}

Write a concise 1-2 sentence assessment for a baseline contract.
Requirements:
- Mention the detected stack or project shape
- Mention primary implementation or testing areas
- Do not mention secrets, credentials, or environment values
- Plain text only`;
}

function formatAssessmentSummaryFallback(assessment = {}) {
  const stack = assessment.stackSummary || 'software project';
  const dirs = (assessment.projectDirs || []).slice(0, 4);
  const tests = assessment.hasTests ? 'Testing signals are present in the repository.' : 'Testing signals were not clearly detected.';
  const dirText = dirs.length > 0
    ? `Primary working areas include ${dirs.join(', ')}.`
    : 'Primary working areas should be refined after initialization.';
  return `${stack} detected from local repository structure. ${dirText} ${tests}`;
}

async function summarizeProjectAssessment(assessment = {}, options = {}) {
  const fallback = formatAssessmentSummaryFallback(assessment);
  const provider = options.provider || getAvailableProvider();
  const llmCaller = options.callLLMImpl || callLLM;

  if (!provider) {
    return fallback;
  }

  try {
    const response = await llmCaller(buildProjectAssessmentPrompt(assessment), {
      provider,
      maxTokens: 160,
      temperature: 0.2,
    });
    return String(response || '')
      .replace(/\s+/g, ' ')
      .trim() || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Format suggestions for display
 */
function formatSuggestions(suggestions) {
  const lines = [];

  if (suggestions.scope.length > 0) {
    lines.push('\n## Suggested Scope');
    suggestions.scope.forEach(s => lines.push(`- ${s}`));
  }

  if (suggestions.files.length > 0) {
    lines.push('\n## Suggested Files');
    lines.push('| Action | Path | Reason |');
    lines.push('|--------|------|--------|');
    suggestions.files.forEach(f => {
      lines.push(`| ${f.action} | \`${f.path}\` | ${f.reason} |`);
    });
  }

  if (suggestions.doneWhen.length > 0) {
    lines.push('\n## Suggested Done When');
    suggestions.doneWhen.forEach(d => lines.push(`- [ ] ${d}`));
  }

  if (suggestions.security.length > 0) {
    lines.push('\n## Suggested Security Checks');
    suggestions.security.forEach(s => lines.push(`- [ ] ${s}`));
  }

  return lines.join('\n');
}

module.exports = {
  isAIAvailable,
  getAvailableProvider,
  callLLM,
  suggestScope,
  suggestFiles,
  suggestDoneWhen,
  suggestSecurityChecks,
  completeContract,
  formatSuggestions,
  buildProjectAssessmentPrompt,
  formatAssessmentSummaryFallback,
  summarizeProjectAssessment,
  PROVIDERS,
};
