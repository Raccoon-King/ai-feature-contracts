/**
 * Centralized error handling middleware for the REST API
 * @module middleware/error-handler
 */

/**
 * Base API error class
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
class ValidationError extends ApiError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Not found error (404)
 */
class NotFoundError extends ApiError {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`, 404, 'NOT_FOUND', { resource, id });
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error (409)
 */
class ConflictError extends ApiError {
  constructor(message, details = {}) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

/**
 * Service unavailable error (503)
 */
class ServiceUnavailableError extends ApiError {
  constructor(service, message) {
    super(`Service unavailable: ${service}`, 503, 'SERVICE_UNAVAILABLE', { service, message });
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Create error handler middleware
 * @param {Object} config - Server configuration
 * @returns {Function} Express error middleware
 */
function createErrorHandler(config) {
  return (err, req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // Log error
    if (req.logger) {
      req.logger.error({
        requestId: req.requestId,
        error: {
          message: err.message,
          code: err.code || 'UNKNOWN_ERROR',
          stack: isProduction ? undefined : err.stack
        }
      });
    } else {
      console.error('Error:', err);
    }

    // Determine status code
    const statusCode = err.statusCode || 500;

    // Build response
    const response = {
      status: 'error',
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
        details: err.details || {}
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: config.version || '3.7.0',
        requestId: req.requestId || 'unknown'
      }
    };

    // Include stack trace in development
    if (!isProduction && err.stack) {
      response.error.stack = err.stack.split('\n');
    }

    res.status(statusCode).json(response);
  };
}

module.exports = {
  createErrorHandler,
  ApiError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError
};
