/**
 * Centralized authorization helpers for resource-level access control
 */

/**
 * Check if user can access a trip
 */
function canAccessTrip(userId, tripId, role, trip) {
  if (!trip) {
    return { allowed: false, error: 'Trip not found' };
  }

  // Admins can access all trips
  if (role === 'admin') {
    return { allowed: true };
  }

  // User must be passenger or driver of the trip
  if (trip.passengerId !== userId && trip.driverId !== userId) {
    return { allowed: false, error: 'Access denied' };
  }

  return { allowed: true };
}

/**
 * Check if user can write to trip (modify trip state)
 */
function canWriteTrip(userId, tripId, role, trip) {
  const accessCheck = canAccessTrip(userId, tripId, role, trip);
  if (!accessCheck.allowed) {
    return accessCheck;
  }

  // Admins can modify trips
  if (role === 'admin') {
    return { allowed: true };
  }

  // Passengers can modify their own trips in certain states
  if (trip.passengerId === userId) {
    if (['requested', 'accepted'].includes(trip.status)) {
      return { allowed: true };
    }
  }

  // Drivers can modify trips they're assigned to
  if (trip.driverId === userId) {
    if (['accepted', 'in_progress'].includes(trip.status)) {
      return { allowed: true };
    }
  }

  return { allowed: false, error: 'Cannot modify trip in current state' };
}

/**
 * Check if user can access messages for a trip
 */
function canAccessMessages(userId, tripId, role, trip) {
  return canAccessTrip(userId, tripId, role, trip);
}

/**
 * Check if user can write messages
 */
function canWriteMessage(userId, tripId, role, trip) {
  const accessCheck = canAccessTrip(userId, tripId, role, trip);
  if (!accessCheck.allowed) {
    return accessCheck;
  }

  // Only allow writing during active trips
  if (!['accepted', 'in_progress'].includes(trip.status)) {
    return { allowed: false, error: 'Chat is disabled for this trip' };
  }

  return { allowed: true };
}

/**
 * Check if user can access calls for a trip
 */
function canAccessCalls(userId, tripId, role, trip) {
  return canAccessTrip(userId, tripId, role, trip);
}

/**
 * Check if user can initiate calls
 */
function canInitiateCall(userId, tripId, role, trip) {
  const accessCheck = canAccessTrip(userId, tripId, role, trip);
  if (!accessCheck.allowed) {
    return accessCheck;
  }

  // Only allow during active trips
  if (!['accepted', 'in_progress'].includes(trip.status)) {
    return { allowed: false, error: 'Call not available for this trip' };
  }

  return { allowed: true };
}

/**
 * Check if user can access offers for a trip
 */
function canAccessOffers(userId, tripId, role, trip) {
  return canAccessTrip(userId, tripId, role, trip);
}

/**
 * Check if user can create offers
 */
function canCreateOffer(userId, tripId, role, trip) {
  if (role !== 'driver') {
    return { allowed: false, error: 'Only drivers can create offers' };
  }

  if (!trip || trip.status !== 'requested') {
    return { allowed: false, error: 'Trip not available for offers' };
  }

  return { allowed: true };
}

/**
 * Check if user is admin
 */
function isAdmin(role) {
  return role === 'admin';
}

module.exports = {
  canAccessTrip,
  canWriteTrip,
  canAccessMessages,
  canWriteMessage,
  canAccessCalls,
  canInitiateCall,
  canAccessOffers,
  canCreateOffer,
  isAdmin
};
































