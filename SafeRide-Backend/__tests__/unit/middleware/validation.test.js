const { z } = require('zod');
const { validate, schemas } = require('../../../middleware/validation');

// Helper functions
function createMockRequest(body = {}, query = {}, params = {}) {
  return {
    body,
    query,
    params,
    path: '/api/test',
    method: 'POST'
  };
}

function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

function createMockNext() {
  return jest.fn();
}

describe('validation middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validate(schema) middleware factory', () => {
    test('Successfully validates valid request body', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
          age: z.number()
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({ name: 'John', age: 30 });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body).toEqual({ name: 'John', age: 30 });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('Successfully validates valid query parameters', () => {
      const schema = z.object({
        query: z.object({
          page: z.coerce.number(),
          limit: z.coerce.number()
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({}, { page: '1', limit: '10' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.query.page).toBe(1);
      expect(req.query.limit).toBe(10);
    });

    test('Successfully validates valid route params', () => {
      const schema = z.object({
        params: z.object({
          id: z.coerce.number()
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({}, {}, { id: '123' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.params.id).toBe(123);
    });

    test('Validates all three sources (body, query, params) together', () => {
      const schema = z.object({
        body: z.object({ name: z.string() }),
        query: z.object({ page: z.coerce.number() }),
        params: z.object({ id: z.coerce.number() })
      });
      const middleware = validate(schema);

      const req = createMockRequest(
        { name: 'John' },
        { page: '1' },
        { id: '123' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body.name).toBe('John');
      expect(req.query.page).toBe(1);
      expect(req.params.id).toBe(123);
    });

    test('Returns 400 for invalid body data', () => {
      const schema = z.object({
        body: z.object({
          email: z.string().email()
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({ email: 'not-an-email' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'body.email',
            message: expect.stringContaining('email')
          })
        ])
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('Returns 400 for missing required field', () => {
      const schema = z.object({
        body: z.object({
          name: z.string()
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'body.name',
            message: expect.any(String)
          })
        ])
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('Returns 400 for wrong data type', () => {
      const schema = z.object({
        body: z.object({
          age: z.number()
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({ age: 'twenty' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'body.age'
          })
        ])
      });
    });

    test('Returns multiple validation errors', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
          email: z.string().email(),
          age: z.number()
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.details).toHaveLength(3);
      expect(response.details.every(err => err.path && err.message)).toBe(true);
    });

    test('Formats error paths correctly', () => {
      const schema = z.object({
        body: z.object({
          user: z.object({
            name: z.string()
          })
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({ user: {} });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.details.some(err => err.path === 'body.user.name')).toBe(true);
    });

    test('Logs validation failures with request context', () => {
      const logger = require('../../../config/logger').logger;
      const schema = z.object({
        body: z.object({
          email: z.string().email()
        })
      });
      const middleware = validate(schema);

      const req = createMockRequest({ email: 'invalid' });
      req.path = '/api/test';
      req.method = 'POST';
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          validationErrors: expect.any(Array),
          path: '/api/test',
          method: 'POST'
        }),
        'Validation failed'
      );
    });

    test('Handles non-Zod errors by calling next(error)', () => {
      const schema = z.object({
        body: z.object({
          name: z.string()
        })
      });

      // Mock schema.parse to throw non-Zod error
      const originalParse = schema.parse;
      schema.parse = jest.fn(() => {
        throw new Error('Non-Zod error');
      });

      const middleware = validate(schema);
      const req = createMockRequest({ name: 'John' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.status).not.toHaveBeenCalled();

      // Restore original parse
      schema.parse = originalParse;
    });

    test('Preserves original request data when validation passes', () => {
      const schema = z.object({
        body: z.object({
          name: z.string()
        })
      });
      const middleware = validate(schema);

      const originalBody = { name: 'John', extra: 'data' };
      const req = createMockRequest(originalBody);
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(req.body).toHaveProperty('name', 'John');
    });

    test('Handles empty request objects gracefully', () => {
      const schema = z.object({
        body: z.object({}).optional()
      });
      const middleware = validate(schema);

      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Common validation schemas', () => {
    describe('schemas.phone', () => {
      test('Validates correct phone numbers', () => {
        const validPhones = ['+923001234567', '923001234567', '1234567890'];
        validPhones.forEach(phone => {
          expect(() => schemas.phone.parse(phone)).not.toThrow();
        });

        const invalidPhones = ['123', '12345678901234567', 'abc1234567', '+0001234567'];
        invalidPhones.forEach(phone => {
          expect(() => schemas.phone.parse(phone)).toThrow();
        });
      });
    });

    describe('schemas.otp', () => {
      test('Validates 6-digit OTP', () => {
        const validOtps = ['123456', '000000', '999999'];
        validOtps.forEach(otp => {
          expect(() => schemas.otp.parse(otp)).not.toThrow();
        });

        const invalidOtps = ['12345', '1234567', '12345a', '12 456'];
        invalidOtps.forEach(otp => {
          expect(() => schemas.otp.parse(otp)).toThrow();
        });
      });
    });

    describe('schemas.latitude', () => {
      test('Validates coordinate range', () => {
        const validLats = [-90, 0, 90, 45.5, -45.5];
        validLats.forEach(lat => {
          expect(() => schemas.latitude.parse(lat)).not.toThrow();
        });

        const invalidLats = [-91, 91, 180, '45.5'];
        invalidLats.forEach(lat => {
          expect(() => schemas.latitude.parse(lat)).toThrow();
        });
      });
    });

    describe('schemas.longitude', () => {
      test('Validates coordinate range', () => {
        const validLngs = [-180, 0, 180, 90.5, -90.5];
        validLngs.forEach(lng => {
          expect(() => schemas.longitude.parse(lng)).not.toThrow();
        });

        const invalidLngs = [-181, 181, '90'];
        invalidLngs.forEach(lng => {
          expect(() => schemas.longitude.parse(lng)).toThrow();
        });
      });
    });

    describe('schemas.price', () => {
      test('Validates positive numbers', () => {
        const validPrices = [1, 100.50, 0.01, 9999.99];
        validPrices.forEach(price => {
          expect(() => schemas.price.parse(price)).not.toThrow();
        });

        const invalidPrices = [0, -1, -100.50, '100'];
        invalidPrices.forEach(price => {
          expect(() => schemas.price.parse(price)).toThrow();
        });
      });
    });

    describe('schemas.rating', () => {
      test('Validates 1-5 integer range', () => {
        const validRatings = [1, 2, 3, 4, 5];
        validRatings.forEach(rating => {
          expect(() => schemas.rating.parse(rating)).not.toThrow();
        });

        const invalidRatings = [0, 6, 3.5, -1, '3'];
        invalidRatings.forEach(rating => {
          expect(() => schemas.rating.parse(rating)).toThrow();
        });
      });
    });

    describe('schemas.tripId', () => {
      test('Validates positive integers', () => {
        const validIds = [1, 100, 999999];
        validIds.forEach(id => {
          expect(() => schemas.tripId.parse(id)).not.toThrow();
        });

        const invalidIds = [0, -1, 1.5, '1'];
        invalidIds.forEach(id => {
          expect(() => schemas.tripId.parse(id)).toThrow();
        });
      });
    });

    describe('schemas.userId', () => {
      test('Validates positive integers', () => {
        const validIds = [1, 100, 999999];
        validIds.forEach(id => {
          expect(() => schemas.userId.parse(id)).not.toThrow();
        });

        const invalidIds = [0, -1, 1.5, '1'];
        invalidIds.forEach(id => {
          expect(() => schemas.userId.parse(id)).toThrow();
        });
      });
    });

    describe('schemas.pagination', () => {
      test('Validates and provides defaults', () => {
        // Test with valid values
        const validPagination = schemas.pagination.parse({ limit: '20', offset: '10' });
        expect(validPagination.limit).toBe(20);
        expect(validPagination.offset).toBe(10);

        // Test with missing values (defaults)
        const defaultPagination = schemas.pagination.parse({});
        expect(defaultPagination.limit).toBe(20);
        expect(defaultPagination.offset).toBe(0);

        // Test with invalid values
        expect(() => schemas.pagination.parse({ limit: '0', offset: '-1' })).toThrow();
        expect(() => schemas.pagination.parse({ limit: '101' })).toThrow(); // max is 100
      });
    });
  });

  describe('Real-world validation scenarios', () => {
    test('Trip creation validation', () => {
      const tripSchema = z.object({
        body: z.object({
          pickup_lat: schemas.latitude,
          pickup_lng: schemas.longitude,
          drop_lat: schemas.latitude,
          drop_lng: schemas.longitude,
          proposed_price: schemas.price
        })
      });
      const middleware = validate(tripSchema);

      // Valid trip data
      const validReq = createMockRequest({
        pickup_lat: 24.8607,
        pickup_lng: 67.0011,
        drop_lat: 24.9056,
        drop_lng: 67.0822,
        proposed_price: 500
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(validReq, res, next);
      expect(next).toHaveBeenCalledWith();

      // Invalid coordinates
      const invalidReq = createMockRequest({
        pickup_lat: 91, // Invalid
        pickup_lng: 67.0011,
        drop_lat: 24.9056,
        drop_lng: 67.0822,
        proposed_price: 500
      });
      const res2 = createMockResponse();
      const next2 = createMockNext();

      middleware(invalidReq, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(400);
    });

    test('OTP verification validation', () => {
      const otpSchema = z.object({
        body: z.object({
          phone: schemas.phone,
          otp: schemas.otp
        })
      });
      const middleware = validate(otpSchema);

      // Valid phone and OTP
      const validReq = createMockRequest({
        phone: '+923001234567',
        otp: '123456'
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(validReq, res, next);
      expect(next).toHaveBeenCalledWith();

      // Invalid phone format
      const invalidPhoneReq = createMockRequest({
        phone: '123',
        otp: '123456'
      });
      const res2 = createMockResponse();
      const next2 = createMockNext();

      middleware(invalidPhoneReq, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(400);

      // Invalid OTP format
      const invalidOtpReq = createMockRequest({
        phone: '+923001234567',
        otp: '12345'
      });
      const res3 = createMockResponse();
      const next3 = createMockNext();

      middleware(invalidOtpReq, res3, next3);
      expect(res3.status).toHaveBeenCalledWith(400);
    });

    test('Rating submission validation', () => {
      const ratingSchema = z.object({
        body: z.object({
          tripId: schemas.tripId,
          rating: schemas.rating,
          comment: z.string().optional()
        })
      });
      const middleware = validate(ratingSchema);

      // Valid rating with optional comment
      const validReq = createMockRequest({
        tripId: 1,
        rating: 5,
        comment: 'Great ride!'
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(validReq, res, next);
      expect(next).toHaveBeenCalledWith();

      // Valid rating without optional comment
      const validReqNoComment = createMockRequest({
        tripId: 1,
        rating: 4
      });
      const res2 = createMockResponse();
      const next2 = createMockNext();

      middleware(validReqNoComment, res2, next2);
      expect(next2).toHaveBeenCalledWith();

      // Invalid rating (0 or 6)
      const invalidRatingReq = createMockRequest({
        tripId: 1,
        rating: 0
      });
      const res3 = createMockResponse();
      const next3 = createMockNext();

      middleware(invalidRatingReq, res3, next3);
      expect(res3.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Edge Cases', () => {
    test('Handles undefined req.body/query/params', () => {
      const schema = z.object({
        body: z.object({}).optional(),
        query: z.object({}).optional(),
        params: z.object({}).optional()
      });
      const middleware = validate(schema);

      const req = {
        body: undefined,
        query: undefined,
        params: undefined,
        path: '/api/test',
        method: 'POST'
      };
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('Handles very large numbers', () => {
      const largeNumber = Number.MAX_SAFE_INTEGER;
      expect(() => schemas.tripId.parse(largeNumber)).not.toThrow();
      expect(() => schemas.userId.parse(largeNumber)).not.toThrow();
    });

    test('Handles special characters in strings', () => {
      // Phone schema with special characters
      expect(() => schemas.phone.parse('+92-300-1234567')).toThrow(); // Contains dashes
    });

    test('Concurrent validation calls', () => {
      const schema = z.object({
        body: z.object({
          name: z.string()
        })
      });

      const middleware1 = validate(schema);
      const middleware2 = validate(schema);

      const req1 = createMockRequest({ name: 'John' });
      const req2 = createMockRequest({ name: 'Jane' });
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const next1 = createMockNext();
      const next2 = createMockNext();

      middleware1(req1, res1, next1);
      middleware2(req2, res2, next2);

      expect(next1).toHaveBeenCalledWith();
      expect(next2).toHaveBeenCalledWith();
      expect(req1.body.name).toBe('John');
      expect(req2.body.name).toBe('Jane');
    });
  });
});


