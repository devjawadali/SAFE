const { pool } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * Convert snake_case database row to camelCase object
 */
function toCamelCase(row) {
  if (!row) return null;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/**
 * Convert array of rows to camelCase
 */
function toCamelCaseArray(rows) {
  return rows.map(toCamelCase);
}

// ============================================================================
// USER QUERIES
// ============================================================================

/**
 * Get user by ID
 * @param {number} id - User ID
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserById(id) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id }, 'Error getting user by ID');
    return null;
  }
}

/**
 * Get user by phone number
 * @param {string} phone - Phone number
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserByPhone(phone) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, phone }, 'Error getting user by phone');
    return null;
  }
}

/**
 * Create new user
 * @param {Object} userData - User data
 * @returns {Promise<Object|null>} Created user object
 */
async function createUser(userData) {
  try {
    const { phone, name, role, verified = true, emergencyContact = null, trustedContacts = [], city = null, gender = null, profilePictureUrl = null } = userData;
    const result = await pool.query(
      `INSERT INTO users (phone, name, city, gender, profile_picture_url, role, verified, emergency_contact, trusted_contacts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [phone, name, city, gender, profilePictureUrl, role, verified, emergencyContact, trustedContacts]
    );
    return toCamelCase(result.rows[0]);
  } catch (error) {
    logger.error({ error: error.message, userData }, 'Error creating user');
    throw error;
  }
}

/**
 * Update user
 * @param {number} id - User ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated user object
 */
async function updateUser(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramCount++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      return await getUserById(id);
    }

    values.push(id);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id, updates }, 'Error updating user');
    throw error;
  }
}

/**
 * Get all users
 * @returns {Promise<Array>} Array of user objects
 */
async function getAllUsers() {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id');
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting all users');
    return [];
  }
}

// ============================================================================
// DRIVER QUERIES
// ============================================================================

/**
 * Get driver by ID (with user info)
 * @param {number} id - Driver ID
 * @returns {Promise<Object|null>} Driver object with user info
 */
async function getDriverById(id) {
  try {
    const result = await pool.query(
      `SELECT d.*, u.phone, u.name, u.role, u.verified, u.emergency_contact, u.trusted_contacts
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [id]
    );
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id }, 'Error getting driver by ID');
    return null;
  }
}

/**
 * Get driver by user ID
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} Driver object
 */
async function getDriverByUserId(userId) {
  try {
    const result = await pool.query('SELECT * FROM drivers WHERE user_id = $1', [userId]);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, userId }, 'Error getting driver by user ID');
    return null;
  }
}

/**
 * Create driver record
 * @param {Object} driverData - Driver data
 * @returns {Promise<Object|null>} Created driver object
 */
async function createDriver(driverData) {
  try {
    const {
      id, userId, licenseNumber, vehicleMake, vehicleModel, vehiclePlate,
      vehicleType, vehicleYear = null, licensePhotoUrl = null,
      vehiclePhotoUrl = null, cnicPhotoUrl = null,
      verificationStatus = 'pending', rating = 5.0, totalTrips = 0,
      isOnline = false, lastLocationLat = null, lastLocationLng = null
    } = driverData;

    const result = await pool.query(
      `INSERT INTO drivers (
        id, user_id, license_number, vehicle_make, vehicle_model, vehicle_plate,
        vehicle_type, vehicle_year, license_photo_url, vehicle_photo_url, cnic_photo_url,
        verification_status, rating, total_trips, is_online, last_location_lat, last_location_lng
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        id, userId, licenseNumber, vehicleMake, vehicleModel, vehiclePlate,
        vehicleType, vehicleYear, licensePhotoUrl, vehiclePhotoUrl, cnicPhotoUrl,
        verificationStatus, rating, totalTrips, isOnline, lastLocationLat, lastLocationLng
      ]
    );
    return toCamelCase(result.rows[0]);
  } catch (error) {
    logger.error({ error: error.message, driverData }, 'Error creating driver');
    throw error;
  }
}

/**
 * Update driver
 * @param {number} id - Driver ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated driver object
 */
async function updateDriver(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramCount++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      return await getDriverById(id);
    }

    values.push(id);
    const query = `UPDATE drivers SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id, updates }, 'Error updating driver');
    throw error;
  }
}

/**
 * Get online drivers
 * @returns {Promise<Array>} Array of online driver objects
 */
async function getOnlineDrivers() {
  try {
    const result = await pool.query(
      'SELECT * FROM drivers WHERE is_online = true AND verification_status = $1',
      ['verified']
    );
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting online drivers');
    return [];
  }
}

