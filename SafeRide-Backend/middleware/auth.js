const { verifyAccessToken, revokeAccessToken } = require('../services/tokenService');

/**
 * Authenticate token middleware
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = await verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.message === 'Token expired' || error.message === 'Token has been revoked') {
      return res.status(403).json({ error: error.message });
    }
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Authorize by role
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  authorize
};






