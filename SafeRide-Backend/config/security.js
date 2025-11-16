/**
 * Security configuration and helpers
 */

/**
 * Configure Helmet with explicit security headers
 */
function configureHelmet(helmet) {
  const isProduction = process.env.NODE_ENV === 'production';

  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    crossOriginEmbedderPolicy: false, // Disable for API
    crossOriginOpenerPolicy: {
      policy: 'same-origin'
    },
    crossOriginResourcePolicy: {
      policy: 'same-origin'
    }
  });
}

/**
 * Get CORS configuration
 */
function getCorsConfig() {
  const corsOrigin = process.env.CORS_ORIGIN;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!corsOrigin || corsOrigin === '*') {
      throw new Error('CORS_ORIGIN must be set to non-wildcard value in production');
    }
    const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
    return {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    };
  } else {
    // Development: allow wildcard or specific origins
    return corsOrigin && corsOrigin !== '*'
      ? { origin: corsOrigin.split(',').map(o => o.trim()) }
      : { origin: '*' };
  }
}

/**
 * Get Socket.io CORS configuration (should match Express CORS)
 */
function getSocketCorsConfig() {
  const corsOrigin = process.env.CORS_ORIGIN;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!corsOrigin || corsOrigin === '*') {
      throw new Error('CORS_ORIGIN must be set to non-wildcard value in production');
    }
    const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
    return {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true
    };
  } else {
    return corsOrigin && corsOrigin !== '*'
      ? { origin: corsOrigin.split(',').map(o => o.trim()), methods: ['GET', 'POST'] }
      : { origin: '*', methods: ['GET', 'POST'] };
  }
}

module.exports = {
  configureHelmet,
  getCorsConfig,
  getSocketCorsConfig
};
































