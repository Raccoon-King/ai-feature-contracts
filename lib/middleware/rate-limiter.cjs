/**
 * Rate limiting middleware
 * @module middleware/rate-limiter
 */

const rateLimit = require('express-rate-limit');

/**
 * Create rate limiter middleware
 * @param {Object} config - Rate limiter configuration
 * @returns {Function} Express middleware
 */
function createRateLimiter(config) {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: config.rateLimit || 100, // 100 requests per minute
    message: {
      status: 'error',
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        details: {
          limit: config.rateLimit || 100,
          window: '1 minute'
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: config.version || '3.7.0'
      }
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/v1/health';
    }
  });
}

module.exports = { createRateLimiter };
