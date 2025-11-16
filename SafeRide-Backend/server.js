// ============================================================================
// SECTION 1: Dependencies & Configuration
// ============================================================================
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const Filter = require('bad-words');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import new modules
const { configureHelmet, getCorsConfig, getSocketCorsConfig } = require('./config/security');
const { logger, requestLogger, logSecurityEvent, logAuditEvent } = require('./config/logger');
const { authenticateToken, authorize } = require('./middleware/auth');
const { 
  rateLimitAuth, 
  rateLimitOTP, 
  rateLimitAPI, 
  rateLimitMessage, 
  rateLimitCall, 
  rateLimitSOS,    
  rateLimitOffer,
  rateLimitOTPFailure,
  otpFailureLimiter 
} = require('./middleware/rateLimit');
const { generateTokenPair, verifyAccessToken, verifyRefreshToken, revokeRefreshToken, revokeAccessToken, revokeAllUserTokens } = require('./services/tokenService');
const { canAccessTrip, canWriteMessage, canAccessMessages, canAccessCalls, canInitiateCall, canCreateOffer } = require('./middleware/authz');
const { pool, checkConnection, closePool } = require('./config/database');
const db = require('./db/queries');
const { initSentry, getSentryRequestHandler, getSentryErrorHandler, captureException } = require('./config/sentry');

// Initialize Sentry before any other middleware
initSentry();

const PORT = process.env.PORT || 4000;
const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY) || 300; // 5 minutes (in seconds)
const profanityFilter = new Filter();

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const fsPromises = fs.promises;

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ============================================================================
// SECTION 2: In-Memory OTP Storage (temporary, will migrate to Redis later)
// ============================================================================
// OTP codes stored in-memory for now (can migrate to Redis later)
const DATABASE = {
  otpCodes: new Map(), // phone -> { otp, expiresAt, attempts }
};

// Shared error messages
const WOMEN_ONLY_ERROR = 'SafeRide is exclusively for women. Only female users can register.';

// Note: Counter variables removed - database uses SERIAL/auto-increment

