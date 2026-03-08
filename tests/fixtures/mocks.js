/**
 * Mock Objects for Testing
 * @module tests/fixtures/mocks
 */

/**
 * Create a mock filesystem object.
 * @returns {object} Mock fs with tracking
 */
function createMockFs() {
  const files = new Map();
  const dirs = new Set();

  return {
    files,
    dirs,
    existsSync: (p) => files.has(p) || dirs.has(p),
    readFileSync: (p) => {
      if (!files.has(p)) {
        const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
      return files.get(p);
    },
    writeFileSync: (p, content) => {
      files.set(p, content);
    },
    mkdirSync: (p) => {
      dirs.add(p);
    },
    readdirSync: (p) => {
      const entries = [];
      for (const [filePath] of files) {
        if (filePath.startsWith(p + '/') || filePath.startsWith(p + '\\')) {
          const relative = filePath.slice(p.length + 1);
          const firstPart = relative.split(/[/\\]/)[0];
          if (!entries.includes(firstPart)) {
            entries.push(firstPart);
          }
        }
      }
      return entries;
    },
    unlinkSync: (p) => {
      files.delete(p);
    },
    rmSync: (p) => {
      files.delete(p);
      dirs.delete(p);
    },
    statSync: (p) => ({
      isDirectory: () => dirs.has(p),
      isFile: () => files.has(p),
    }),
    reset: () => {
      files.clear();
      dirs.clear();
    },
  };
}

/**
 * Create a mock child_process.execSync.
 * @param {object} [responses={}] - Command to response mapping
 * @returns {Function} Mock execSync
 */
function createMockExecSync(responses = {}) {
  const calls = [];

  const mock = (cmd, options) => {
    calls.push({ cmd, options });

    // Check for matching response
    for (const [pattern, response] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        if (response instanceof Error) {
          throw response;
        }
        return response;
      }
    }

    // Default responses for common commands
    if (cmd.includes('git rev-parse --is-inside-work-tree')) {
      return 'true\n';
    }
    if (cmd.includes('git branch --show-current')) {
      return 'main\n';
    }
    if (cmd.includes('git status --porcelain')) {
      return '';
    }
    if (cmd.includes('npm audit')) {
      return '';
    }

    return '';
  };

  mock.calls = calls;
  mock.reset = () => { calls.length = 0; };

  return mock;
}

/**
 * Create a mock readline interface.
 * @param {string[]} [answers=[]] - Answers to provide
 * @returns {object} Mock readline
 */
function createMockReadline(answers = []) {
  let answerIndex = 0;

  return {
    createInterface: () => ({
      question: (prompt, callback) => {
        const answer = answers[answerIndex++] || '';
        setImmediate(() => callback(answer));
      },
      close: () => {},
    }),
  };
}

/**
 * Create a mock HTTP response.
 * @param {number} [statusCode=200] - Status code
 * @param {object} [body={}] - Response body
 * @returns {object} Mock response
 */
function createMockResponse(statusCode = 200, body = {}) {
  let data = '';
  let ended = false;
  let headers = {};

  return {
    statusCode,
    writeHead: (code, hdrs) => {
      statusCode = code;
      headers = { ...headers, ...hdrs };
    },
    setHeader: (key, value) => {
      headers[key] = value;
    },
    write: (chunk) => {
      data += chunk;
    },
    end: (chunk) => {
      if (chunk) data += chunk;
      ended = true;
    },
    getStatus: () => statusCode,
    getData: () => data,
    getHeaders: () => headers,
    isEnded: () => ended,
  };
}

/**
 * Create a mock HTTP request.
 * @param {string} [method='GET'] - HTTP method
 * @param {string} [url='/'] - Request URL
 * @param {object} [body=null] - Request body
 * @returns {object} Mock request
 */
function createMockRequest(method = 'GET', url = '/', body = null) {
  const chunks = body ? [JSON.stringify(body)] : [];
  let dataCallback = null;
  let endCallback = null;

  return {
    method,
    url,
    headers: {
      'content-type': 'application/json',
    },
    on: (event, callback) => {
      if (event === 'data') {
        dataCallback = callback;
        chunks.forEach(chunk => callback(chunk));
      }
      if (event === 'end') {
        endCallback = callback;
        setImmediate(() => callback());
      }
    },
  };
}

module.exports = {
  createMockFs,
  createMockExecSync,
  createMockReadline,
  createMockResponse,
  createMockRequest,
};