/**
 * Get pending drivers (with user info)
 * @returns {Promise<Array>} Array of pending driver objects
 */
async function getPendingDrivers() {
  try {
    const result = await pool.query(
      `SELECT d.*, u.phone, u.name, u.role, u.verified
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       WHERE d.verification_status = 'pending'
       ORDER BY d.created_at DESC`
    );
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting pending drivers');
    return [];
  }
}

/**
 * Update driver rating and total trips
 * @param {number} driverId - Driver ID
 * @param {number} newRating - New average rating
 * @param {number} totalTrips - Total trips count
 * @returns {Promise<Object|null>} Updated driver object
 */
async function updateDriverRating(driverId, newRating, totalTrips) {
  try {
    const result = await pool.query(
      'UPDATE drivers SET rating = $1, total_trips = $2 WHERE id = $3 RETURNING *',
      [newRating, totalTrips, driverId]
    );
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, driverId, newRating, totalTrips }, 'Error updating driver rating');
    throw error;
  }
}

// ============================================================================
// TRIP QUERIES
// ============================================================================

/**
 * Get trip by ID
 * @param {number} id - Trip ID
 * @returns {Promise<Object|null>} Trip object
 */
async function getTripById(id) {
  try {
    const result = await pool.query('SELECT * FROM trips WHERE id = $1', [id]);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id }, 'Error getting trip by ID');
    return null;
  }
}

/**
 * Create trip
 * @param {Object} tripData - Trip data
 * @returns {Promise<Object|null>} Created trip object
 */
async function createTrip(tripData) {
  try {
    const {
      passengerId, driverId = null, pickupLat, pickupLng, pickupAddress,
      dropLat, dropLng, dropAddress, status = 'requested', proposedPrice,
      acceptedPrice = null, vehicleType = null, startedAt = null,
      completedAt = null, sharedWith = [], safetyCheckEnabled = true
    } = tripData;

    const result = await pool.query(
      `INSERT INTO trips (
        passenger_id, driver_id, pickup_lat, pickup_lng, pickup_address,
        drop_lat, drop_lng, drop_address, status, proposed_price,
        accepted_price, vehicle_type, started_at, completed_at, shared_with, safety_check_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        passengerId, driverId, pickupLat, pickupLng, pickupAddress,
        dropLat, dropLng, dropAddress, status, proposedPrice,
        acceptedPrice, vehicleType, startedAt, completedAt, sharedWith, safetyCheckEnabled
      ]
    );
    return toCamelCase(result.rows[0]);
  } catch (error) {
    logger.error({ error: error.message, tripData }, 'Error creating trip');
    throw error;
  }
}

/**
 * Update trip
 * @param {number} id - Trip ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated trip object
 */
async function updateTrip(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramCount++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      return await getTripById(id);
    }

    values.push(id);
    const query = `UPDATE trips SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id, updates }, 'Error updating trip');
    throw error;
  }
}

/**
 * Get user trips
 * @param {number} userId - User ID
 * @param {string|null} status - Filter by status (optional)
 * @param {number} limit - Limit results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of trip objects
 */
async function getUserTrips(userId, status = null, limit = 100, offset = 0) {
  try {
    let query = 'SELECT * FROM trips WHERE (passenger_id = $1 OR driver_id = $1)';
    const values = [userId];
    let paramCount = 2;

    if (status) {
      query += ` AND status = $${paramCount++}`;
      values.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, userId, status }, 'Error getting user trips');
    return [];
  }
}

/**
 * Get all trips with filters (for admin)
 * @param {Object} filters - Filter object
 * @param {number} limit - Limit results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of trip objects
 */
async function getAllTrips(filters = {}, limit = 100, offset = 0) {
  try {
    let query = 'SELECT * FROM trips WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND status = $${paramCount++}`;
      values.push(filters.status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, filters }, 'Error getting all trips');
    return [];
  }
}

/**
 * Get trip with user details
 * @param {number} id - Trip ID
 * @returns {Promise<Object|null>} Trip object with passenger and driver names
 */
async function getTripWithDetails(id) {
  try {
    const result = await pool.query(
      `SELECT t.*, 
              u1.name as passenger_name, u1.phone as passenger_phone,
              u2.name as driver_name, u2.phone as driver_phone
       FROM trips t
       LEFT JOIN users u1 ON t.passenger_id = u1.id
       LEFT JOIN users u2 ON t.driver_id = u2.id
       WHERE t.id = $1`,
      [id]
    );
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id }, 'Error getting trip with details');
    return null;
  }
}

