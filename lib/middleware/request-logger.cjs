/**
 * Request logging middleware with Winston
 * @module middleware/request-logger
 */

const winston = require('winston');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Create request logger middleware
 * @param {Object} config - Logger configuration
 * @returns {Function} Express middleware
 */
function createRequestLogger(config) {
  const baseDir = config.cwd || process.cwd();
  const logsDir = path.join(baseDir, '.grabby', 'logs');

  // Ensure logs directory exists
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logger = winston.createLogger({
    level: config.logLevel || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: path.join(logsDir, 'api-error.log'),
        level: 'error'
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'api-combined.log')
      })
    ]
  });

  // Console logging in development
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // Attach request ID and logger to request object
    req.requestId = requestId;
    req.logger = logger;

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;

      const logData = {
        requestId,
        method: req.method,
        path: req.path,
        query: req.query,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('user-agent'),
        ip: req.ip
      };

      // Use appropriate log level based on status code
      if (res.statusCode >= 500) {
        logger.error(logData);
      } else if (res.statusCode >= 400) {
        logger.warn(logData);
      } else {
        logger.info(logData);
      }
    });

    next();
  };
}

module.exports = { createRequestLogger };
