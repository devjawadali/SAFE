const crypto = require('crypto');
const {
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAccessToken,
  revokeAllUserTokens,
  generateRefreshToken
} = require('../../../services/tokenService');

// Mock the entire db/queries module
jest.mock('../../../db/queries', () => ({
  saveRefreshToken: jest.fn(),
  getRefreshToken: jest.fn(),
  deleteRefreshToken: jest.fn(),
  deleteUserRefreshTokens: jest.fn(),
  saveRevokedToken: jest.fn(),
  isTokenRevoked: jest.fn(),
  cleanupExpiredRefreshTokens: jest.fn(),
  cleanupExpiredRevokedTokens: jest.fn()
}));

const {
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  saveRevokedToken,
  isTokenRevoked
} = require('../../../db/queries');

// Mock jsonwebtoken for controlled tests
jest.mock('jsonwebtoken', () => {
  const actualJwt = jest.requireActual('jsonwebtoken');
  return {
    ...actualJwt,
    sign: jest.fn(actualJwt.sign),
    verify: jest.fn(actualJwt.verify),
    decode: jest.fn(actualJwt.decode)
  };
});

const jwt = require('jsonwebtoken');

describe('tokenService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore jwt mocks for isolation between tests
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('generateTokenPair', () => {
    test('Successfully generates access and refresh token pair', async () => {
      saveRefreshToken.mockResolvedValue();

      const user = { id: 1, phone: '+923001234567', role: 'passenger' };
      const result = await generateTokenPair(user);

      // Verify returned object has required properties
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresAt');

      // Verify accessToken is a valid JWT
      const decoded = jwt.decode(result.accessToken);
      expect(decoded).toBeTruthy();
      expect(decoded.userId).toBe(1);
      expect(decoded.phone).toBe('+923001234567');
      expect(decoded.role).toBe('passenger');
      expect(decoded.type).toBe('access');

      // Verify refreshToken is 128-character hex string
      expect(result.refreshToken).toMatch(/^[0-9a-f]{128}$/);

      // Verify saveRefreshToken was called with correct parameters
      expect(saveRefreshToken).toHaveBeenCalledTimes(1);
      expect(saveRefreshToken).toHaveBeenCalledWith(
        result.refreshToken,
        1,
        expect.any(Date)
      );

      // Verify expiresAt is approximately 7 days in the future (within 1 minute tolerance)
      const expectedExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000);
      const actualExpiry = result.expiresAt.getTime();
      const difference = Math.abs(actualExpiry - expectedExpiry);
      expect(difference).toBeLessThan(60 * 1000); // 1 minute tolerance
    });

    test('Throws error when database save fails', async () => {
      const dbError = new Error('Database connection failed');
      saveRefreshToken.mockRejectedValue(dbError);

      const user = { id: 1, phone: '+923001234567', role: 'passenger' };

      await expect(generateTokenPair(user)).rejects.toThrow('Database connection failed');
      expect(saveRefreshToken).toHaveBeenCalledTimes(1);
    });

    test('Uses custom expiry from environment variables', async () => {
      // Save original env
      const originalRefreshTokenExpiryDays = process.env.REFRESH_TOKEN_EXPIRY_DAYS;
      
      // Set new env value
      process.env.REFRESH_TOKEN_EXPIRY_DAYS = '30';
      
      // Reset modules to get fresh constants
      jest.resetModules();
      
      // Re-mock db/queries (using doMock which is not hoisted)
      jest.doMock('../../../db/queries', () => ({
        saveRefreshToken: jest.fn(),
        getRefreshToken: jest.fn(),
        deleteRefreshToken: jest.fn(),
        deleteUserRefreshTokens: jest.fn(),
        saveRevokedToken: jest.fn(),
        isTokenRevoked: jest.fn(),
        cleanupExpiredRefreshTokens: jest.fn(),
        cleanupExpiredRevokedTokens: jest.fn()
      }));
      
      // Re-mock jsonwebtoken (using doMock which is not hoisted)
      jest.doMock('jsonwebtoken', () => {
        const actualJwt = jest.requireActual('jsonwebtoken');
        return {
          ...actualJwt,
          sign: jest.fn(actualJwt.sign),
          verify: jest.fn(actualJwt.verify),
          decode: jest.fn(actualJwt.decode)
        };
      });
      
      // Re-require tokenService to get fresh constants
      const { generateTokenPair: generateTokenPairFresh } = require('../../../services/tokenService');
      const { saveRefreshToken: saveRefreshTokenFresh } = require('../../../db/queries');
      
      saveRefreshTokenFresh.mockResolvedValue();

      const user = { id: 1, phone: '+923001234567', role: 'passenger' };
      const result = await generateTokenPairFresh(user);

      // Verify expiresAt is 30 days in future
      const expectedExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000);
      const actualExpiry = result.expiresAt.getTime();
      const difference = Math.abs(actualExpiry - expectedExpiry);
      expect(difference).toBeLessThan(60 * 1000);
      
      // Restore env and reset modules
      if (originalRefreshTokenExpiryDays !== undefined) {
        process.env.REFRESH_TOKEN_EXPIRY_DAYS = originalRefreshTokenExpiryDays;
      } else {
        delete process.env.REFRESH_TOKEN_EXPIRY_DAYS;
      }
      jest.resetModules();
      
      // Re-mock and re-require for other tests
      jest.doMock('../../../db/queries', () => ({
        saveRefreshToken: jest.fn(),
        getRefreshToken: jest.fn(),
        deleteRefreshToken: jest.fn(),
        deleteUserRefreshTokens: jest.fn(),
        saveRevokedToken: jest.fn(),
        isTokenRevoked: jest.fn(),
        cleanupExpiredRefreshTokens: jest.fn(),
        cleanupExpiredRevokedTokens: jest.fn()
      }));
      jest.doMock('jsonwebtoken', () => {
        const actualJwt = jest.requireActual('jsonwebtoken');
        return {
          ...actualJwt,
          sign: jest.fn(actualJwt.sign),
          verify: jest.fn(actualJwt.verify),
          decode: jest.fn(actualJwt.decode)
        };
      });
    });
  });

  describe('verifyAccessToken', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

    test('Successfully verifies valid access token', async () => {
      isTokenRevoked.mockResolvedValue(false);
      // Reset jwt.verify to use real implementation
      jwt.verify.mockImplementation((token, secret) => {
        const actualJwt = jest.requireActual('jsonwebtoken');
        return actualJwt.verify(token, secret);
      });

      const token = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'access' },
        JWT_SECRET,
        { expiresIn: '30m' }
      );

      const decoded = await verifyAccessToken(token);

      expect(decoded).toHaveProperty('userId', 1);
      expect(decoded).toHaveProperty('phone', '+923001234567');
      expect(decoded).toHaveProperty('role', 'passenger');
      expect(decoded).toHaveProperty('type', 'access');

      // Verify isTokenRevoked was called with SHA-256 hash
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      expect(isTokenRevoked).toHaveBeenCalledWith(tokenHash);
    });

    test('Throws error for revoked token', async () => {
      isTokenRevoked.mockResolvedValue(true);

      const token = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'access' },
        JWT_SECRET,
        { expiresIn: '30m' }
      );

      await expect(verifyAccessToken(token)).rejects.toThrow('Token has been revoked');

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      expect(isTokenRevoked).toHaveBeenCalledWith(tokenHash);
      expect(jwt.verify).not.toHaveBeenCalled();
    });

    test('Throws error for expired token', async () => {
      isTokenRevoked.mockResolvedValue(false);

      // Create an actually expired token
      const expiredToken = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'access', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );

      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => {
        throw expiredError;
      });

      await expect(verifyAccessToken(expiredToken)).rejects.toThrow('Token expired');
    });

    test('Throws error for invalid token signature', async () => {
      isTokenRevoked.mockResolvedValue(false);

      const wrongSecretToken = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'access' },
        'wrong-secret',
        { expiresIn: '30m' }
      );

      const signatureError = new Error('invalid signature');
      jwt.verify.mockImplementation(() => {
        throw signatureError;
      });

      await expect(verifyAccessToken(wrongSecretToken)).rejects.toThrow('invalid signature');
    });

    test('Throws error for wrong token type', async () => {
      isTokenRevoked.mockResolvedValue(false);

      const refreshToken = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '30m' }
      );

      // Use real verify but it will return refresh type
      jwt.verify.mockImplementation((token, secret) => {
        const actualJwt = jest.requireActual('jsonwebtoken');
        return actualJwt.verify(token, secret);
      });

      await expect(verifyAccessToken(refreshToken)).rejects.toThrow('Invalid token type');
    });

    test('Throws error for malformed token', async () => {
      isTokenRevoked.mockResolvedValue(false);

      const malformedError = new Error('jwt malformed');
      jwt.verify.mockImplementation(() => {
        throw malformedError;
      });

      await expect(verifyAccessToken('not-a-valid-jwt')).rejects.toThrow('jwt malformed');
    });

    test('Handles database error when checking revocation', async () => {
      const dbError = new Error('Database error');
      isTokenRevoked.mockRejectedValue(dbError);

      const token = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'access' },
        JWT_SECRET,
        { expiresIn: '30m' }
      );

      // Reset jwt.verify to use real implementation
      jwt.verify.mockImplementation((token, secret) => {
        const actualJwt = jest.requireActual('jsonwebtoken');
        return actualJwt.verify(token, secret);
      });

      await expect(verifyAccessToken(token)).rejects.toThrow('Database error');
    });
  });

  describe('verifyRefreshToken', () => {
    test('Successfully verifies valid refresh token', async () => {
      const session = {
        userId: 1,
        expiresAt: new Date(Date.now() + 86400000)
      };
      getRefreshToken.mockResolvedValue(session);

      const result = await verifyRefreshToken('valid-refresh-token');

      expect(result).toEqual(session);
      expect(getRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    test('Throws error for non-existent refresh token', async () => {
      getRefreshToken.mockResolvedValue(null);

      await expect(verifyRefreshToken('invalid-token')).rejects.toThrow('Invalid refresh token');
      expect(getRefreshToken).toHaveBeenCalledWith('invalid-token');
    });

    test('Throws error and deletes expired refresh token', async () => {
      const expiredSession = {
        userId: 1,
        expiresAt: new Date(Date.now() - 86400000) // Past date
      };
      getRefreshToken.mockResolvedValue(expiredSession);
      deleteRefreshToken.mockResolvedValue();

      await expect(verifyRefreshToken('expired-token')).rejects.toThrow('Refresh token expired');

      expect(deleteRefreshToken).toHaveBeenCalledWith('expired-token');
    });

    test('Handles database error when fetching token', async () => {
      const dbError = new Error('Database connection failed');
      getRefreshToken.mockRejectedValue(dbError);

      await expect(verifyRefreshToken('token')).rejects.toThrow('Database connection failed');
    });
  });

  describe('revokeRefreshToken', () => {
    test('Successfully revokes refresh token', async () => {
      deleteRefreshToken.mockResolvedValue();

      await revokeRefreshToken('token-to-revoke');

      expect(deleteRefreshToken).toHaveBeenCalledWith('token-to-revoke');
    });

    test('Handles database error during revocation', async () => {
      const dbError = new Error('Database error');
      deleteRefreshToken.mockRejectedValue(dbError);

      await expect(revokeRefreshToken('token')).rejects.toThrow('Database error');
    });
  });

  describe('Refresh token rotation', () => {
    test('Rotates refresh token: revokes old token and generates new token pair', async () => {
      const userId = 1;
      const user = { id: userId, phone: '+923001234567', role: 'passenger' };
      const oldRefreshToken = 'old-refresh-token-123';
      
      // Mock successful verification of old refresh token
      const session = {
        userId: userId,
        expiresAt: new Date(Date.now() + 86400000) // Valid for 1 day
      };
      getRefreshToken.mockResolvedValue(session);
      
      // Mock successful revocation
      deleteRefreshToken.mockResolvedValue();
      
      // Mock successful token pair generation
      saveRefreshToken.mockResolvedValue();

      // Step 1: Verify the old refresh token succeeds
      const verifiedSession = await verifyRefreshToken(oldRefreshToken);
      expect(verifiedSession).toEqual(session);
      expect(getRefreshToken).toHaveBeenCalledWith(oldRefreshToken);

      // Step 2: Revoke the old refresh token
      await revokeRefreshToken(oldRefreshToken);
      expect(deleteRefreshToken).toHaveBeenCalledWith(oldRefreshToken);

      // Step 3: Generate new token pair for the same user
      const newTokenPair = await generateTokenPair(user);
      
      // Verify new token pair was generated
      expect(newTokenPair).toHaveProperty('accessToken');
      expect(newTokenPair).toHaveProperty('refreshToken');
      expect(newTokenPair).toHaveProperty('expiresAt');
      
      // Verify the new refresh token is different from the old one
      expect(newTokenPair.refreshToken).not.toBe(oldRefreshToken);
      
      // Verify saveRefreshToken was called with the new refresh token and correct user
      expect(saveRefreshToken).toHaveBeenCalledWith(
        newTokenPair.refreshToken,
        userId,
        expect.any(Date)
      );
      
      // Verify deleteRefreshToken was called with the old token
      expect(deleteRefreshToken).toHaveBeenCalledWith(oldRefreshToken);
    });
  });

  describe('revokeAccessToken', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

    test('Successfully revokes non-expired access token', async () => {
      saveRevokedToken.mockResolvedValue();

      const token = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'access' },
        JWT_SECRET,
        { expiresIn: '30m' }
      );

      await revokeAccessToken(token);

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      expect(tokenHash).toHaveLength(64); // SHA-256 hex is 64 chars

      const decoded = jwt.decode(token);
      const expiresAt = new Date(decoded.exp * 1000);

      expect(saveRevokedToken).toHaveBeenCalledWith(tokenHash, expiresAt);
    });

    test('Does not revoke already expired token', async () => {
      saveRevokedToken.mockResolvedValue();

      // Create an actually expired token
      const expiredToken = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'access', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );

      await revokeAccessToken(expiredToken);

      // Verify saveRevokedToken was NOT called (optimization - no need to store expired tokens)
      expect(saveRevokedToken).not.toHaveBeenCalled();
    });

    test('Handles invalid token gracefully', async () => {
      await revokeAccessToken('invalid-token');

      // Verify no error is thrown (best effort revocation)
      expect(saveRevokedToken).not.toHaveBeenCalled();
    });

    test('Handles database error gracefully', async () => {
      const dbError = new Error('Database error');
      saveRevokedToken.mockRejectedValue(dbError);

      const token = jwt.sign(
        { userId: 1, phone: '+923001234567', role: 'passenger', type: 'access' },
        JWT_SECRET,
        { expiresIn: '30m' }
      );

      // Verify no error is thrown (best effort - logs but doesn't fail)
      await expect(revokeAccessToken(token)).resolves.not.toThrow();
    });
  });

  describe('revokeAllUserTokens', () => {
    test('Successfully revokes all user tokens', async () => {
      deleteUserRefreshTokens.mockResolvedValue();

      await revokeAllUserTokens(123);

      expect(deleteUserRefreshTokens).toHaveBeenCalledWith(123);
    });

    test('Handles database error', async () => {
      const dbError = new Error('Database error');
      deleteUserRefreshTokens.mockRejectedValue(dbError);

      await expect(revokeAllUserTokens(123)).rejects.toThrow('Database error');
    });
  });

  describe('generateRefreshToken', () => {
    test('Generates unique random tokens', () => {
      const tokens = new Set();
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const token = generateRefreshToken();
        expect(token).toHaveLength(128);
        expect(token).toMatch(/^[0-9a-f]{128}$/);
        tokens.add(token);
      }

      // Verify all tokens are unique (no duplicates)
      expect(tokens.size).toBe(iterations);
    });
  });

  describe('Edge Cases and Security', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

    test('Token hash consistency', () => {
      const token = 'test-token-123';
      const hash1 = crypto.createHash('sha256').update(token).digest('hex');
      const hash2 = crypto.createHash('sha256').update(token).digest('hex');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    test('Concurrent token generation', async () => {
      saveRefreshToken.mockResolvedValue();

      const user = { id: 1, phone: '+923001234567', role: 'passenger' };

      const promises = Array.from({ length: 5 }, () => generateTokenPair(user));
      const results = await Promise.all(promises);

      // Verify all tokens are unique
      const refreshTokens = results.map(r => r.refreshToken);
      const uniqueTokens = new Set(refreshTokens);
      expect(uniqueTokens.size).toBe(5);

      // Verify all database calls completed
      expect(saveRefreshToken).toHaveBeenCalledTimes(5);
    });

    test('Environment variable defaults', async () => {
      // Save original env values
      const originalJwtSecret = process.env.JWT_SECRET;
      const originalAccessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY;
      const originalRefreshTokenExpiryDays = process.env.REFRESH_TOKEN_EXPIRY_DAYS;
      
      // Temporarily delete environment variables
      delete process.env.JWT_SECRET;
      delete process.env.ACCESS_TOKEN_EXPIRY;
      delete process.env.REFRESH_TOKEN_EXPIRY_DAYS;

      // Reset modules to get fresh constants with defaults
      jest.resetModules();
      
      // Re-mock db/queries (using doMock which is not hoisted)
      jest.doMock('../../../db/queries', () => ({
        saveRefreshToken: jest.fn(),
        getRefreshToken: jest.fn(),
        deleteRefreshToken: jest.fn(),
        deleteUserRefreshTokens: jest.fn(),
        saveRevokedToken: jest.fn(),
        isTokenRevoked: jest.fn(),
        cleanupExpiredRefreshTokens: jest.fn(),
        cleanupExpiredRevokedTokens: jest.fn()
      }));
      
      // Re-mock jsonwebtoken (using doMock which is not hoisted)
      jest.doMock('jsonwebtoken', () => {
        const actualJwt = jest.requireActual('jsonwebtoken');
        return {
          ...actualJwt,
          sign: jest.fn(actualJwt.sign),
          verify: jest.fn(actualJwt.verify),
          decode: jest.fn(actualJwt.decode)
        };
      });
      
      // Re-require tokenService to get fresh constants with defaults
      const { generateTokenPair: generateTokenPairFresh } = require('../../../services/tokenService');
      const { saveRefreshToken: saveRefreshTokenFresh } = require('../../../db/queries');

      saveRefreshTokenFresh.mockResolvedValue();

      const user = { id: 1, phone: '+923001234567', role: 'passenger' };
      const result = await generateTokenPairFresh(user);

      // Verify default values are used (30m access, 7 days refresh)
      const expectedExpiry = Date.now() + (7 * 24 * 60 * 60 * 1000);
      const actualExpiry = result.expiresAt.getTime();
      const difference = Math.abs(actualExpiry - expectedExpiry);
      expect(difference).toBeLessThan(60 * 1000);

      // Restore environment variables
      if (originalJwtSecret !== undefined) {
        process.env.JWT_SECRET = originalJwtSecret;
      }
      if (originalAccessTokenExpiry !== undefined) {
        process.env.ACCESS_TOKEN_EXPIRY = originalAccessTokenExpiry;
      }
      if (originalRefreshTokenExpiryDays !== undefined) {
        process.env.REFRESH_TOKEN_EXPIRY_DAYS = originalRefreshTokenExpiryDays;
      }
      
      // Reset modules and re-mock for other tests
      jest.resetModules();
      jest.doMock('../../../db/queries', () => ({
        saveRefreshToken: jest.fn(),
        getRefreshToken: jest.fn(),
        deleteRefreshToken: jest.fn(),
        deleteUserRefreshTokens: jest.fn(),
        saveRevokedToken: jest.fn(),
        isTokenRevoked: jest.fn(),
        cleanupExpiredRefreshTokens: jest.fn(),
        cleanupExpiredRevokedTokens: jest.fn()
      }));
      jest.doMock('jsonwebtoken', () => {
        const actualJwt = jest.requireActual('jsonwebtoken');
        return {
          ...actualJwt,
          sign: jest.fn(actualJwt.sign),
          verify: jest.fn(actualJwt.verify),
          decode: jest.fn(actualJwt.decode)
        };
      });
    });
  });
});