// ============================================================================
// OFFER QUERIES
// ============================================================================

/**
 * Get offer by ID
 * @param {number} id - Offer ID
 * @returns {Promise<Object|null>} Offer object
 */
async function getOfferById(id) {
  try {
    const result = await pool.query('SELECT * FROM offers WHERE id = $1', [id]);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id }, 'Error getting offer by ID');
    return null;
  }
}

/**
 * Create offer
 * @param {Object} offerData - Offer data
 * @returns {Promise<Object|null>} Created offer object
 */
async function createOffer(offerData) {
  try {
    const { tripId, driverId, price, eta, message = null, status = 'pending' } = offerData;
    const result = await pool.query(
      `INSERT INTO offers (trip_id, driver_id, price, eta, message, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tripId, driverId, price, eta, message, status]
    );
    return toCamelCase(result.rows[0]);
  } catch (error) {
    logger.error({ error: error.message, offerData }, 'Error creating offer');
    throw error;
  }
}

/**
 * Update offer
 * @param {number} id - Offer ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated offer object
 */
async function updateOffer(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramCount++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      return await getOfferById(id);
    }

    values.push(id);
    const query = `UPDATE offers SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id, updates }, 'Error updating offer');
    throw error;
  }
}

/**
 * Get trip offers
 * @param {number} tripId - Trip ID
 * @param {string|null} status - Filter by status (optional)
 * @returns {Promise<Array>} Array of offer objects with driver details
 */
async function getTripOffers(tripId, status = null) {
  try {
    let query = `
      SELECT o.*, u.name as driver_name, u.phone as driver_phone,
             d.vehicle_make, d.vehicle_model, d.vehicle_plate, d.vehicle_type, d.rating
      FROM offers o
      JOIN users u ON o.driver_id = u.id
      LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE o.trip_id = $1
    `;
    const values = [tripId];

    if (status) {
      query += ' AND o.status = $2';
      values.push(status);
    }

    query += ' ORDER BY o.created_at DESC';

    const result = await pool.query(query, values);
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, tripId, status }, 'Error getting trip offers');
    return [];
  }
}

/**
 * Reject all other offers for a trip (when one is accepted)
 * @param {number} tripId - Trip ID
 * @param {number} acceptedOfferId - Accepted offer ID
 * @returns {Promise<number>} Number of rejected offers
 */
async function rejectOtherOffers(tripId, acceptedOfferId) {
  try {
    const result = await pool.query(
      `UPDATE offers SET status = 'rejected'
       WHERE trip_id = $1 AND id != $2 AND status = 'pending'
       RETURNING id`,
      [tripId, acceptedOfferId]
    );
    return result.rowCount;
  } catch (error) {
    logger.error({ error: error.message, tripId, acceptedOfferId }, 'Error rejecting other offers');
    throw error;
  }
}

// ============================================================================
// RATING QUERIES
// ============================================================================

/**
 * Create rating
 * @param {Object} ratingData - Rating data
 * @returns {Promise<Object|null>} Created rating object
 */
async function createRating(ratingData) {
  try {
    const { tripId, passengerId, driverId, rating, comment = null } = ratingData;
    const result = await pool.query(
      `INSERT INTO ratings (trip_id, passenger_id, driver_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tripId, passengerId, driverId, rating, comment]
    );
    return toCamelCase(result.rows[0]);
  } catch (error) {
    logger.error({ error: error.message, ratingData }, 'Error creating rating');
    throw error;
  }
}

/**
 * Get rating for a trip
 * @param {number} tripId - Trip ID
 * @returns {Promise<Object|null>} Rating object
 */
async function getTripRating(tripId) {
  try {
    const result = await pool.query('SELECT * FROM ratings WHERE trip_id = $1', [tripId]);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, tripId }, 'Error getting trip rating');
    return null;
  }
}

/**
 * Get all ratings for a driver
 * @param {number} driverId - Driver ID
 * @returns {Promise<Array>} Array of rating objects
 */
async function getDriverRatings(driverId) {
  try {
    const result = await pool.query(
      'SELECT * FROM ratings WHERE driver_id = $1 ORDER BY created_at DESC',
      [driverId]
    );
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, driverId }, 'Error getting driver ratings');
    return [];
  }
}

/**
 * Calculate average rating for a driver
 * @param {number} driverId - Driver ID
 * @returns {Promise<number>} Average rating
 */
async function calculateDriverAverageRating(driverId) {
  try {
    const result = await pool.query(
      'SELECT AVG(rating) as avg_rating FROM ratings WHERE driver_id = $1',
      [driverId]
    );
    return parseFloat(result.rows[0]?.avg_rating || 0);
  } catch (error) {
    logger.error({ error: error.message, driverId }, 'Error calculating driver average rating');
    return 0;
  }
}

// ============================================================================
// MESSAGE QUERIES
// ============================================================================

/**
 * Create message
 * @param {Object} messageData - Message data
 * @returns {Promise<Object|null>} Created message object
 */
async function createMessage(messageData) {
  try {
    const { tripId, senderId, content, isFlagged = false } = messageData;
    const result = await pool.query(
      `INSERT INTO messages (trip_id, sender_id, content, is_flagged)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tripId, senderId, content, isFlagged]
    );
    return toCamelCase(result.rows[0]);
  } catch (error) {
    logger.error({ error: error.message, messageData }, 'Error creating message');
    throw error;
  }
}

