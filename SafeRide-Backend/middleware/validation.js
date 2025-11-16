const { z } = require('zod');
const logger = require('../config/logger').logger;

/**
 * Schema validation middleware
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      // Validate body, query, and params
      const data = {
        body: req.body || {},
        query: req.query || {},
        params: req.params || {}
      };

      const result = schema.parse(data);
      
      // Replace request data with validated data
      req.body = result.body || req.body;
      req.query = result.query || req.query;
      req.params = result.params || req.params;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }));

        logger.warn({
          validationErrors: errors,
          path: req.path,
          method: req.method
        }, 'Validation failed');

        return res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
      }
      next(error);
    }
  };
}

/**
 * Common validation schemas
 */
const schemas = {
  // Phone number validation
  phone: z.string().min(10).max(15).regex(/^\+?[1-9]\d{1,14}$/),
  
  // OTP validation
  otp: z.string().length(6).regex(/^\d{6}$/),
  
  // Coordinates
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  
  // Price
  price: z.number().positive(),
  
  // Rating
  rating: z.number().int().min(1).max(5),
  
  // Trip ID
  tripId: z.number().int().positive(),
  
  // User ID
  userId: z.number().int().positive(),
  
  // Pagination
  pagination: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0)
  })
};

module.exports = {
  validate,
  schemas
};
































