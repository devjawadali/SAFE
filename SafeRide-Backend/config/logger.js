const pino = require('pino');

const isDevelopment = process.env.NODE_ENV === 'development';

// Create logger instance
const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined, // JSON output in production
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    }
  }
});

// Generate correlation ID for requests
function generateCorrelationId() {
  return require('crypto').randomBytes(16).toString('hex');
}

// Request logging middleware
function requestLogger(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  const startTime = Date.now();

  // Log request
  logger.info({
    correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  }, 'Incoming request');

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    }, 'Request completed');
  });

  next();
}

// Security event logger
function logSecurityEvent(event, details = {}) {
  logger.warn({
    event,
    ...details,
    timestamp: new Date().toISOString()
  }, 'Security event');
}

// Audit logger
function logAuditEvent(action, userId, details = {}) {
  logger.info({
    action,
    userId,
    ...details,
    timestamp: new Date().toISOString()
  }, 'Audit event');
}

module.exports = {
  logger,
  requestLogger,
  logSecurityEvent,
  logAuditEvent,
  generateCorrelationId
};
