/**
 * Get trip messages
 * @param {number} tripId - Trip ID
 * @param {number} limit - Limit results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of message objects with sender names
 */
async function getTripMessages(tripId, limit = 100, offset = 0) {
  try {
    const result = await pool.query(
      `SELECT m.*, u.name as sender_name
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.trip_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2 OFFSET $3`,
      [tripId, limit, offset]
    );
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, tripId }, 'Error getting trip messages');
    return [];
  }
}

/**
 * Update message read status
 * @param {number} messageId - Message ID
 * @returns {Promise<Object|null>} Updated message object
 */
async function updateMessageReadStatus(messageId) {
  try {
    const result = await pool.query(
      `UPDATE messages SET read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND read_at IS NULL
       RETURNING *`,
      [messageId]
    );
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, messageId }, 'Error updating message read status');
    return null;
  }
}

/**
 * Get flagged messages (for admin)
 * @param {number} limit - Limit results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of flagged message objects
 */
async function getFlaggedMessages(limit = 100, offset = 0) {
  try {
    const result = await pool.query(
      `SELECT m.*, u.name as sender_name, t.status as trip_status
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       LEFT JOIN trips t ON m.trip_id = t.id
       WHERE m.is_flagged = true
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting flagged messages');
    return [];
  }
}

// ============================================================================
// CALL QUERIES
// ============================================================================

/**
 * Create call
 * @param {Object} callData - Call data
 * @returns {Promise<Object|null>} Created call object
 */
async function createCall(callData) {
  try {
    const {
      tripId, callerId, receiverId, status = 'ringing',
      isEmergency = false
    } = callData;

    const result = await pool.query(
      `INSERT INTO calls (trip_id, caller_id, receiver_id, status, is_emergency)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tripId, callerId, receiverId, status, isEmergency]
    );
    return toCamelCase(result.rows[0]);
  } catch (error) {
    logger.error({ error: error.message, callData }, 'Error creating call');
    throw error;
  }
}

/**
 * Update call
 * @param {number} id - Call ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated call object
 */
async function updateCall(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramCount++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      return await getCallById(id);
    }

    values.push(id);
    const query = `UPDATE calls SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id, updates }, 'Error updating call');
    throw error;
  }
}

/**
 * Get call by ID
 * @param {number} id - Call ID
 * @returns {Promise<Object|null>} Call object
 */
async function getCallById(id) {
  try {
    const result = await pool.query('SELECT * FROM calls WHERE id = $1', [id]);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id }, 'Error getting call by ID');
    return null;
  }
}

/**
 * Get calls for a trip
 * @param {number} tripId - Trip ID
 * @returns {Promise<Array>} Array of call objects
 */
async function getTripCalls(tripId) {
  try {
    const result = await pool.query(
      'SELECT * FROM calls WHERE trip_id = $1 ORDER BY started_at DESC',
      [tripId]
    );
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, tripId }, 'Error getting trip calls');
    return [];
  }
}

/**
 * Get active calls for a trip
 * @param {number} tripId - Trip ID
 * @returns {Promise<Array>} Array of active call objects
 */
async function getActiveCalls(tripId) {
  try {
    const result = await pool.query(
      `SELECT * FROM calls
       WHERE trip_id = $1 AND status IN ('ringing', 'connected')
       ORDER BY started_at DESC`,
      [tripId]
    );
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, tripId }, 'Error getting active calls');
    return [];
  }
}

/**
 * Get all calls with filters (for admin)
 * @param {Object} filters - Filter object
 * @param {number} limit - Limit results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of call objects
 */
async function getAllCalls(filters = {}, limit = 100, offset = 0) {
  try {
    let query = 'SELECT * FROM calls WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.tripId) {
      query += ` AND trip_id = $${paramCount++}`;
      values.push(filters.tripId);
    }

    if (filters.status) {
      query += ` AND status = $${paramCount++}`;
      values.push(filters.status);
    }

    if (filters.emergency === 'true') {
      query += ` AND is_emergency = true`;
    }

    query += ` ORDER BY started_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, filters }, 'Error getting all calls');
    return [];
  }
}

