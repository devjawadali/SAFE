const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  cleanupExpiredRefreshTokens,
  saveRevokedToken,
  isTokenRevoked,
  cleanupExpiredRevokedTokens
} = require('../db/queries');
const { logger } = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '30m'; // 15-30 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7; // 7-30 days

/**
 * Generate a new refresh token
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Generate access and refresh token pair
 */
async function generateTokenPair(user) {
  const accessToken = jwt.sign(
    { userId: user.id, phone: user.phone, role: user.role, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + (REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)); // Convert days to ms

  try {
    await saveRefreshToken(refreshToken, user.id, expiresAt);
  } catch (error) {
    logger.error({ error: error.message, userId: user.id }, 'Error saving refresh token');
    throw error;
  }

  return { accessToken, refreshToken, expiresAt };
}

/**
 * Verify access token and check revocation
 */
async function verifyAccessToken(token) {
  try {
    // Calculate SHA-256 hash of token for revocation check
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Check if token is revoked
    const isRevoked = await isTokenRevoked(tokenHash);
    if (isRevoked) {
      throw new Error('Token has been revoked');
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Ensure it's an access token
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    throw error;
  }
}

/**
 * Verify refresh token and check session
 */
async function verifyRefreshToken(refreshToken) {
  try {
    const session = await getRefreshToken(refreshToken);

    if (!session) {
      throw new Error('Invalid refresh token');
    }

    if (new Date() > new Date(session.expiresAt)) {
      await deleteRefreshToken(refreshToken);
      throw new Error('Refresh token expired');
    }

    return session;
  } catch (error) {
    logger.error({ error: error.message }, 'Error verifying refresh token');
    throw error;
  }
}

/**
 * Revoke refresh token (rotate on use)
 */
async function revokeRefreshToken(refreshToken) {
  try {
    await deleteRefreshToken(refreshToken);
  } catch (error) {
    logger.error({ error: error.message }, 'Error revoking refresh token');
    throw error;
  }
}

/**
 * Revoke access token (add to revocation list)
 */
async function revokeAccessToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      // Only add if not already expired
      const expiresAt = new Date(decoded.exp * 1000);
      if (expiresAt > new Date()) {
        // Calculate SHA-256 hash of token
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await saveRevokedToken(tokenHash, expiresAt);
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Error revoking access token');
    // Don't throw - token revocation is best effort
  }
}

/**
 * Revoke all tokens for a user (logout)
 */
async function revokeAllUserTokens(userId) {
  try {
    await deleteUserRefreshTokens(userId);
  } catch (error) {
    logger.error({ error: error.message, userId }, 'Error revoking all user tokens');
    throw error;
  }
}

/**
 * Clean up expired sessions (run periodically)
 */
async function cleanupExpiredSessions() {
  try {
    const refreshCount = await cleanupExpiredRefreshTokens();
    const revokedCount = await cleanupExpiredRevokedTokens();
    logger.debug({ refreshCount, revokedCount }, 'Cleaned up expired tokens');
  } catch (error) {
    logger.error({ error: error.message }, 'Error cleaning up expired sessions');
  }
}

// Run cleanup every hour (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
}

module.exports = {
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAccessToken,
  revokeAllUserTokens,
  generateRefreshToken
};