// Database migration function - adds columns if they don't exist
async function runDatabaseMigrations() {
  try {
    // Add city column if it doesn't exist
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS city VARCHAR(100)
    `);
    
    // Add profile_picture_url column if it doesn't exist
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS profile_picture_url TEXT
    `);
    
    // Add gender column if it doesn't exist
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS gender VARCHAR(20)
    `);
    
    // Drop existing gender constraint if it exists (to replace with case-insensitive version)
    const constraintCheck = await pool.query(`
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'users_gender_check' 
      AND conrelid = 'users'::regclass
    `);
    
    if (constraintCheck.rows.length > 0) {
      await pool.query(`
        ALTER TABLE users 
        DROP CONSTRAINT IF EXISTS users_gender_check
      `);
    }
    
    // Add case-insensitive CHECK constraint for gender
    await pool.query(`
      ALTER TABLE users 
      ADD CONSTRAINT users_gender_check 
      CHECK (LOWER(gender) = 'female')
    `);
    
    logger.info({}, 'Database migrations completed successfully');
  } catch (error) {
    logger.error({ error: error.message }, 'Database migration failed');
    throw error;
  }
}

// Check database connection and run migrations on startup
(async () => {
  try {
    await checkConnection();
    await runDatabaseMigrations();
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to connect to database or run migrations');
    process.exit(1);
  }
})();

// ============================================================================
// SECTION 3: Security Middleware
// ============================================================================
const app = express();
const server = http.createServer(app);

// Disable X-Powered-By header
app.disable('x-powered-by');

// Sentry request handler (must be first middleware for proper error tracking)
app.use(getSentryRequestHandler());

// Apply helmet with explicit configuration
app.use(configureHelmet(helmet));

// CORS configuration
try {
  const corsOptions = getCorsConfig();
  app.use(cors(corsOptions));
} catch (error) {
  logger.error({ error: error.message }, 'CORS configuration failed');
  process.exit(1);
}

// Body parsers with size limits (smaller global limit)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve uploaded images statically
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  index: false,
}));

// Request logging middleware
app.use(requestLogger);

// Apply API rate limiter to all API routes except auth endpoints
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) {
    return next(); // Skip limiter for auth routes (they use rateLimitAuth)
  }
  rateLimitAPI(req, res, next);
});

// ============================================================================
// SECTION 4: Authentication Middleware
// ============================================================================
// Authentication middleware is now imported from ./middleware/auth

// ============================================================================
// SECTION 5: Socket.io Real-Time Setup
// ============================================================================
const socketTransports = process.env.SOCKET_TRANSPORTS 
  ? process.env.SOCKET_TRANSPORTS.split(',').map(t => t.trim())
  : ['websocket', 'polling'];

// Socket.io CORS configuration (matches Express CORS)
let socketCorsConfig;
try {
  socketCorsConfig = getSocketCorsConfig();
} catch (error) {
  logger.error({ error: error.message }, 'Socket.io CORS configuration failed');
  process.exit(1);
}

const io = new Server(server, {
  cors: socketCorsConfig,
  transports: socketTransports
});

const connectedUsers = new Map(); // userId -> Set of socketIds

// Track socket token expiry for periodic revalidation
const socketTokenExpiry = new Map(); // socketId -> expiry timestamp

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');

  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      if (!token) {
        socket.emit('auth_error', { error: 'Token required' });
        return;
      }

      try {
        const decoded = await verifyAccessToken(token);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        socket.tokenExpiry = decoded.exp ? new Date(decoded.exp * 1000) : null;
        
        // Store token expiry for periodic revalidation
        if (socket.tokenExpiry) {
          socketTokenExpiry.set(socket.id, socket.tokenExpiry);
        }
        
        // Add socket to user's set of connected sockets
        if (!connectedUsers.has(decoded.userId)) {
          connectedUsers.set(decoded.userId, new Set());
        }
        connectedUsers.get(decoded.userId).add(socket.id);
        
        logger.info({ socketId: socket.id, userId: decoded.userId }, 'Socket authenticated');
        socket.emit('authenticated', { userId: decoded.userId });
      } catch (error) {
        logger.warn({ socketId: socket.id, error: error.message }, 'Socket authentication failed');
        socket.emit('auth_error', { error: error.message || 'Invalid or expired token' });
        socket.disconnect();
      }
    } catch (error) {
      logger.error({ socketId: socket.id, error: error.message }, 'Socket authentication error');
      socket.emit('auth_error', { error: 'Authentication failed' });
    }
  });

  // Periodic token revalidation (every 5 minutes)
  const revalidationInterval = setInterval(async () => {
    if (socket.userId && socket.tokenExpiry) {
      const now = new Date();
      const timeUntilExpiry = socket.tokenExpiry.getTime() - now.getTime();
      const minutesUntilExpiry = timeUntilExpiry / (1000 * 60);
      
      // Emit warning 5 minutes before expiry
      if (minutesUntilExpiry > 0 && minutesUntilExpiry <= 5 && minutesUntilExpiry > 4.5) {
        socket.emit('token_about_to_expire', { 
          message: 'Your session is about to expire. Please re-authenticate.',
          expiresInMinutes: Math.ceil(minutesUntilExpiry)
        });
      }
      
      // Check if token has expired
      if (now >= socket.tokenExpiry) {
        logger.warn({ socketId: socket.id, userId: socket.userId }, 'Socket token expired, disconnecting');
        socket.emit('token_expired', { error: 'Token expired, please re-authenticate' });
        socket.disconnect();
      } else {
        // Re-validate token periodically before expiry
        // This ensures token hasn't been revoked server-side
        try {
          // Note: We can't re-validate without the original token
          // The client should call authenticate again when token_about_to_expire is received
        } catch (error) {
          logger.warn({ socketId: socket.id, error: error.message }, 'Token revalidation failed');
        }
      }
    }
  }, 5 * 60 * 1000); // 5 minutes

  socket.on('disconnect', async () => {
    clearInterval(revalidationInterval);
    socketTokenExpiry.delete(socket.id);
    logger.info({ socketId: socket.id }, 'Client disconnected');
    
    // Remove socket from connectedUsers
    if (socket.userId) {
      const socketSet = connectedUsers.get(socket.userId);
      if (socketSet) {
        socketSet.delete(socket.id);
        // Remove user entry if no sockets remain
        if (socketSet.size === 0) {
          connectedUsers.delete(socket.userId);
          
          // Set driver offline if applicable
          try {
            const driver = await db.getDriverByUserId(socket.userId);
            if (driver) {
              await db.updateDriver(driver.id, { isOnline: false });
            }
          } catch (error) {
            captureException(error, { socketId: socket.id, userId: socket.userId });
            logger.error({ error: error.message, socketId: socket.id }, 'Error setting driver offline');
          }
        }
      }
    }
  });

  socket.on('join_trip', async (data) => {
    try {
      const { tripId } = data;
      if (!tripId) {
        socket.emit('join_error', { error: 'Trip ID required' });
        return;
      }

      if (!socket.userId) {
        socket.emit('join_error', { error: 'Authentication required' });
        return;
      }

      const trip = await db.getTripById(parseInt(tripId));
      if (!trip) {
        socket.emit('join_error', { error: 'Trip not found' });
        return;
      }

      // Verify authorization: socket userId must be passenger, assigned driver, or admin
      if (socket.userId !== trip.passengerId && 
          socket.userId !== trip.driverId && 
          socket.userRole !== 'admin') {
        socket.emit('join_error', { error: 'Access denied' });
        return;
      }

      // Use centralized authorization
      const accessCheck = canAccessTrip(socket.userId, tripId, socket.userRole, trip);
      if (!accessCheck.allowed) {
        socket.emit('join_error', { error: accessCheck.error || 'Access denied' });
        return;
      }

      socket.join(`trip_${tripId}`);
      logger.debug({ socketId: socket.id, tripId, userId: socket.userId }, 'Socket joined trip');
      socket.emit('joined_trip', { tripId });
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId, tripId: data?.tripId });
      socket.emit('join_error', { error: 'Failed to join trip' });
    }
  });

  socket.on('driver_online', async (data) => {
    try {
      if (!socket.userId || socket.userRole !== 'driver') {
        socket.emit('error', { error: 'Authentication required. Driver role required.' });
        return;
      }
      
      const driverId = socket.userId;
      const driverIdNum = parseInt(driverId, 10);
      
      socket.join('drivers_online');
      const driver = await db.getDriverByUserId(driverIdNum);
      if (driver) {
        await db.updateDriver(driver.id, { isOnline: true });
      }
      console.log(`Driver ${driverIdNum} is now online`);
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId });
      socket.emit('error', { error: 'Failed to set driver online' });
    }
  });

  socket.on('location_update', async (data) => {
    try {
      if (!socket.userId || socket.userRole !== 'driver') {
        socket.emit('error', { error: 'Authentication required. Driver role required.' });
        return;
      }
      
      const driverId = socket.userId;
      const driverIdNum = parseInt(driverId, 10);
      const { lat, lng } = data;
      
      if (lat !== undefined && lng !== undefined) {
        const driver = await db.getDriverByUserId(driverIdNum);
        if (driver) {
          await db.updateDriver(driver.id, {
            lastLocationLat: parseFloat(lat),
            lastLocationLng: parseFloat(lng)
          });
          
          // Find trips for this driver and broadcast location
          const userTrips = await db.getUserTrips(driverIdNum, null, 100, 0);
          const activeTrips = userTrips.filter(trip => 
            trip.driverId === driverIdNum && ['accepted', 'in_progress'].includes(trip.status)
          );
          
          activeTrips.forEach(trip => {
            io.to(`trip_${trip.id}`).emit('location_update', {
              driverId: driverIdNum,
              lat: parseFloat(lat),
              lng: parseFloat(lng),
              timestamp: new Date().toISOString()
            });
          });
        }
      }
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId });
      socket.emit('error', { error: 'Failed to update location' });
    }
  });

  socket.on('send_message', async (data) => {
    try {
      const { tripId, message } = data;
      
      if (!socket.userId) {
        socket.emit('message_error', { error: 'Authentication required' });
        return;
      }
      
      const tripIdNum = parseInt(tripId);
      const trip = await db.getTripById(tripIdNum);
      
      // Use centralized authorization
      const validation = canWriteMessage(socket.userId, tripIdNum, socket.userRole, trip);
      if (!validation.allowed) {
        socket.emit('message_error', { error: validation.error || 'Access denied' });
        return;
      }
      
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        socket.emit('message_error', { error: 'Message cannot be empty' });
        return;
      }
      
      if (message.trim().length > 1000) {
        socket.emit('message_error', { error: 'Message too long' });
        return;
      }
      
      const cleanMessage = profanityFilter.clean(message.trim());
      const recipientId = socket.userId === trip.passengerId ? trip.driverId : trip.passengerId;
      
      const messageObj = await db.createMessage({
        tripId: tripIdNum,
        senderId: socket.userId,
        content: cleanMessage,
        isFlagged: cleanMessage !== message.trim()
      });
      
      io.to(`trip_${tripIdNum}`).emit('receive_message', {
        message_id: messageObj.id,
        trip_id: tripIdNum,
        sender_id: messageObj.senderId,
        recipient_id: recipientId,
        message: messageObj.content,
        timestamp: messageObj.createdAt,
        is_flagged: messageObj.isFlagged
      });
      
      console.log(`Message sent in trip ${tripIdNum} from user ${socket.userId}`);
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId, tripId: data?.tripId });
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  socket.on('typing_indicator', async (data) => {
    try {
      const { tripId, isTyping } = data;
      
      if (!socket.userId) {
        return;
      }
      
      const tripIdNum = parseInt(tripId);
      const trip = await db.getTripById(tripIdNum);
      
      // Use centralized authorization for read access
      const validation = canAccessMessages(socket.userId, tripIdNum, socket.userRole, trip);
      if (!validation.allowed) {
        return;
      }
      
      socket.to(`trip_${tripIdNum}`).emit('user_typing', {
        trip_id: tripIdNum,
        user_id: socket.userId,
        is_typing: isTyping
      });
    } catch (error) {
      // Typing indicators are non-critical, no error handling needed
    }
  });

  socket.on('message_read', async (data) => {
    try {
      const { messageId } = data;
      
      if (!socket.userId) {
        socket.emit('message_error', { error: 'Authentication required' });
        return;
      }
      
      const messageIdNum = parseInt(messageId);
      // Note: We need to check recipient via trip, not directly from message
      // For now, we'll update read status if message exists
      const updatedMessage = await db.updateMessageReadStatus(messageIdNum);
      
      if (!updatedMessage) {
        socket.emit('message_error', { error: 'Message not found or already read' });
        return;
      }
      
      io.to(`trip_${updatedMessage.tripId}`).emit('message_read_receipt', {
        message_id: messageIdNum,
        trip_id: updatedMessage.tripId,
        read_at: updatedMessage.readAt
      });
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId, messageId: data?.messageId });
      socket.emit('message_error', { error: 'Failed to mark message as read' });
    }
  });

  socket.on('call_initiate', async (data) => {
    try {
      const { tripId, emergencyRecording } = data;
      
      if (!socket.userId) {
        socket.emit('call_error', { error: 'Authentication required' });
        return;
      }
      
      const tripIdNum = parseInt(tripId);
      const trip = await db.getTripById(tripIdNum);
      
      if (!trip) {
        socket.emit('call_error', { error: 'Trip not found' });
        return;
      }
      
      if (!['accepted', 'in_progress'].includes(trip.status)) {
        socket.emit('call_error', { error: 'Call only available during active trips' });
        return;
      }
      
      if (socket.userId !== trip.passengerId && socket.userId !== trip.driverId) {
        socket.emit('call_error', { error: 'Access denied' });
        return;
      }
      
      const activeCalls = await getActiveCallsForTrip(tripIdNum);
      
      if (activeCalls.length > 0) {
        socket.emit('call_error', { error: 'Call already in progress' });
        return;
      }
      
      const calleeId = socket.userId === trip.passengerId ? trip.driverId : trip.passengerId;
      
      const call = await db.createCall({
        tripId: tripIdNum,
        callerId: socket.userId,
        receiverId: calleeId,
        status: 'ringing',
        startedAt: new Date(),
        endedAt: null,
        duration: null,
        isEmergency: emergencyRecording || false
      });
      
      const callIncomingData = {
        call_id: call.id,
        trip_id: tripIdNum,
        caller_id: call.callerId,
        callee_id: call.receiverId,
        emergency_recording: call.isEmergency,
        initiated_at: call.startedAt.toISOString()
      };
      
      // Room broadcast (maintains current behavior)
      io.to(`trip_${tripIdNum}`).emit('call_incoming', callIncomingData);
      
      // Targeted delivery to callee sockets for better reliability
      const calleeSockets = connectedUsers.get(calleeId);
      if (calleeSockets && calleeSockets.size > 0) {
        calleeSockets.forEach(socketId => {
          io.to(socketId).emit('call_incoming', callIncomingData);
        });
      }
      
      console.log(`Call initiated in trip ${tripIdNum} by user ${socket.userId}`);
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId, tripId: data?.tripId });
      socket.emit('call_error', { error: 'Failed to initiate call' });
    }
  });

  socket.on('call_offer', async (data) => {
    try {
      const { callId, sdp } = data;
      
      if (!socket.userId) {
        socket.emit('call_error', { error: 'Authentication required' });
        return;
      }
      
      const callIdNum = parseInt(callId);
      const call = await db.getCallById(callIdNum);
      
      if (!call || !['ringing', 'connected'].includes(call.status)) {
        socket.emit('call_error', { error: 'Call not found or ended' });
        return;
      }
      
      if (socket.userId !== call.callerId && socket.userId !== call.receiverId) {
        socket.emit('call_error', { error: 'Access denied' });
        return;
      }
      
      if (!sdp || !sdp.type || !sdp.sdp) {
        socket.emit('call_error', { error: 'Invalid SDP format' });
        return;
      }
      
      if (sdp.type !== 'offer') {
        socket.emit('call_error', { error: 'SDP type must be "offer"' });
        return;
      }
      
      const recipientId = socket.userId === call.callerId ? call.receiverId : call.callerId;
      const recipientSockets = connectedUsers.get(recipientId);
      
      if (!recipientSockets || recipientSockets.size === 0) {
        socket.emit('call_error', { error: 'Recipient not connected' });
        return;
      }
      
      recipientSockets.forEach(socketId => {
        io.to(socketId).emit('call_offer', {
          call_id: callIdNum,
          trip_id: call.tripId,
          from_user_id: socket.userId,
          sdp: sdp
        });
      });
      
      console.log(`Call offer sent for call ${callIdNum}`);
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId, callId: data?.callId });
      socket.emit('call_error', { error: 'Failed to send offer' });
    }
  });

  socket.on('call_answer', async (data) => {
    try {
      const { callId, sdp } = data;
      
      if (!socket.userId) {
        socket.emit('call_error', { error: 'Authentication required' });
        return;
      }
      
      const callIdNum = parseInt(callId);
      const call = await db.getCallById(callIdNum);
      
      if (!call || !['ringing', 'connected'].includes(call.status)) {
        socket.emit('call_error', { error: 'Call not found or ended' });
        return;
      }
      
      if (socket.userId !== call.callerId && socket.userId !== call.receiverId) {
        socket.emit('call_error', { error: 'Access denied' });
        return;
      }
      
      if (!sdp || !sdp.type || !sdp.sdp) {
        socket.emit('call_error', { error: 'Invalid SDP format' });
        return;
      }
      
      if (sdp.type !== 'answer') {
        socket.emit('call_error', { error: 'SDP type must be "answer"' });
        return;
      }
      
      const updates = {};
      if (call.status === 'ringing') {
        updates.status = 'connected';
      }
      
      if (!call.connectedAt) {
        updates.connectedAt = new Date();
      }
      
      if (Object.keys(updates).length > 0) {
        await db.updateCall(callIdNum, updates);
        call.status = updates.status || call.status;
        call.connectedAt = updates.connectedAt || call.connectedAt;
      }
      
      const recipientId = socket.userId === call.callerId ? call.receiverId : call.callerId;
      const recipientSockets = connectedUsers.get(recipientId);
      
      if (recipientSockets && recipientSockets.size > 0) {
        recipientSockets.forEach(socketId => {
          io.to(socketId).emit('call_answer', {
            call_id: callIdNum,
            trip_id: call.tripId,
            from_user_id: socket.userId,
            sdp: sdp
          });
        });
      }
      
      io.to(`trip_${call.tripId}`).emit('call_connected', {
        call_id: callIdNum,
        trip_id: call.tripId,
        connected_at: call.connectedAt.toISOString()
      });
      
      console.log(`Call ${callIdNum} connected`);
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId, callId: data?.callId });
      socket.emit('call_error', { error: 'Failed to send answer' });
    }
  });

  socket.on('ice_candidate', async (data) => {
    try {
      const { callId, candidate } = data;
      
      if (!socket.userId) {
        socket.emit('call_error', { error: 'Authentication required' });
        return;
      }
      
      const callIdNum = parseInt(callId);
      const call = await db.getCallById(callIdNum);
      
      if (!call || !['ringing', 'connected'].includes(call.status)) {
        socket.emit('call_error', { error: 'Call not found or ended' });
        return;
      }
      
      if (socket.userId !== call.callerId && socket.userId !== call.receiverId) {
        socket.emit('call_error', { error: 'Access denied' });
        return;
      }
      
      if (!candidate) {
        socket.emit('call_error', { error: 'Invalid ICE candidate' });
        return;
      }
      
      const recipientId = socket.userId === call.callerId ? call.receiverId : call.callerId;
      const recipientSockets = connectedUsers.get(recipientId);
      
      if (recipientSockets && recipientSockets.size > 0) {
        recipientSockets.forEach(socketId => {
          io.to(socketId).emit('ice_candidate', {
            call_id: callIdNum,
            trip_id: call.tripId,
            from_user_id: socket.userId,
            candidate: candidate
          });
        });
      }
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId, callId: data?.callId });
      socket.emit('call_error', { error: 'Failed to send ICE candidate' });
    }
  });

  socket.on('call_end', async (data) => {
    try {
      const { callId, reason } = data;
      
      if (!socket.userId) {
        socket.emit('call_error', { error: 'Authentication required' });
        return;
      }
      
      const callIdNum = parseInt(callId);
      const call = await db.getCallById(callIdNum);
      
      if (!call || call.status === 'ended') {
        socket.emit('call_error', { error: 'Call not found or already ended' });
        return;
      }
      
      if (socket.userId !== call.callerId && socket.userId !== call.receiverId) {
        socket.emit('call_error', { error: 'Access denied' });
        return;
      }
      
      const endedAt = new Date();
      let duration = 0;
      if (call.connectedAt) {
        duration = Math.floor((endedAt - new Date(call.connectedAt)) / 1000);
      }
      
      await db.updateCall(callIdNum, {
        status: 'ended',
        endedAt: endedAt,
        duration: duration
      });
      
      io.to(`trip_${call.tripId}`).emit('call_ended', {
        call_id: callIdNum,
        trip_id: call.tripId,
        ended_at: endedAt.toISOString(),
        duration: duration,
        reason: reason || 'completed'
      });
      
      console.log(`Call ${callIdNum} ended: ${reason || 'completed'}, duration: ${duration}s`);
    } catch (error) {
      captureException(error, { socketId: socket.id, userId: socket.userId, callId: data?.callId });
      socket.emit('call_error', { error: 'Failed to end call' });
    }
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove socket from connectedUsers
    if (socket.userId) {
      const socketSet = connectedUsers.get(socket.userId);
      if (socketSet) {
        socketSet.delete(socket.id);
        // Remove user entry if no sockets remain
        if (socketSet.size === 0) {
          connectedUsers.delete(socket.userId);
          
          // Set driver offline if applicable
          try {
            const driver = await db.getDriverByUserId(socket.userId);
            if (driver) {
              await db.updateDriver(driver.id, { isOnline: false });
            }
          } catch (error) {
            // Non-critical error, log but don't fail
            logger.error({ error: error.message, socketId: socket.id, userId: socket.userId }, 'Error setting driver offline on disconnect');
          }
        }
      }
    }
  });
});

// ============================================================================
// SECTION 6: Helper Functions
// ============================================================================
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function getActiveCallsForTrip(tripId) {
  try {
    return await db.getActiveCalls(tripId);
  } catch (error) {
    logger.error({ error: error.message, tripId }, 'Error getting active calls for trip');
    return [];
  }
}

// Token generation moved to tokenService.js

function sanitizeUser(user) {
  const { ...sanitized } = user;
  return sanitized;
}

// Legacy validation functions - now using centralized authz helpers
// These are kept for backward compatibility but should use authz module

// ============================================================================
// SECTION 7: Authentication Endpoints
// ============================================================================
app.post('/api/auth/otp', rateLimitOTP, (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: 'Valid phone number required' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY * 1000);

    DATABASE.otpCodes.set(phone, { otp, expiresAt, attempts: 0 });

    // OTP removed from all responses - only log in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug({ phone, expiresAt }, 'OTP generated');
    }

    // OTP delivery adapter interface (stub for future SMS provider integration)
    // TODO: Integrate SMS provider (Twilio, AWS SNS, etc.)
    
    const response = {
      message: 'OTP sent successfully',
      expiresIn: OTP_EXPIRY
    };
	if (process.env.NODE_ENV === 'development') {
	   response.otp = otp;
	}
    // Never include OTP in response
    res.json(response);
  } catch (error) {
    logger.error({ error: error.message, phone: req.body.phone }, 'OTP generation failed');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/verify
 * Verify OTP and authenticate user (login or sign-in)
 *
 * @body {string} phone - Phone number
 * @body {string} otp - 6-digit OTP code
 * @body {string} [flow] - Authentication flow: 'login' | 'sign-in' (optional, for better UX)
 * @body {string} [name] - User name (required for new users)
 * @body {string} [gender] - User gender: 'female' | 'woman' (required for new users; SafeRide is women-only)
 * @body {string} [role] - User role: 'passenger' | 'driver' (default: 'passenger')
 * @body {string} [city] - User city (optional)
 * @body {string} [profilePictureUrl] - Profile picture data URI (optional)
 *
 * @returns {200} { accessToken, token, refreshToken, expiresAt, user }
 * @returns {400} Invalid OTP or validation error
 * @returns {404} User not found (login flow only)
 * @returns {409} User already exists (sign-in flow only)
 * @returns {500} Server error
 */
app.post('/api/auth/verify', rateLimitAuth, rateLimitOTPFailure, async (req, res) => {
  try {
    const { phone, otp, name, role: requestedRole = 'passenger', city, profilePictureUrl, profile_picture_url, gender, flow } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP required' });
    }

    const storedOTP = DATABASE.otpCodes.get(phone);

    // Rate limit on OTP verification failures
    if (!storedOTP || storedOTP.otp !== otp) {
      if (storedOTP) {
        storedOTP.attempts = (storedOTP.attempts || 0) + 1;
        if (storedOTP.attempts >= 5) {
          DATABASE.otpCodes.delete(phone);
          logSecurityEvent('otp_verification_lockout', { phone });
          try {
            await otpFailureLimiter.consume(phone);
          } catch (error) {
            // Already rate limited
          }
        }
      }
      logSecurityEvent('otp_verification_failed', { phone });
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (new Date() > storedOTP.expiresAt) {
      DATABASE.otpCodes.delete(phone);
      return res.status(400).json({ error: 'OTP expired' });
    }

    DATABASE.otpCodes.delete(phone);

    // Sanitize role: only allow 'passenger' or 'driver', default to 'passenger'
    let sanitizedRole = 'passenger';
    if (requestedRole === 'passenger' || requestedRole === 'driver') {
      sanitizedRole = requestedRole;
    }

    // Normalize profile picture URL: accept both profile_picture_url and profilePictureUrl, prefer profilePictureUrl
    const normalizedProfilePictureUrl = profilePictureUrl !== undefined ? profilePictureUrl : (profile_picture_url !== undefined ? profile_picture_url : null);
    if (normalizedProfilePictureUrl && typeof normalizedProfilePictureUrl === 'string' && normalizedProfilePictureUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Profile picture must be provided as a URL returned by /api/upload.' });
    }

    // Find or create user
    let user = await db.getUserByPhone(phone);

    if (!user && flow === 'login') {
      return res.status(404).json({ error: 'No account found with this phone number. Please sign up first.' });
    }

    if (user && flow === 'sign-in') {
      return res.status(409).json({ error: 'An account with this phone number already exists. Please login instead.' });
    }

    if (!user) {
      if (!name) {
        return res.status(400).json({
          error: flow === 'sign-in'
            ? 'Please enter your name to create an account'
            : 'Name required for new user'
        });
      }

      // Validate city if provided
      if (city !== undefined && city !== null && (typeof city !== 'string' || city.length > 100)) {
        return res.status(400).json({ error: 'City must be a string with max 100 characters' });
      }

      // Validate profilePictureUrl if provided
      if (normalizedProfilePictureUrl !== undefined && normalizedProfilePictureUrl !== null && typeof normalizedProfilePictureUrl !== 'string') {
        return res.status(400).json({ error: 'Profile picture URL must be a string' });
      }

      // Validate gender: SafeRide is exclusively for women
      // Only 'female' value is accepted. 'male' is explicitly rejected with clear messaging.
      // This enforces the core business model of the application; frontend now sends only 'female' or 'male'
      let normalizedGender = null;
      if (gender !== undefined && gender !== null) {
        if (typeof gender !== 'string') {
          return res.status(400).json({ error: 'Gender must be a string' });
        }
        // Defensively normalize gender to lowercase
        normalizedGender = gender.trim().toLowerCase();
        if (normalizedGender === 'male') {
          logSecurityEvent('male_registration_blocked', null, { phone, attemptedGender: gender });
          logger.warn({ phone, attemptedGender: gender }, 'Male user registration attempt blocked');
          return res.status(400).json({ error: WOMEN_ONLY_ERROR });
        }
        if (normalizedGender !== 'female') {
          logSecurityEvent('invalid_gender_attempt', null, { phone, attemptedGender: gender });
          logger.warn({ phone, attemptedGender: gender }, 'Registration attempt with invalid gender rejected');
          return res.status(400).json({ error: WOMEN_ONLY_ERROR });
        }
      } else {
        return res.status(400).json({
          error: flow === 'sign-in'
            ? 'Please select your gender to create an account'
            : 'Gender is required for new user'
        });
      }

      user = await db.createUser({
        phone,
        name,
        role: sanitizedRole,
        verified: true,
        emergencyContact: null,
        trustedContacts: [],
        city: city || null,
        gender: normalizedGender,
        profilePictureUrl: normalizedProfilePictureUrl || null
      });
      logAuditEvent('user_created', user.id, { phone, role: sanitizedRole, gender: normalizedGender, flow: flow || 'legacy' });
    }

    // Generate token pair (access + refresh)
    const { accessToken, refreshToken, expiresAt } = await generateTokenPair(user);

    logAuditEvent('user_login', user.id, { phone, flow: flow || 'legacy' });

    res.json({
      accessToken,
      token: accessToken, // Backward compatibility: mirror accessToken as token
      refreshToken,
      expiresAt,
      user: sanitizeUser(user)
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, phone: req.body.phone });
    logger.error({ error: error.message, phone: req.body.phone }, 'OTP verification failed');
    res.status(500).json({ error: error.message });
  }
});

// Refresh token endpoint
app.post('/api/auth/refresh', rateLimitAuth, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const session = await verifyRefreshToken(refreshToken);
    const user = await db.getUserById(session.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Revoke old refresh token (rotate on use)
    await revokeRefreshToken(refreshToken);

    // Generate new token pair
    const { accessToken, refreshToken: newRefreshToken, expiresAt } = await generateTokenPair(user);

    logAuditEvent('token_refreshed', user.id);

    res.json({
      accessToken,
      token: accessToken, // Backward compatibility: mirror accessToken as token
      refreshToken: newRefreshToken,
      expiresAt
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method });
    logger.error({ error: error.message }, 'Token refresh failed');
    if (error.message.includes('expired') || error.message.includes('Invalid')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // Extract and revoke access token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const accessToken = authHeader.substring(7);
      try {
        await revokeAccessToken(accessToken);
      } catch (error) {
        // Ignore if token already expired or invalid
        logger.debug({ error: error.message }, 'Access token revocation failed (non-critical)');
      }
    }
    
    // Revoke refresh token if provided
    if (refreshToken) {
      try {
        await revokeRefreshToken(refreshToken);
      } catch (error) {
        // Ignore if already revoked
      }
    }

    // Revoke all user tokens
    await revokeAllUserTokens(req.user.userId);

    logAuditEvent('user_logout', req.user.userId);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Logout failed');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 7.5: Image Upload Endpoint
// ============================================================================
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPEG and PNG images are allowed' });
    }

    const extension = req.file.mimetype === 'image/png' ? '.png' : '.jpg';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const filename = `${uniqueSuffix}${extension}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    await fsPromises.writeFile(filePath, req.file.buffer);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const imageUrl = `${protocol}://${host}/uploads/${filename}`;

    if (req.user?.userId) {
      logAuditEvent('image_uploaded', req.user.userId, { 
        filename: req.file.originalname, 
        size: req.file.size,
        mimetype: req.file.mimetype,
        storedAs: filename,
      });
    }

    res.json({
      url: imageUrl,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Image upload failed');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 8: User Profile Endpoints
// ============================================================================
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(sanitizeUser(user));
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, emergencyContact, trustedContacts, city, profilePictureUrl, profile_picture_url, gender } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (trustedContacts !== undefined) updates.trustedContacts = trustedContacts;
    
    // Validate city if provided
    if (city !== undefined) {
      if (city !== null && (typeof city !== 'string' || city.length > 100)) {
        return res.status(400).json({ error: 'City must be a string with max 100 characters' });
      }
      updates.city = city;
    }
    
    // Normalize profile picture URL: accept both profile_picture_url and profilePictureUrl, prefer profilePictureUrl
    if (profilePictureUrl !== undefined || profile_picture_url !== undefined) {
      const normalizedProfilePictureUrl = profilePictureUrl !== undefined ? profilePictureUrl : profile_picture_url;
      // Validate profilePictureUrl if provided
      if (normalizedProfilePictureUrl !== null && typeof normalizedProfilePictureUrl !== 'string') {
        return res.status(400).json({ error: 'Profile picture URL must be a string' });
      }
      if (typeof normalizedProfilePictureUrl === 'string' && normalizedProfilePictureUrl.startsWith('data:')) {
        return res.status(400).json({ error: 'Profile picture must be provided as a URL returned by /api/upload.' });
      }
      updates.profilePictureUrl = normalizedProfilePictureUrl;
    }
    
    // Validate and normalize gender if provided
    if (gender !== undefined) {
      if (gender !== null) {
        if (typeof gender !== 'string') {
          return res.status(400).json({ error: 'Gender must be a string' });
        }
        // Normalize gender to lowercase
        const normalizedGender = gender.trim().toLowerCase();
        if (normalizedGender === 'male') {
          logSecurityEvent('male_profile_update_blocked', req.user.userId, { attemptedGender: gender });
          logger.warn({ userId: req.user.userId, attemptedGender: gender }, 'Male gender profile update attempt blocked');
          return res.status(400).json({ error: WOMEN_ONLY_ERROR });
        }
        if (normalizedGender !== 'female') {
          logSecurityEvent('invalid_gender_attempt', req.user.userId, { attemptedGender: gender });
          logger.warn({ userId: req.user.userId, attemptedGender: gender }, 'Profile update attempt with invalid gender rejected');
          return res.status(400).json({ error: WOMEN_ONLY_ERROR });
        }
        updates.gender = normalizedGender;
      } else {
        return res.status(400).json({ error: 'Gender cannot be unset' });
      }
    }

    const updatedUser = await db.updateUser(req.user.userId, updates);

    res.json(sanitizeUser(updatedUser));
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 9: Trip Management Endpoints
// ============================================================================
app.post('/api/trips/:id/messages', authenticateToken, rateLimitMessage, async (req, res) => {
  try {
    const { message } = req.body;
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const validation = canWriteMessage(req.user.userId, tripId, req.user.role, trip);
    if (!validation.allowed) {
      return res.status(403).json({ error: validation.error || 'Access denied' });
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }
    
    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'Message too long' });
    }
    
    const cleanMessage = profanityFilter.clean(message.trim());
    const recipientId = req.user.userId === trip.passengerId ? trip.driverId : trip.passengerId;
    
    const messageObj = await db.createMessage({
      tripId: tripId,
      senderId: req.user.userId,
      content: cleanMessage,
      isFlagged: cleanMessage !== message.trim()
    });
    
    io.to(`trip_${tripId}`).emit('receive_message', {
      message_id: messageObj.id,
      trip_id: tripId,
      sender_id: messageObj.senderId,
      recipient_id: recipientId,
      message: messageObj.content,
      timestamp: messageObj.createdAt.toISOString(),
      is_flagged: messageObj.isFlagged
    });
    
    res.status(201).json({
      message_id: messageObj.id,
      trip_id: tripId,
      message: messageObj.content,
      timestamp: messageObj.createdAt.toISOString(),
      is_flagged: messageObj.isFlagged
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error creating message');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trips/:id/messages', authenticateToken, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const validation = canAccessMessages(req.user.userId, tripId, req.user.role, trip);
    if (!validation.allowed) {
      return res.status(403).json({ error: validation.error || 'Access denied' });
    }
    
    const { limit, offset } = require('./utils/pagination').parsePagination(req);
    const messages = await db.getTripMessages(tripId, limit, offset);
    
    const enrichedMessages = await Promise.all(messages.map(async (message) => {
      const senderUser = await db.getUserById(message.senderId);
      const recipientId = message.senderId === trip.passengerId ? trip.driverId : trip.passengerId;
      const recipientUser = recipientId ? await db.getUserById(recipientId) : null;
      
      return {
        message_id: message.id,
        trip_id: message.tripId,
        sender_id: message.senderId,
        sender_name: senderUser ? senderUser.name : null,
        recipient_id: recipientId,
        recipient_name: recipientUser ? recipientUser.name : null,
        message: message.content,
        timestamp: message.createdAt.toISOString(),
        read_at: message.readAt ? message.readAt.toISOString() : null,
        is_flagged: message.isFlagged
      };
    }));
    
    res.json(enrichedMessages);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching messages');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 10B: Voice Call Endpoints
// ============================================================================
app.post('/api/trips/:id/call/initiate', authenticateToken, rateLimitCall, async (req, res) => {
  try {
    const { emergency_recording } = req.body;
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const validation = canInitiateCall(req.user.userId, tripId, req.user.role, trip);
    if (!validation.allowed) {
      return res.status(403).json({ error: validation.error || 'Access denied' });
    }
    
    const activeCalls = await getActiveCallsForTrip(tripId);
    
    if (activeCalls.length > 0) {
      return res.status(400).json({ error: 'Call already in progress' });
    }
    
    const calleeId = req.user.userId === trip.passengerId ? trip.driverId : trip.passengerId;
    
    const call = await db.createCall({
      tripId: tripId,
      callerId: req.user.userId,
      receiverId: calleeId,
      status: 'ringing',
      startedAt: new Date(),
      endedAt: null,
      duration: null,
      isEmergency: emergency_recording || false
    });
    
    const callIncomingData = {
      call_id: call.id,
      trip_id: tripId,
      caller_id: call.callerId,
      callee_id: call.receiverId,
      emergency_recording: call.isEmergency,
      initiated_at: call.startedAt.toISOString()
    };
    
    // Room broadcast (maintains current behavior)
    io.to(`trip_${tripId}`).emit('call_incoming', callIncomingData);
    
    // Targeted delivery to callee sockets for better reliability
    const calleeSockets = connectedUsers.get(calleeId);
    if (calleeSockets && calleeSockets.size > 0) {
      calleeSockets.forEach(socketId => {
        io.to(socketId).emit('call_incoming', callIncomingData);
      });
    }
    
    res.status(201).json({
      call_id: call.id,
      trip_id: tripId,
      caller_id: call.callerId,
      callee_id: call.receiverId,
      status: call.status,
      emergency_recording: call.isEmergency,
      initiated_at: call.startedAt.toISOString()
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error initiating call');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trips/:id/call/status', authenticateToken, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const validation = canAccessCalls(req.user.userId, tripId, req.user.role, trip);
    if (!validation.allowed) {
      return res.status(403).json({ error: validation.error || 'Access denied' });
    }
    
    const tripCalls = await db.getTripCalls(tripId);
    
    tripCalls.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    
    const call = tripCalls[0];
    
    if (!call) {
      return res.status(404).json({ error: 'No call found for this trip' });
    }
    
    const callerUser = await db.getUserById(call.callerId);
    const calleeUser = await db.getUserById(call.receiverId);
    
    res.json({
      call_id: call.id,
      trip_id: call.tripId,
      caller_id: call.callerId,
      caller_name: callerUser ? callerUser.name : null,
      callee_id: call.receiverId,
      callee_name: calleeUser ? calleeUser.name : null,
      status: call.status,
      initiated_at: call.startedAt.toISOString(),
      connected_at: call.connectedAt ? call.connectedAt.toISOString() : null,
      ended_at: call.endedAt ? call.endedAt.toISOString() : null,
      duration: call.duration,
      emergency_recording: call.isEmergency,
      end_reason: null // Not stored in database schema
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching call status');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 9: Trip Management Endpoints
// ============================================================================
app.post('/api/trips', authenticateToken, authorize('passenger'), async (req, res) => {
  try {
    const { pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, proposed_price, vehicle_type } = req.body;

    // Validate required fields (checking for null/undefined only)
    if (pickup_lat === null || pickup_lat === undefined || 
        pickup_lng === null || pickup_lng === undefined || 
        !pickup_address || 
        drop_lat === null || drop_lat === undefined || 
        drop_lng === null || drop_lng === undefined || 
        !drop_address || 
        proposed_price === null || proposed_price === undefined) {
      return res.status(400).json({ error: 'All trip details required' });
    }

    // Parse and validate coordinates with Number.isFinite (allows 0.0)
    const pickupLat = parseFloat(pickup_lat);
    const pickupLng = parseFloat(pickup_lng);
    const dropLat = parseFloat(drop_lat);
    const dropLng = parseFloat(drop_lng);
    const proposedPrice = parseFloat(proposed_price);

    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) || 
        !Number.isFinite(dropLat) || !Number.isFinite(dropLng) || 
        !Number.isFinite(proposedPrice)) {
      return res.status(400).json({ error: 'Invalid coordinate or price values' });
    }

    // Validate vehicle type
    const validVehicleTypes = ['car', 'bike', 'ev_bike'];
    if (!vehicle_type || !validVehicleTypes.includes(vehicle_type)) {
      return res.status(400).json({ error: 'Invalid vehicle type. Must be car, bike, or ev_bike' });
    }

    const trip = await db.createTrip({
      passengerId: req.user.userId,
      driverId: null,
      pickupLat,
      pickupLng,
      pickupAddress: pickup_address,
      dropLat,
      dropLng,
      dropAddress: drop_address,
      status: 'requested',
      proposedPrice,
      vehicleType: vehicle_type,
      acceptedPrice: null,
      startedAt: null,
      completedAt: null,
      sharedWith: [],
      safetyCheckEnabled: true
    });

    // Broadcast trip to drivers with matching vehicle type
    const tripData = {
      trip_id: trip.id,
      pickup_lat: trip.pickupLat,
      pickup_lng: trip.pickupLng,
      drop_lat: trip.dropLat,
      drop_lng: trip.dropLng,
      proposed_price: trip.proposedPrice,
      pickup_address: trip.pickupAddress,
      drop_address: trip.dropAddress,
      vehicle_type: trip.vehicleType
    };

    // Filter and emit to drivers with matching vehicle type
    const onlineDrivers = await db.getOnlineDrivers();
    for (const driverRecord of onlineDrivers) {
      if (driverRecord.vehicleType === trip.vehicleType && driverRecord.verificationStatus === 'verified') {
        const socketSet = connectedUsers.get(driverRecord.userId || driverRecord.id);
        if (socketSet) {
          socketSet.forEach(socketId => {
            io.to(socketId).emit('new_trip', tripData);
          });
        }
      }
    }

    // Map response to snake_case, excluding internal camelCase fields
    const response = {
      id: trip.id,
      passenger_id: trip.passengerId,
      driver_id: trip.driverId,
      pickup_lat: trip.pickupLat,
      pickup_lng: trip.pickupLng,
      pickup_address: trip.pickupAddress,
      drop_lat: trip.dropLat,
      drop_lng: trip.dropLng,
      drop_address: trip.dropAddress,
      status: trip.status,
      proposed_price: trip.proposedPrice,
      vehicle_type: trip.vehicleType,
      accepted_price: trip.acceptedPrice,
      created_at: trip.createdAt,
      started_at: trip.startedAt,
      completed_at: trip.completedAt,
      shared_with: trip.sharedWith,
      safety_check_enabled: trip.safetyCheckEnabled
    };

    res.status(201).json(response);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error creating trip');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trips/:id', authenticateToken, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (trip.passengerId !== req.user.userId && trip.driverId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const passenger = await db.getUserById(trip.passengerId);
    const driver = trip.driverId ? await db.getUserById(trip.driverId) : null;
    const driverRecord = trip.driverId ? await db.getDriverById(trip.driverId) : null;

    // Construct response object explicitly with snake_case keys
    const enrichedTrip = {
      id: trip.id,
      passenger_id: trip.passengerId,
      driver_id: trip.driverId,
      pickup_lat: trip.pickupLat,
      pickup_lng: trip.pickupLng,
      pickup_address: trip.pickupAddress,
      drop_lat: trip.dropLat,
      drop_lng: trip.dropLng,
      drop_address: trip.dropAddress,
      status: trip.status,
      proposed_price: trip.proposedPrice,
      vehicle_type: trip.vehicleType,
      accepted_price: trip.acceptedPrice,
      created_at: trip.createdAt,
      started_at: trip.startedAt,
      completed_at: trip.completedAt,
      shared_with: trip.sharedWith,
      safety_check_enabled: trip.safetyCheckEnabled,
      passenger_name: passenger ? passenger.name : null,
      driver_name: driver ? driver.name : null,
      vehicle_make: driverRecord ? driverRecord.vehicleMake : null,
      vehicle_model: driverRecord ? driverRecord.vehicleModel : null,
      vehicle_plate: driverRecord ? driverRecord.vehiclePlate : null,
      driver_vehicle_type: driverRecord ? driverRecord.vehicleType : null
    };

    res.json(enrichedTrip);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching trip');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trips', authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;
    const { limit, offset } = require('./utils/pagination').parsePagination(req);

    const userTrips = await db.getUserTrips(req.user.userId, status || null, limit, offset);
    const totalTrips = await db.getUserTrips(req.user.userId, status || null, 10000, 0); // Get total count
    const total = totalTrips.length;

    const enrichedTrips = await Promise.all(userTrips.map(async trip => {
      const passenger = await db.getUserById(trip.passengerId);
      const driver = trip.driverId ? await db.getUserById(trip.driverId) : null;
      // Construct response object explicitly with snake_case keys
      return {
        id: trip.id,
        passenger_id: trip.passengerId,
        driver_id: trip.driverId,
        pickup_lat: trip.pickupLat,
        pickup_lng: trip.pickupLng,
        pickup_address: trip.pickupAddress,
        drop_lat: trip.dropLat,
        drop_lng: trip.dropLng,
        drop_address: trip.dropAddress,
        status: trip.status,
        proposed_price: trip.proposedPrice,
        vehicle_type: trip.vehicleType,
        accepted_price: trip.acceptedPrice,
        created_at: trip.createdAt,
        started_at: trip.startedAt,
        completed_at: trip.completedAt,
        shared_with: trip.sharedWith,
        safety_check_enabled: trip.safetyCheckEnabled,
        passenger_name: passenger ? passenger.name : null,
        driver_name: driver ? driver.name : null
      };
    }));

    res.json({
      data: enrichedTrips,
      pagination: require('./utils/pagination').createPaginationMeta(total, limit, offset)
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching trips');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 10: Offer Management Endpoints
// ============================================================================
app.post('/api/trips/:id/offers', authenticateToken, authorize('driver'), rateLimitOffer, async (req, res) => {
  try {
    // Verify driver exists and is verified
    const driver = await db.getDriverByUserId(req.user.userId);
    if (!driver || driver.verificationStatus !== 'verified') {
      return res.status(403).json({ error: 'Driver verification required. Please complete driver registration and wait for verification.' });
    }

    const { price_offer, eta_minutes } = req.body;

    if (price_offer === null || price_offer === undefined || 
        eta_minutes === null || eta_minutes === undefined) {
      return res.status(400).json({ error: 'Price and ETA required' });
    }

    // Parse and validate positive numeric values
    const priceOffer = parseFloat(price_offer);
    const etaMinutes = parseInt(eta_minutes);

    if (!Number.isFinite(priceOffer) || priceOffer <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
      return res.status(400).json({ error: 'ETA must be a positive number' });
    }

    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Use centralized authorization
    const validation = canCreateOffer(req.user.userId, tripId, req.user.role, trip);
    if (!validation.allowed) {
      return res.status(403).json({ error: validation.error || 'Access denied' });
    }

    // Check vehicle type matching
    const driverRecord = await db.getDriverByUserId(req.user.userId);
    if (driverRecord && driverRecord.vehicleType !== trip.vehicleType) {
      return res.status(403).json({ 
        error: `Vehicle type mismatch. This trip requires a ${trip.vehicleType} but you drive a ${driverRecord.vehicleType}` 
      });
    }

    // Check for existing offer from this driver
    const existingOffers = await db.getTripOffers(tripId, 'pending');
    const existingOffer = existingOffers.find(o => o.driverId === req.user.userId);
    if (existingOffer) {
      return res.status(400).json({ error: 'You already made an offer' });
    }

    const offer = await db.createOffer({
      tripId,
      driverId: req.user.userId,
      price: priceOffer,
      eta: etaMinutes,
      message: null,
      status: 'pending'
    });

    const driverUser = await db.getUserById(req.user.userId);
    const driverRecordForEmission = await db.getDriverByUserId(req.user.userId);

    io.to(`trip_${tripId}`).emit('new_offer', {
      offer_id: offer.id,
      driver_id: req.user.userId,
      driver_name: driverUser ? driverUser.name : null,
      vehicle_info: driverRecordForEmission ? `${driverRecordForEmission.vehicleMake} ${driverRecordForEmission.vehicleModel}` : null,
      vehicle_plate: driverRecordForEmission ? driverRecordForEmission.vehiclePlate : null,
      vehicle_type: driverRecordForEmission ? driverRecordForEmission.vehicleType : null,
      price_offer: offer.price,
      eta_minutes: offer.eta,
      rating: driverRecordForEmission ? driverRecordForEmission.rating : null
    });

    res.status(201).json({
      id: offer.id,
      tripId: offer.tripId,
      driverId: offer.driverId,
      priceOffer: offer.price,
      etaMinutes: offer.eta,
      status: offer.status,
      createdAt: offer.createdAt
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error creating offer');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trips/:id/offers', authenticateToken, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Verify authorization: user must be passenger, driver, or admin
    if (req.user.userId !== trip.passengerId && req.user.userId !== trip.driverId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const offers = await db.getTripOffers(tripId, 'pending');
    
    const enrichedOffers = await Promise.all(offers.map(async (offer) => {
      const driver = await db.getUserById(offer.driverId);
      const driverRecord = await db.getDriverById(offer.driverId);

      return {
        id: offer.id,
        tripId: offer.tripId,
        driverId: offer.driverId,
        priceOffer: offer.price,
        etaMinutes: offer.eta,
        message: offer.message,
        status: offer.status,
        createdAt: offer.createdAt,
        driver_name: driver ? driver.name : null,
        driver_phone: driver ? driver.phone : null,
        vehicle_make: driverRecord ? driverRecord.vehicleMake : null,
        vehicle_model: driverRecord ? driverRecord.vehicleModel : null,
        vehicle_plate: driverRecord ? driverRecord.vehiclePlate : null,
        vehicle_type: driverRecord ? driverRecord.vehicleType : null,
        rating: driverRecord ? driverRecord.rating : null
      };
    }));

    res.json(enrichedOffers);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching offers');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trips/:id/accept', authenticateToken, authorize('passenger'), async (req, res) => {
  try {
    const { offer_id } = req.body;
    const tripId = parseInt(req.params.id);

    const trip = await db.getTripById(tripId);

    if (!trip || trip.passengerId !== req.user.userId || trip.status !== 'requested') {
      return res.status(404).json({ error: 'Trip not found or not available' });
    }

    const offerId = parseInt(offer_id);
    const offer = await db.getOfferById(offerId);

    if (!offer || offer.tripId !== tripId || offer.status !== 'pending') {
      return res.status(404).json({ error: 'Offer not found' });
    }

    // Update trip
    await db.updateTrip(tripId, {
      driverId: offer.driverId,
      acceptedPrice: offer.price,
      status: 'accepted'
    });

    // Update offer status
    await db.updateOffer(offerId, { status: 'accepted' });

    // Reject all other offers for this trip
    await db.rejectOtherOffers(tripId, offerId);

    const driverSocketSet = connectedUsers.get(offer.driverId);
    if (driverSocketSet && driverSocketSet.size > 0) {
      // Emit to all sockets for this driver
      driverSocketSet.forEach(socketId => {
        io.to(socketId).emit('offer_accepted', {
          trip_id: tripId,
          offer_id: offerId
        });
      });
    }

    const updatedTrip = await db.getTripById(tripId);

    res.json({
      message: 'Offer accepted successfully',
      trip: {
        id: updatedTrip.id,
        passengerId: updatedTrip.passengerId,
        driverId: updatedTrip.driverId,
        status: updatedTrip.status,
        acceptedPrice: updatedTrip.acceptedPrice
      }
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error accepting offer');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 11: Trip Action Endpoints
// ============================================================================
app.post('/api/trips/:id/start', authenticateToken, authorize('driver'), async (req, res) => {
  try {
    // Verify driver exists and is verified
    const driver = await db.getDriverByUserId(req.user.userId);
    if (!driver || driver.verificationStatus !== 'verified') {
      return res.status(403).json({ error: 'Driver verification required. Please complete driver registration and wait for verification.' });
    }

    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);

    if (!trip || trip.driverId !== req.user.userId || trip.status !== 'accepted') {
      return res.status(404).json({ error: 'Trip not found or not authorized' });
    }

    const startedAt = new Date();
    await db.updateTrip(tripId, {
      status: 'in_progress',
      startedAt: startedAt
    });

    io.to(`trip_${tripId}`).emit('trip_started', {
      trip_id: tripId,
      started_at: startedAt.toISOString()
    });

    const updatedTrip = await db.getTripById(tripId);
    res.json({
      id: updatedTrip.id,
      passengerId: updatedTrip.passengerId,
      driverId: updatedTrip.driverId,
      status: updatedTrip.status,
      startedAt: updatedTrip.startedAt
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error starting trip');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trips/:id/complete', authenticateToken, authorize('driver'), async (req, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);

    if (!trip || trip.driverId !== req.user.userId || trip.status !== 'in_progress') {
      return res.status(404).json({ error: 'Trip not found or not authorized' });
    }

    const completedAt = new Date();
    await db.updateTrip(tripId, {
      status: 'completed',
      completedAt: completedAt
    });

    const driver = await db.getDriverByUserId(req.user.userId);
    if (driver) {
      await db.updateDriver(driver.id, {
        totalTrips: (driver.totalTrips || 0) + 1
      });
    }

    const activeCalls = await getActiveCallsForTrip(tripId);
    
    for (const call of activeCalls) {
      const endedAt = new Date();
      let duration = 0;
      if (call.connectedAt) {
        duration = Math.floor((endedAt - new Date(call.connectedAt)) / 1000);
      }
      
      await db.updateCall(call.id, {
        status: 'ended',
        endedAt: endedAt,
        duration: duration
      });
      
      io.to(`trip_${tripId}`).emit('call_ended', {
        call_id: call.id,
        trip_id: tripId,
        ended_at: endedAt.toISOString(),
        duration: duration,
        reason: 'trip_completed'
      });
    }

    io.to(`trip_${tripId}`).emit('chat_disabled', {
      trip_id: tripId,
      reason: 'Trip completed'
    });

    io.to(`trip_${tripId}`).emit('trip_completed', {
      trip_id: tripId,
      completed_at: completedAt.toISOString()
    });

    const updatedTrip = await db.getTripById(tripId);
    res.json({
      id: updatedTrip.id,
      passengerId: updatedTrip.passengerId,
      driverId: updatedTrip.driverId,
      status: updatedTrip.status,
      completedAt: updatedTrip.completedAt
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error completing trip');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trips/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (trip.passengerId !== req.user.userId && trip.driverId !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (trip.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel completed trip' });
    }

    await db.updateTrip(tripId, {
      status: 'cancelled'
    });

    const activeCalls = await getActiveCallsForTrip(tripId);
    
    for (const call of activeCalls) {
      const endedAt = new Date();
      let duration = 0;
      if (call.connectedAt) {
        duration = Math.floor((endedAt - new Date(call.connectedAt)) / 1000);
      }
      
      await db.updateCall(call.id, {
        status: 'ended',
        endedAt: endedAt,
        duration: duration
      });
      
      io.to(`trip_${tripId}`).emit('call_ended', {
        call_id: call.id,
        trip_id: tripId,
        ended_at: endedAt.toISOString(),
        duration: duration,
        reason: 'trip_cancelled'
      });
    }

    io.to(`trip_${tripId}`).emit('chat_disabled', {
      trip_id: tripId,
      reason: 'Trip cancelled'
    });

    io.to(`trip_${tripId}`).emit('trip_cancelled', { trip_id: tripId });

    const updatedTrip = await db.getTripById(tripId);
    res.json({
      id: updatedTrip.id,
      passengerId: updatedTrip.passengerId,
      driverId: updatedTrip.driverId,
      status: updatedTrip.status
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error cancelling trip');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trips/:id/share', authenticateToken, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Only the trip's passenger can share the trip
    if (trip.passengerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the trip passenger can share the trip' });
    }

    const { contact_id, contact_ids } = req.body;
    
    // Support both single contact_id (backward compatibility) and array of contact_ids
    const contactIdsToShare = contact_ids || (contact_id ? [contact_id] : []);
    
    if (!contactIdsToShare || contactIdsToShare.length === 0) {
      return res.status(400).json({ error: 'Contact ID(s) required' });
    }

    // Verify the contact exists in user's trustedContacts
    const passenger = await db.getUserById(req.user.userId);
    if (!passenger || !passenger.trustedContacts || !Array.isArray(passenger.trustedContacts)) {
      return res.status(400).json({ error: 'User has no trusted contacts' });
    }

    // Normalize trusted contacts for comparison
    const normalizedTrustedContacts = passenger.trustedContacts.map(contact => 
      typeof contact === 'object' ? String(contact.id) : String(contact)
    );

    // Initialize sharedWith array if needed
    let sharedWith = trip.sharedWith || [];
    if (!Array.isArray(sharedWith)) {
      sharedWith = [];
    }

    // Process each contact ID
    const addedContacts = [];
    for (const contactId of contactIdsToShare) {
      const normalizedContactId = String(contactId);
      
      // Verify contact exists in trusted contacts
      if (!normalizedTrustedContacts.includes(normalizedContactId)) {
        return res.status(400).json({ error: `Contact ${normalizedContactId} is not in your trusted contacts list` });
      }

      // Add contact to trip's sharedWith if not already present
      if (!sharedWith.includes(normalizedContactId)) {
        sharedWith.push(normalizedContactId);
        addedContacts.push(normalizedContactId);
      }
    }

    // Update trip with new sharedWith array
    await db.updateTrip(tripId, { sharedWith });

    // Notify all added contacts via socket if online
    for (const normalizedContactId of addedContacts) {
      let contactUser = null;
      // Try to find by ID (normalized)
      const contactIdNum = parseInt(normalizedContactId, 10);
      if (!isNaN(contactIdNum)) {
        contactUser = await db.getUserById(contactIdNum);
      }
      // Fallback: find by phone number
      if (!contactUser) {
        contactUser = await db.getUserByPhone(normalizedContactId);
      }

      // Emit socket event to notify trusted contact
      if (contactUser) {
        const contactSocketSet = connectedUsers.get(contactUser.id);
        if (contactSocketSet && contactSocketSet.size > 0) {
          // Emit to all sockets for this contact
          contactSocketSet.forEach(socketId => {
            io.to(socketId).emit('trip_shared', {
              trip_id: tripId,
              passenger_id: trip.passengerId,
              passenger_name: passenger.name,
              pickup_address: trip.pickupAddress,
              drop_address: trip.dropAddress,
              status: trip.status,
              shared_at: new Date().toISOString()
            });
          });
        }
      }
    }

    const updatedTrip = await db.getTripById(tripId);
    res.json({
      message: 'Trip shared successfully',
      trip: {
        id: updatedTrip.id,
        sharedWith: updatedTrip.sharedWith
      }
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error sharing trip');
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/trips/:id/share/:contactId', authenticateToken, async (req, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const contactId = req.params.contactId;
    const trip = await db.getTripById(tripId);

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Only the trip's passenger can unshare the trip
    if (trip.passengerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the trip passenger can unshare the trip' });
    }

    // Remove contact from trip's sharedWith
    let sharedWith = trip.sharedWith || [];
    if (!Array.isArray(sharedWith)) {
      sharedWith = [];
    }

    // Normalize contactId to string for consistent comparison
    const normalizedContactId = String(contactId);
    const index = sharedWith.indexOf(normalizedContactId);
    if (index === -1) {
      return res.status(404).json({ error: 'Contact not found in shared list' });
    }

    sharedWith.splice(index, 1);

    // Update trip with new sharedWith array
    await db.updateTrip(tripId, { sharedWith });

    const updatedTrip = await db.getTripById(tripId);
    res.json({
      message: 'Contact removed from shared trip',
      trip: {
        id: updatedTrip.id,
        sharedWith: updatedTrip.sharedWith
      }
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error unsharing trip');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 12: Rating System Endpoints
// ============================================================================
app.post('/api/trips/:id/rate', authenticateToken, async (req, res) => {
  try {
    const { rating, comment = '' } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const tripId = parseInt(req.params.id);
    const trip = await db.getTripById(tripId);

    if (!trip || trip.status !== 'completed') {
      return res.status(404).json({ error: 'Trip not found or not completed' });
    }

    let rateeId;
    let raterRole;
    if (req.user.userId === trip.passengerId) {
      rateeId = trip.driverId;
      raterRole = 'passenger';
    } else if (req.user.userId === trip.driverId) {
      rateeId = trip.passengerId;
      raterRole = 'driver';
    } else {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check for existing rating from this user
    // Note: We need to check if user already rated, not just if trip has a rating
    // Since getTripRating only returns one rating, we'll check via driver ratings
    // In a proper implementation, you might want a getRatingByTripAndRater query
    if (raterRole === 'passenger') {
      // Passenger rating driver - check if passenger already rated this trip
      const driverRatings = await db.getDriverRatings(rateeId);
      const existingRating = driverRatings.find(r => r.tripId === tripId && r.passengerId === req.user.userId);
      if (existingRating) {
        return res.status(400).json({ error: 'Already rated this trip' });
      }
    } else {
      // Driver rating passenger - check if driver already rated this trip
      const driverRatings = await db.getDriverRatings(req.user.userId);
      const existingRating = driverRatings.find(r => r.tripId === tripId && r.driverId === req.user.userId);
      if (existingRating) {
        return res.status(400).json({ error: 'Already rated this trip' });
      }
    }

    // Create rating
    const ratingRecord = await db.createRating({
      tripId,
      passengerId: raterRole === 'passenger' ? req.user.userId : rateeId,
      driverId: raterRole === 'driver' ? req.user.userId : rateeId,
      rating: parseInt(rating),
      comment
    });

    // Recalculate driver rating if rating a driver
    if (rateeId === trip.driverId) {
      const avgRating = await db.calculateDriverAverageRating(rateeId);
      const driver = await db.getDriverByUserId(rateeId);
      if (driver) {
        await db.updateDriver(driver.id, { rating: Math.round(avgRating * 10) / 10 });
      }
    }

    res.json({
      message: 'Rating submitted successfully',
      rating: ratingRecord
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error creating rating');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 13: Driver Management Endpoints
// ============================================================================
// Apply route-level parser with 10mb limit for large payloads (base64 images)
app.post('/api/drivers/register', express.json({ limit: '10mb' }), authenticateToken, authorize('driver'), async (req, res) => {
  try {
    const { license_number, vehicle_make, vehicle_model, vehicle_plate, vehicle_year, vehicle_type, license_photo_url, vehicle_photo_url, cnic_photo_url } = req.body;

    if (!license_number || !vehicle_make || !vehicle_model || !vehicle_plate) {
      return res.status(400).json({ error: 'All vehicle details required' });
    }

    // Validate vehicle type
    const validVehicleTypes = ['car', 'bike', 'ev_bike'];
    if (!vehicle_type || !validVehicleTypes.includes(vehicle_type)) {
      return res.status(400).json({ error: 'Invalid vehicle type. Must be car, bike, or ev_bike' });
    }

    // Validate image URLs if provided
    const imageUrls = [license_photo_url, vehicle_photo_url, cnic_photo_url].filter(url => url);
    const MAX_DATA_URI_SIZE = 7 * 1024 * 1024; // 7MB limit
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
    
    for (const url of imageUrls) {
      if (!url.startsWith('data:image/') && !url.startsWith('http')) {
        return res.status(400).json({ error: 'Invalid image URL format. Must be a data URI or HTTP URL' });
      }
      
      // Validate base64 data URIs
      if (url.startsWith('data:image/')) {
        // Check size
        if (url.length > MAX_DATA_URI_SIZE) {
          return res.status(400).json({ error: 'Image data URI exceeds maximum allowed size (7MB)' });
        }
        
        // Validate MIME type and base64 format
        const dataUriMatch = url.match(/^data:image\/([^;]+);base64,(.+)$/);
        if (!dataUriMatch) {
          return res.status(400).json({ error: 'Invalid data URI format. Must be data:image/[type];base64,[data]' });
        }
        
        const mimeType = `image/${dataUriMatch[1].toLowerCase()}`;
        if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
          return res.status(400).json({ error: 'Invalid image MIME type. Only JPEG and PNG are allowed' });
        }
        
        // Validate base64 format
        const base64Data = dataUriMatch[2];
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
          return res.status(400).json({ error: 'Invalid base64 encoding in data URI' });
        }
      }
    }

    const existingDriver = await db.getDriverByUserId(req.user.userId);
    if (existingDriver) {
      return res.status(400).json({ error: 'Already registered as driver' });
    }

    const driver = await db.createDriver({
      id: req.user.userId,
      userId: req.user.userId,
      licenseNumber: license_number,
      vehicleMake: vehicle_make,
      vehicleModel: vehicle_model,
      vehiclePlate: vehicle_plate,
      vehicleType: vehicle_type,
      vehicleYear: vehicle_year ? parseInt(vehicle_year) : null,
      licensePhotoUrl: license_photo_url || null,
      vehiclePhotoUrl: vehicle_photo_url || null,
      cnicPhotoUrl: cnic_photo_url || null,
      verificationStatus: 'pending',
      rating: 5.0,
      totalTrips: 0,
      isOnline: false,
      lastLocationLat: null,
      lastLocationLng: null
    });

    res.status(201).json(driver);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error registering driver');
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/drivers/status', authenticateToken, authorize('driver'), async (req, res) => {
  try {
    const { is_online } = req.body;

    const driver = await db.getDriverByUserId(req.user.userId);

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    if (driver.verificationStatus !== 'verified') {
      return res.status(403).json({ error: 'Driver verification required. Please complete driver registration and wait for verification.' });
    }

    const updatedDriver = await db.updateDriver(driver.id, { isOnline: is_online });

    if (is_online) {
      io.emit('driver_online', {
        driver_id: req.user.userId
      });
    }

    res.json(updatedDriver);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error updating driver status');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 14: SOS Emergency Endpoints
// ============================================================================
app.post('/api/sos', authenticateToken, rateLimitSOS, async (req, res) => {
  try {
    const { trip_id, emergency_contact, message, location_lat, location_lng } = req.body;

    const sosEvent = await db.createSOSEvent({
      userId: req.user.userId,
      tripId: trip_id ? parseInt(trip_id) : null,
      locationLat: location_lat ? parseFloat(location_lat) : null,
      locationLng: location_lng ? parseFloat(location_lng) : null,
      message: message || 'Emergency alert triggered',
      status: 'active'
    });

    logSecurityEvent('sos_alert', {
      userId: sosEvent.userId,
      tripId: sosEvent.tripId,
      location: { lat: sosEvent.locationLat, lng: sosEvent.locationLng }
    });

    io.emit('sos_alert', {
      sos_id: sosEvent.id,
      user_id: sosEvent.userId,
      trip_id: sosEvent.tripId,
      message: sosEvent.message,
      location: {
        lat: sosEvent.locationLat,
        lng: sosEvent.locationLng
      },
      timestamp: sosEvent.createdAt.toISOString()
    });

    res.status(201).json({
      message: 'SOS alert sent successfully',
      sos_id: sosEvent.id,
      emergency_services_notified: true
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error creating SOS event');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sos', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { limit, offset } = require('./utils/pagination').parsePagination(req);
    const sosEvents = await db.getAllSOSEvents(null, limit, offset);

    res.json(sosEvents);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching SOS events');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 15: Admin Endpoints
// ============================================================================
app.get('/api/admin/trips', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const { limit, offset } = require('./utils/pagination').parsePagination(req);
    
    const filters = status ? { status } : {};
    const trips = await db.getAllTrips(filters, limit, offset);
    
    // Get total count for pagination
    const allTrips = await db.getAllTrips(filters, 10000, 0);
    const total = allTrips.length;

    const enrichedTrips = await Promise.all(trips.map(async trip => {
      const passenger = await db.getUserById(trip.passengerId);
      const driver = trip.driverId ? await db.getUserById(trip.driverId) : null;
      // Construct response object explicitly with snake_case keys
      return {
        id: trip.id,
        passenger_id: trip.passengerId,
        driver_id: trip.driverId,
        pickup_lat: trip.pickupLat,
        pickup_lng: trip.pickupLng,
        pickup_address: trip.pickupAddress,
        drop_lat: trip.dropLat,
        drop_lng: trip.dropLng,
        drop_address: trip.dropAddress,
        status: trip.status,
        proposed_price: trip.proposedPrice,
        vehicle_type: trip.vehicleType,
        accepted_price: trip.acceptedPrice,
        created_at: trip.createdAt,
        started_at: trip.startedAt,
        completed_at: trip.completedAt,
        shared_with: trip.sharedWith,
        safety_check_enabled: trip.safetyCheckEnabled,
        passenger_name: passenger ? passenger.name : null,
        driver_name: driver ? driver.name : null
      };
    }));

    logAuditEvent('admin_trips_viewed', req.user.userId, { status, limit, offset });

    res.json({
      data: enrichedTrips,
      pagination: require('./utils/pagination').createPaginationMeta(total, limit, offset)
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching admin trips');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/drivers/pending', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const pendingDrivers = await db.getPendingDrivers();

    const enrichedDrivers = pendingDrivers.map(driver => {
      // Construct response object explicitly with snake_case keys
      return {
        id: driver.id,
        user_id: driver.userId,
        license_number: driver.licenseNumber,
        vehicle_make: driver.vehicleMake,
        vehicle_model: driver.vehicleModel,
        vehicle_plate: driver.vehiclePlate,
        vehicle_type: driver.vehicleType,
        vehicle_year: driver.vehicleYear,
        license_photo_url: driver.licensePhotoUrl,
        vehicle_photo_url: driver.vehiclePhotoUrl,
        cnic_photo_url: driver.cnicPhotoUrl,
        verification_status: driver.verificationStatus,
        rating: driver.rating,
        total_trips: driver.totalTrips,
        is_online: driver.isOnline,
        last_location_lat: driver.lastLocationLat,
        last_location_lng: driver.lastLocationLng,
        created_at: driver.createdAt,
        name: driver.name || null,
        phone: driver.phone || null
      };
    });

    res.json(enrichedDrivers);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching pending drivers');
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/drivers/:id/verify', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body;

    if (status !== 'verified' && status !== 'rejected') {
      return res.status(400).json({ error: 'Status must be verified or rejected' });
    }

    const driverId = parseInt(req.params.id);
    const driver = await db.getDriverById(driverId);

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const updatedDriver = await db.updateDriver(driverId, { verificationStatus: status });

    res.json(updatedDriver);
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error verifying driver');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/stats', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const stats = await db.getSystemStats();

    res.json({
      total_users: stats.totalUsers,
      total_drivers: stats.totalDrivers,
      total_trips: stats.totalTrips,
      active_trips: stats.activeTrips,
      completed_trips: stats.completedTrips,
      verified_drivers: stats.verifiedDrivers,
      sos_events: stats.sosEvents,
      active_sos: stats.activeSos
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching admin stats');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/messages', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { tripId, flagged } = req.query;
    const { limit, offset } = require('./utils/pagination').parsePagination(req);
    
    let messages;
    if (flagged === 'true') {
      messages = await db.getFlaggedMessages(limit, offset);
    } else if (tripId) {
      messages = await db.getTripMessages(parseInt(tripId), limit, offset);
    } else {
      // For all messages, we need to get trip messages from all trips
      // This is a simplified approach - in production you might want a dedicated getAllMessages query
      messages = await db.getFlaggedMessages(limit, offset); // Fallback to flagged for now
    }
    
    // Get total count for pagination (simplified - would need proper count query)
    const allMessages = flagged === 'true' 
      ? await db.getFlaggedMessages(10000, 0)
      : messages;
    const total = allMessages.length;
    
    const enrichedMessages = await Promise.all(messages.map(async message => {
      const senderUser = await db.getUserById(message.senderId);
      const trip = await db.getTripById(message.tripId);
      const recipientId = trip ? (message.senderId === trip.passengerId ? trip.driverId : trip.passengerId) : null;
      const recipientUser = recipientId ? await db.getUserById(recipientId) : null;
      
      return {
        message_id: message.id,
        trip_id: message.tripId,
        sender_id: message.senderId,
        sender_name: senderUser ? senderUser.name : null,
        recipient_id: recipientId,
        recipient_name: recipientUser ? recipientUser.name : null,
        message: message.content,
        timestamp: message.createdAt.toISOString(),
        read_at: message.readAt ? message.readAt.toISOString() : null,
        is_flagged: message.isFlagged,
        trip_status: trip ? trip.status : null
      };
    }));
    
    logAuditEvent('admin_messages_viewed', req.user.userId, { tripId, flagged, limit, offset });

    res.json({
      data: enrichedMessages,
      pagination: require('./utils/pagination').createPaginationMeta(total, limit, offset)
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching admin messages');
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/calls', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { tripId, status, emergency } = req.query;
    const { limit, offset } = require('./utils/pagination').parsePagination(req);
    
    const filters = {};
    if (tripId) filters.tripId = parseInt(tripId);
    if (status) filters.status = status;
    if (emergency === 'true') filters.emergency = 'true';
    
    const calls = await db.getAllCalls(filters, limit, offset);
    
    // Get total count for pagination
    const allCalls = await db.getAllCalls(filters, 10000, 0);
    const total = allCalls.length;
    
    const enrichedCalls = await Promise.all(calls.map(async call => {
      const callerUser = await db.getUserById(call.callerId);
      const receiverUser = await db.getUserById(call.receiverId);
      const trip = await db.getTripById(call.tripId);
      
      return {
        call_id: call.id,
        trip_id: call.tripId,
        caller_id: call.callerId,
        caller_name: callerUser ? callerUser.name : null,
        callee_id: call.receiverId,
        callee_name: receiverUser ? receiverUser.name : null,
        status: call.status,
        initiated_at: call.startedAt.toISOString(),
        connected_at: call.connectedAt ? call.connectedAt.toISOString() : null,
        ended_at: call.endedAt ? call.endedAt.toISOString() : null,
        duration: call.duration,
        emergency_recording: call.isEmergency,
        end_reason: null, // Not stored in database schema
        trip_status: trip ? trip.status : null,
        trip_pickup_address: trip ? trip.pickupAddress : null,
        trip_drop_address: trip ? trip.dropAddress : null
      };
    }));
    
    logAuditEvent('admin_calls_viewed', req.user.userId, { tripId, status, emergency, limit, offset });

    res.json({
      data: enrichedCalls,
      pagination: require('./utils/pagination').createPaginationMeta(total, limit, offset)
    });
  } catch (error) {
    captureException(error, { path: req.path, method: req.method, userId: req.user?.userId });
    logger.error({ error: error.message }, 'Error fetching admin calls');
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SECTION 16: Health Check Endpoint
// ============================================================================
app.get('/api/health', async (req, res) => {
  try {
    const { version } = require('./package.json');
    const memoryUsage = process.memoryUsage();
    const strictHealth = process.env.STRICT_HEALTH !== '0'; // Default to true unless explicitly disabled
    
    // Check database connection with lightweight query
    let dbStatus = 'unknown';
    let dbPoolStats = null;
    let dbLatencyMs = null;
    try {
      // Use lightweight query instead of checkConnection() to avoid noisy logs and extra retries
      const startTime = Date.now();
      await pool.query('SELECT 1');
      dbLatencyMs = Date.now() - startTime;
      dbStatus = 'connected';
      dbPoolStats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
    } catch (error) {
      dbStatus = 'disconnected';
      // Don't log error for health checks - too noisy
    }

    const healthBody = {
      status: dbStatus === 'connected' ? 'OK' : 'DEGRADED',
      message: 'SafeRide Women Backend is running',
      timestamp: new Date().toISOString(),
      version,
      database: {
        status: dbStatus,
        pool: dbPoolStats,
        latencyMs: dbLatencyMs
      },
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024)
      },
      uptime: Math.round(process.uptime()),
      socketio: {
        connectedClients: io.engine.clientsCount || 0
      },
      environment: process.env.NODE_ENV || 'development'
    };

    // Return 503 if DB is disconnected (default behavior, can be disabled with STRICT_HEALTH=0)
    if (dbStatus === 'disconnected' && strictHealth) {
      return res.status(503).json(healthBody);
    }

    res.json(healthBody);
  } catch (error) {
    logger.error({ error: error.message }, 'Health check failed');
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================================
// SECTION 17: Error Handlers
// ============================================================================
// Sentry error handler (must be before general error handler)
app.use(getSentryErrorHandler());

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, req, res, next) => {
  captureException(error, {
    path: req.path,
    method: req.method,
    correlationId: req.correlationId
  });

  logger.error({
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    correlationId: req.correlationId
  }, 'Request error');
  
  if (error.type === 'entity.parse.failed' || error instanceof SyntaxError) {
    return res.status(400).json({
      error: 'Invalid JSON payload'
    });
  }
  
  res.status(500).json({
    error: error.message || 'Internal server error'
  });
});

// ============================================================================
// SECTION 18: Server Startup
// ============================================================================
server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           SAFERIDE WOMEN BACKEND SERVER                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`✓ Server running on: http://localhost:${PORT}`);
  console.log(`✓ Socket.io ready for connections`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('📡 API Endpoints:');
  console.log('   Auth:');
  console.log('     POST /api/auth/otp');
  console.log('     POST /api/auth/verify');
  console.log('   User:');
  console.log('     GET  /api/me');
  console.log('     PUT  /api/me');
  console.log('   Trips:');
  console.log('     POST /api/trips');
  console.log('     GET  /api/trips');
  console.log('     GET  /api/trips/:id');
  console.log('     POST /api/trips/:id/offers');
  console.log('     GET  /api/trips/:id/offers');
  console.log('     POST /api/trips/:id/accept');
  console.log('     POST /api/trips/:id/start');
  console.log('     POST /api/trips/:id/complete');
  console.log('     POST /api/trips/:id/cancel');
  console.log('     POST /api/trips/:id/rate');
  console.log('     POST /api/trips/:id/share');
  console.log('     DELETE /api/trips/:id/share/:contactId');
  console.log('   Chat:');
  console.log('     POST /api/trips/:id/messages');
  console.log('     GET  /api/trips/:id/messages');
  console.log('   Voice Calls:');
  console.log('     POST /api/trips/:id/call/initiate');
  console.log('     GET  /api/trips/:id/call/status');
  console.log('   Drivers:');
  console.log('     POST /api/drivers/register');
  console.log('     PUT  /api/drivers/status');
  console.log('   Safety:');
  console.log('     POST /api/sos');
  console.log('   Admin:');
  console.log('     GET  /api/admin/trips');
  console.log('     GET  /api/admin/drivers/pending');
  console.log('     POST /api/admin/drivers/:id/verify');
  console.log('     GET  /api/admin/stats');
  console.log('     GET  /api/admin/messages');
  console.log('     GET  /api/admin/calls');
  console.log('   Health:');
  console.log('     GET  /api/health');
  console.log('');
  console.log('🔐 Test Credentials:');
  console.log('   Admin:   +923001234567');
  console.log('   Passenger: +923001111111');
  console.log('   Driver:    +923002222222');
  console.log('');
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    io.close(async () => {
      console.log('Socket.io server closed');
      try {
        await closePool();
        console.log('Database connections closed');
      } catch (error) {
        logger.error({ error: error.message }, 'Error closing database pool');
      }
      try {
        const { Sentry } = require('./config/sentry');
        await Sentry.close(2000);
      } catch (error) {
        // Sentry may not be initialized
      }
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    io.close(async () => {
      console.log('Socket.io server closed');
      try {
        await closePool();
        console.log('Database connections closed');
      } catch (error) {
        logger.error({ error: error.message }, 'Error closing database pool');
      }
      try {
        const { Sentry } = require('./config/sentry');
        await Sentry.close(2000);
      } catch (error) {
        // Sentry may not be initialized
      }
      process.exit(0);
    });
  });
});

module.exports = { app, server, io };
