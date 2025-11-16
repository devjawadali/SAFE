const { authenticateToken, authorize } = require('../../../middleware/auth');

// Mock tokenService
jest.mock('../../../services/tokenService', () => ({
  verifyAccessToken: jest.fn(),
  revokeAccessToken: jest.fn()
}));

const { verifyAccessToken } = require('../../../services/tokenService');

// Helper functions
function createMockRequest(headers = {}, user = null) {
  return {
    headers,
    user: user || undefined
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

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    test('Successfully authenticates valid token', async () => {
      const decodedUser = {
        userId: 1,
        phone: '+923001234567',
        role: 'passenger',
        type: 'access'
      };
      verifyAccessToken.mockResolvedValue(decodedUser);

      const req = createMockRequest({ authorization: 'Bearer valid-token-here' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(verifyAccessToken).toHaveBeenCalledWith('valid-token-here');
      expect(req.user).toEqual(decodedUser);
      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('Returns 401 when Authorization header is missing', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(next).not.toHaveBeenCalled();
      expect(verifyAccessToken).not.toHaveBeenCalled();
    });

    test('Returns 401 when Authorization header is malformed (no Bearer)', async () => {
      const req = createMockRequest({ authorization: 'InvalidFormat token' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Returns 401 when Authorization header has no token', async () => {
      const req = createMockRequest({ authorization: 'Bearer ' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('Returns 403 for expired token', async () => {
      verifyAccessToken.mockRejectedValue(new Error('Token expired'));

      const req = createMockRequest({ authorization: 'Bearer expired-token' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Returns 403 for revoked token', async () => {
      verifyAccessToken.mockRejectedValue(new Error('Token has been revoked'));

      const req = createMockRequest({ authorization: 'Bearer revoked-token' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token has been revoked' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Returns 403 for invalid token signature', async () => {
      verifyAccessToken.mockRejectedValue(new Error('invalid signature'));

      const req = createMockRequest({ authorization: 'Bearer invalid-token' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Returns 403 for malformed JWT', async () => {
      verifyAccessToken.mockRejectedValue(new Error('jwt malformed'));

      const req = createMockRequest({ authorization: 'Bearer malformed-jwt' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Handles async errors from verifyAccessToken', async () => {
      verifyAccessToken.mockRejectedValue(new Error('Unexpected error'));

      const req = createMockRequest({ authorization: 'Bearer token' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    test('Allows access when user has required role (single role)', () => {
      const middleware = authorize('admin');
      const req = createMockRequest({}, { userId: 1, role: 'admin' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('Allows access when user has one of multiple required roles', () => {
      const middleware = authorize('admin', 'driver', 'passenger');
      const req = createMockRequest({}, { userId: 2, role: 'driver' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('Denies access when user role not in allowed roles', () => {
      const middleware = authorize('admin');
      const req = createMockRequest({}, { userId: 3, role: 'passenger' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Denies access when req.user is missing', () => {
      const middleware = authorize('admin');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Denies access when req.user.role is missing', () => {
      const middleware = authorize('admin');
      const req = createMockRequest({}, { userId: 1 });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Works with empty roles array (denies all)', () => {
      const middleware = authorize();
      const req = createMockRequest({}, { userId: 1, role: 'admin' });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });

    test('Case-sensitive role matching', () => {
      const middleware = authorize('Admin'); // capital A
      const req = createMockRequest({}, { userId: 1, role: 'admin' }); // lowercase
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Integration - authenticateToken + authorize chain', () => {
    test('Successful authentication and authorization chain', async () => {
      const adminUser = {
        userId: 1,
        phone: '+923001234567',
        role: 'admin',
        type: 'access'
      };
      verifyAccessToken.mockResolvedValue(adminUser);

      const req = createMockRequest({ authorization: 'Bearer valid-token' });
      const res = createMockResponse();
      const next = createMockNext();

      // Call authenticateToken first
      await authenticateToken(req, res, next);

      expect(req.user).toEqual(adminUser);
      expect(next).toHaveBeenCalledTimes(1);

      // Create authorize middleware for admin role
      const authorizeMiddleware = authorize('admin');
      const next2 = createMockNext();

      // Call authorize middleware
      authorizeMiddleware(req, res, next2);

      expect(next2).toHaveBeenCalledWith();
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('Authentication fails before authorization check', async () => {
      verifyAccessToken.mockRejectedValue(new Error('Token expired'));

      const req = createMockRequest({ authorization: 'Bearer invalid-token' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(req.user).toBeUndefined();

      // Authorization middleware should not be reached
      const authorizeMiddleware = authorize('admin');
      const next2 = createMockNext();
      authorizeMiddleware(req, res, next2);

      expect(res.status).toHaveBeenCalledTimes(2); // Once in auth, once in authorize
    });

    test('Authentication succeeds but authorization fails', async () => {
      const passengerUser = {
        userId: 2,
        phone: '+923001234567',
        role: 'passenger',
        type: 'access'
      };
      verifyAccessToken.mockResolvedValue(passengerUser);

      const req = createMockRequest({ authorization: 'Bearer valid-token' });
      const res = createMockResponse();
      const next = createMockNext();

      // Authentication succeeds
      await authenticateToken(req, res, next);

      expect(req.user).toEqual(passengerUser);
      expect(next).toHaveBeenCalledTimes(1);

      // Authorization fails (requires admin, user is passenger)
      const authorizeMiddleware = authorize('admin');
      const next2 = createMockNext();
      authorizeMiddleware(req, res, next2);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next2).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('Multiple authorization checks with different roles', () => {
      const req1 = createMockRequest({}, { userId: 1, role: 'admin' });
      const req2 = createMockRequest({}, { userId: 2, role: 'driver' });
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const next1 = createMockNext();
      const next2 = createMockNext();

      const adminMiddleware = authorize('admin');
      const driverMiddleware = authorize('driver');

      adminMiddleware(req1, res1, next1);
      driverMiddleware(req2, res2, next2);

      expect(next1).toHaveBeenCalledWith();
      expect(next2).toHaveBeenCalledWith();
      expect(res1.status).not.toHaveBeenCalled();
      expect(res2.status).not.toHaveBeenCalled();
    });

    test('Authorization with null/undefined role', () => {
      const middleware = authorize('admin');
      const req = createMockRequest({}, { userId: 1, role: null });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
    });

    test('Token with special characters in Authorization header', async () => {
      const decodedUser = {
        userId: 1,
        phone: '+923001234567',
        role: 'passenger',
        type: 'access'
      };
      verifyAccessToken.mockResolvedValue(decodedUser);

      const req = createMockRequest({ authorization: 'Bearer token-with-special-chars-123' });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticateToken(req, res, next);

      expect(verifyAccessToken).toHaveBeenCalledWith('token-with-special-chars-123');
      expect(next).toHaveBeenCalledWith();
    });
  });
});


