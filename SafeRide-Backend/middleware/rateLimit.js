const { RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('../config/logger').logger;
const { logSecurityEvent } = require('../config/logger');

const isDev = process.env.NODE_ENV === 'development';

// Rate limiters for different endpoints
const authLimiter = new RateLimiterMemory({
  points: 5, // 5 requests
  duration: 15 * 60, // per 15 minutes
  blockDuration: 15 * 60 // block for 15 minutes
});

const otpLimiter = new RateLimiterMemory({
  points: isDev ? 10 : 3, // 10 OTP requests in dev, 3 in production
  duration: 15 * 60, // per 15 minutes
  blockDuration: 30 * 60 // block for 30 minutes on abuse
});

const apiLimiter = new RateLimiterMemory({
  points: 100, // 100 requests
  duration: 60 // per minute
});

// Message rate limiter (per user)
const messageLimiter = new RateLimiterMemory({
  points: 30, // 30 messages
  duration: 60 // per minute
});

// Call initiation limiter (per user)
const callLimiter = new RateLimiterMemory({
  points: 10, // 10 calls
  duration: 60 * 60 // per hour
});

// SOS limiter (per user)
const sosLimiter = new RateLimiterMemory({
  points: 5, // 5 SOS alerts
  duration: 60 * 60 // per hour
});

// Offer creation limiter (per user)
const offerLimiter = new RateLimiterMemory({
  points: 20, // 20 offers
  duration: 60 // per minute
});

// OTP verification failures (lockout)
const otpFailureLimiter = new RateLimiterMemory({
  points: 5, // 5 failures
  duration: 15 * 60, // per 15 minutes
  blockDuration: 60 * 60 // block for 1 hour
});

/**
 * Generic rate limiter middleware
 */
function createRateLimiter(limiter, keyGenerator = (req) => req.ip) {
  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      await limiter.consume(key);
      next();
    } catch (error) {
      if (error.remainingPoints !== undefined) {
        logSecurityEvent('rate_limit_exceeded', {
          key: keyGenerator(req),
          path: req.path,
          method: req.method
        });

        const retryAfter = Math.round(error.msBeforeNext / 1000);
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter,
          message: 'Please try again later'
        });
      }
      next(error);
    }
  };
}

/**
 * User-specific rate limiter (requires authentication)
 */
function createUserRateLimiter(limiter) {
  return createRateLimiter(limiter, (req) => {
    return req.user ? `user:${req.user.userId}` : req.ip;
  });
}

/**
 * Rate limit middleware for authentication
 */
const rateLimitAuth = createRateLimiter(authLimiter);

/**
 * Rate limit middleware for OTP requests
 */
const rateLimitOTP = createRateLimiter(otpLimiter, (req) => req.body?.phone || req.ip);

/**
 * Rate limit middleware for API endpoints
 */
const rateLimitAPI = createRateLimiter(apiLimiter);

/**
 * Rate limit middleware for messages (per user)
 */
const rateLimitMessage = createUserRateLimiter(messageLimiter);

/**
 * Rate limit middleware for calls (per user)
 */
const rateLimitCall = createUserRateLimiter(callLimiter);

/**
 * Rate limit middleware for SOS (per user)
 */
const rateLimitSOS = createUserRateLimiter(sosLimiter);

/**
 * Rate limit middleware for offers (per user)
 */
const rateLimitOffer = createUserRateLimiter(offerLimiter);

/**
 * Rate limit middleware for OTP verification failures
 */
const rateLimitOTPFailure = createRateLimiter(otpFailureLimiter, (req) => {
  return req.body?.phone || req.ip;
});

module.exports = {
  rateLimitAuth,
  rateLimitOTP,
  rateLimitAPI,
  rateLimitMessage,
  rateLimitCall,
  rateLimitSOS,
  rateLimitOffer,
  rateLimitOTPFailure,
  otpFailureLimiter
};



