// ============================================================================
// SOS QUERIES
// ============================================================================

/**
 * Create SOS event
 * @param {Object} sosData - SOS event data
 * @returns {Promise<Object|null>} Created SOS event object
 */
async function createSOSEvent(sosData) {
  try {
    const {
      userId, tripId = null, locationLat, locationLng,
      message = 'Emergency alert triggered', status = 'active'
    } = sosData;

    const result = await pool.query(
      `INSERT INTO sos_events (user_id, trip_id, location_lat, location_lng, message, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, tripId, locationLat, locationLng, message, status]
    );
    return toCamelCase(result.rows[0]);
  } catch (error) {
    logger.error({ error: error.message, sosData }, 'Error creating SOS event');
    throw error;
  }
}

/**
 * Update SOS event
 * @param {number} id - SOS event ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated SOS event object
 */
async function updateSOSEvent(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = $${paramCount++}`);
      values.push(value);
    }

    if (fields.length === 0) {
      const result = await pool.query('SELECT * FROM sos_events WHERE id = $1', [id]);
      return toCamelCase(result.rows[0] || null);
    }

    values.push(id);
    const query = `UPDATE sos_events SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message, id, updates }, 'Error updating SOS event');
    throw error;
  }
}

/**
 * Get all SOS events with filters
 * @param {string|null} status - Filter by status (optional)
 * @param {number} limit - Limit results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of SOS event objects
 */
async function getAllSOSEvents(status = null, limit = 100, offset = 0) {
  try {
    let query = 'SELECT * FROM sos_events WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (status) {
      query += ` AND status = $${paramCount++}`;
      values.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return toCamelCaseArray(result.rows);
  } catch (error) {
    logger.error({ error: error.message, status }, 'Error getting all SOS events');
    return [];
  }
}

// ============================================================================
// TOKEN QUERIES
// ============================================================================

/**
 * Save refresh token
 * @param {string} token - Refresh token
 * @param {number} userId - User ID
 * @param {Date} expiresAt - Expiration date
 * @returns {Promise<void>}
 */
async function saveRefreshToken(token, userId, expiresAt) {
  try {
    await pool.query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET expires_at = $3',
      [token, userId, expiresAt]
    );
  } catch (error) {
    logger.error({ error: error.message, userId }, 'Error saving refresh token');
    throw error;
  }
}

/**
 * Get refresh token
 * @param {string} token - Refresh token
 * @returns {Promise<Object|null>} Token session object
 */
async function getRefreshToken(token) {
  try {
    const result = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
      [token]
    );
    return toCamelCase(result.rows[0] || null);
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting refresh token');
    return null;
  }
}

/**
 * Delete refresh token
 * @param {string} token - Refresh token
 * @returns {Promise<void>}
 */
async function deleteRefreshToken(token) {
  try {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  } catch (error) {
    logger.error({ error: error.message }, 'Error deleting refresh token');
    throw error;
  }
}

/**
 * Delete all refresh tokens for a user
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
async function deleteUserRefreshTokens(userId) {
  try {
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  } catch (error) {
    logger.error({ error: error.message, userId }, 'Error deleting user refresh tokens');
    throw error;
  }
}

/**
 * Cleanup expired refresh tokens
 * @returns {Promise<number>} Number of deleted tokens
 */
async function cleanupExpiredRefreshTokens() {
  try {
    const result = await pool.query(
      'DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP'
    );
    return result.rowCount;
  } catch (error) {
    logger.error({ error: error.message }, 'Error cleaning up expired refresh tokens');
    return 0;
  }
}

/**
 * Save revoked token
 * @param {string} tokenHash - SHA-256 hash of token
 * @param {Date} expiresAt - Expiration date
 * @returns {Promise<void>}
 */
async function saveRevokedToken(tokenHash, expiresAt) {
  try {
    await pool.query(
      'INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, $2) ON CONFLICT (token_hash) DO NOTHING',
      [tokenHash, expiresAt]
    );
  } catch (error) {
    logger.error({ error: error.message }, 'Error saving revoked token');
    throw error;
  }
}

/**
 * Check if token is revoked
 * @param {string} tokenHash - SHA-256 hash of token
 * @returns {Promise<boolean>} True if token is revoked
 */
async function isTokenRevoked(tokenHash) {
  try {
    const result = await pool.query(
      'SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP) as revoked',
      [tokenHash]
    );
    return result.rows[0]?.revoked || false;
  } catch (error) {
    logger.error({ error: error.message }, 'Error checking token revocation');
    return false;
  }
}

/**
 * Cleanup expired revoked tokens
 * @returns {Promise<number>} Number of deleted tokens
 */
async function cleanupExpiredRevokedTokens() {
  try {
    const result = await pool.query(
      'DELETE FROM revoked_tokens WHERE expires_at < CURRENT_TIMESTAMP'
    );
    return result.rowCount;
  } catch (error) {
    logger.error({ error: error.message }, 'Error cleaning up expired revoked tokens');
    return 0;
  }
}

// ============================================================================
// ADMIN/STATS QUERIES
// ============================================================================

/**
 * Get system statistics
 * @returns {Promise<Object>} System statistics object
 */
async function getSystemStats() {
  try {
    const [
      usersCount,
      driversCount,
      tripsCount,
      activeTripsCount,
      completedTripsCount,
      verifiedDriversCount,
      sosCount,
      activeSosCount
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query('SELECT COUNT(*) as count FROM drivers'),
      pool.query('SELECT COUNT(*) as count FROM trips'),
      pool.query("SELECT COUNT(*) as count FROM trips WHERE status IN ('requested', 'accepted', 'in_progress')"),
      pool.query("SELECT COUNT(*) as count FROM trips WHERE status = 'completed'"),
      pool.query("SELECT COUNT(*) as count FROM drivers WHERE verification_status = 'verified'"),
      pool.query('SELECT COUNT(*) as count FROM sos_events'),
      pool.query("SELECT COUNT(*) as count FROM sos_events WHERE status = 'active'")
    ]);

    return {
      totalUsers: parseInt(usersCount.rows[0].count),
      totalDrivers: parseInt(driversCount.rows[0].count),
      totalTrips: parseInt(tripsCount.rows[0].count),
      activeTrips: parseInt(activeTripsCount.rows[0].count),
      completedTrips: parseInt(completedTripsCount.rows[0].count),
      verifiedDrivers: parseInt(verifiedDriversCount.rows[0].count),
      sosEvents: parseInt(sosCount.rows[0].count),
      activeSos: parseInt(activeSosCount.rows[0].count)
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting system stats');
    return {
      totalUsers: 0,
      totalDrivers: 0,
      totalTrips: 0,
      activeTrips: 0,
      completedTrips: 0,
      verifiedDrivers: 0,
      sosEvents: 0,
      activeSos: 0
    };
  }
}

module.exports = {
  // User queries
  getUserById,
  getUserByPhone,
  createUser,
  updateUser,
  getAllUsers,
  
  // Driver queries
  getDriverById,
  getDriverByUserId,
  createDriver,
  updateDriver,
  getOnlineDrivers,
  getPendingDrivers,
  updateDriverRating,
  
  // Trip queries
  getTripById,
  createTrip,
  updateTrip,
  getUserTrips,
  getAllTrips,
  getTripWithDetails,
  
  // Offer queries
  getOfferById,
  createOffer,
  updateOffer,
  getTripOffers,
  rejectOtherOffers,
  
  // Rating queries
  createRating,
  getTripRating,
  getDriverRatings,
  calculateDriverAverageRating,
  
  // Message queries
  createMessage,
  getTripMessages,
  updateMessageReadStatus,
  getFlaggedMessages,
  
  // Call queries
  createCall,
  updateCall,
  getCallById,
  getTripCalls,
  getActiveCalls,
  getAllCalls,
  
  // SOS queries
  createSOSEvent,
  updateSOSEvent,
  getAllSOSEvents,
  
  // Token queries
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  cleanupExpiredRefreshTokens,
  saveRevokedToken,
  isTokenRevoked,
  cleanupExpiredRevokedTokens,
  
  // Admin queries
  getSystemStats
};

