const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');
const { logger } = require('./logger');

let isSentryInitialized = false;

/**
 * Initialize Sentry for error tracking and performance monitoring
 */
function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.warn('SENTRY_DSN not set, Sentry error tracking disabled');
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || 'saferide-backend@1.0.0',
      
      // Performance monitoring
      tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in dev
      profilesSampleRate: isProduction ? 0.1 : 0, // Profiling only in production
      
      integrations: [
        nodeProfilingIntegration(),
      ],
      
      // Data scrubbing - remove sensitive information
      beforeSend(event, hint) {
        // Scrub Authorization header
        if (event.request?.headers?.authorization) {
          event.request.headers.authorization = '[REDACTED]';
        }
        // Scrub other sensitive headers
        if (event.request?.headers) {
          if (event.request.headers['x-api-key']) {
            event.request.headers['x-api-key'] = '[REDACTED]';
          }
        }
        
        // Scrub phone numbers
        if (event.request) {
          if (event.request.data) {
            let data;
            try {
              data = typeof event.request.data === 'string' 
                ? JSON.parse(event.request.data) 
                : event.request.data;
            } catch (parseError) {
              // If parsing fails, skip deep scrubbing and preserve original type
              return event;
            }
            
            if (typeof data === 'object' && data !== null) {
              if (data.phone) {
                data.phone = '[REDACTED]';
              }
              if (data.refreshToken) {
                data.refreshToken = '[REDACTED]';
              }
              if (data.accessToken) {
                data.accessToken = '[REDACTED]';
              }
              
              // Only stringify if original was a string
              if (typeof event.request.data === 'string') {
                event.request.data = JSON.stringify(data);
              } else {
                event.request.data = data;
              }
            }
          }
          
          // Scrub query parameters
          if (event.request.query_string) {
            event.request.query_string = event.request.query_string.replace(
              /(phone|token|password|secret)=[^&]*/gi,
              '$1=[REDACTED]'
            );
          }
        }
        
        // Scrub user context
        if (event.user) {
          if (event.user.phone) {
            event.user.phone = '[REDACTED]';
          }
        }
        
        // Scrub tags
        if (event.tags) {
          if (event.tags.phone) {
            event.tags.phone = '[REDACTED]';
          }
        }
        
        return event;
      },
      
      // Filter out health check and static asset requests
      beforeSendTransaction(event) {
        // Don't track health check requests - check transaction name and patterns
        if (event.transaction === '/api/health') {
          return null;
        }
        
        // Check for health check patterns in transaction name
        if (event.transaction && /^GET\s+\/api\/health/.test(event.transaction)) {
          return null;
        }
        
        // Check request URL if available
        if (event.request?.url && event.request.url.includes('/api/health')) {
          return null;
        }
        
        // Check tags if available
        if (event.tags?.url && event.tags.url.includes('/api/health')) {
          return null;
        }
        
        // Don't track static asset requests
        if (event.transaction && event.transaction.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
          return null;
        }
        
        return event;
      },
    });

    isSentryInitialized = true;
    logger.info('Sentry initialized successfully');
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to initialize Sentry');
  }
}

/**
 * Get Sentry request handler middleware
 * @returns {Function} Express middleware or no-op
 */
function getSentryRequestHandler() {
  if (!isSentryInitialized) {
    return (req, res, next) => next();
  }
  return Sentry.Handlers.requestHandler();
}

/**
 * Get Sentry error handler middleware
 * @returns {Function} Express error handler or no-op
 */
function getSentryErrorHandler() {
  if (!isSentryInitialized) {
    return (err, req, res, next) => next(err);
  }
  return Sentry.Handlers.errorHandler();
}

/**
 * Capture exception with context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
function captureException(error, context = {}) {
  if (!isSentryInitialized) {
    return;
  }

  Sentry.withScope((scope) => {
    // Add correlation ID if available
    if (context.correlationId) {
      scope.setTag('correlationId', context.correlationId);
    }

    // Add user context
    if (context.userId) {
      scope.setUser({
        id: context.userId,
        role: context.role
      });
    }

    // Add request context
    if (context.path) {
      scope.setTag('path', context.path);
    }
    if (context.method) {
      scope.setTag('method', context.method);
    }

    // Add socket context if available
    if (context.socketId) {
      scope.setTag('socketId', context.socketId);
    }

    // Add extra context
    Object.keys(context).forEach(key => {
      if (!['correlationId', 'userId', 'role', 'path', 'method', 'socketId'].includes(key)) {
        scope.setExtra(key, context[key]);
      }
    });

    Sentry.captureException(error);
  });
}

/**
 * Capture message with level and context
 * @param {string} message - Message to capture
 * @param {string} level - Severity level (info, warning, error)
 * @param {Object} context - Additional context
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!isSentryInitialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.correlationId) {
      scope.setTag('correlationId', context.correlationId);
    }

    if (context.userId) {
      scope.setUser({
        id: context.userId,
        role: context.role
      });
    }

    Object.keys(context).forEach(key => {
      if (!['correlationId', 'userId', 'role'].includes(key)) {
        scope.setExtra(key, context[key]);
      }
    });

    Sentry.captureMessage(message, level);
  });
}

module.exports = {
  initSentry,
  getSentryRequestHandler,
  getSentryErrorHandler,
  captureException,
  captureMessage,
  Sentry // Export Sentry for advanced usage
};

