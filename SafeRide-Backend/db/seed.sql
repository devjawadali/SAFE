-- SafeRide Backend Database Seed Data
-- Sample data for development and testing
-- This matches the initializeDatabase() function from server.js

-- ============================================================================
-- USERS
-- ============================================================================

-- Admin user
INSERT INTO users (id, phone, name, role, verified, emergency_contact, trusted_contacts)
VALUES (1, '+923001234567', 'Admin User', 'admin', true, NULL, ARRAY[]::TEXT[])
ON CONFLICT (id) DO NOTHING;

-- Test passenger
INSERT INTO users (id, phone, name, role, verified, emergency_contact, trusted_contacts)
VALUES (2, '+923001111111', 'Test Passenger', 'passenger', true, '+923009999999', ARRAY[]::TEXT[])
ON CONFLICT (id) DO NOTHING;

-- Test driver user
INSERT INTO users (id, phone, name, role, verified, emergency_contact, trusted_contacts)
VALUES (3, '+923002222222', 'Test Driver', 'driver', true, NULL, ARRAY[]::TEXT[])
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- DRIVERS
-- ============================================================================

-- Driver record for user id=3
INSERT INTO drivers (
    id, user_id, license_number, vehicle_make, vehicle_model, 
    vehicle_plate, vehicle_type, vehicle_year, verification_status, 
    rating, total_trips, is_online
)
VALUES (
    3, 3, 'DL123456', 'Toyota', 'Corolla', 
    'ABC-123', 'car', 2020, 'verified',
    4.8, 15, false
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RESET SEQUENCES
-- ============================================================================

-- Reset sequences to start from next available ID based on current max ID
-- This makes the seed idempotent and safe to re-run on non-empty databases
SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 0) + 1, false);
SELECT setval('trips_id_seq', COALESCE((SELECT MAX(id) FROM trips), 0) + 1, false);
SELECT setval('offers_id_seq', COALESCE((SELECT MAX(id) FROM offers), 0) + 1, false);
SELECT setval('ratings_id_seq', COALESCE((SELECT MAX(id) FROM ratings), 0) + 1, false);
SELECT setval('sos_events_id_seq', COALESCE((SELECT MAX(id) FROM sos_events), 0) + 1, false);
SELECT setval('messages_id_seq', COALESCE((SELECT MAX(id) FROM messages), 0) + 1, false);
SELECT setval('calls_id_seq', COALESCE((SELECT MAX(id) FROM calls), 0) + 1, false);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE users IS 'Stores all users (passengers, drivers, admins)';
COMMENT ON TABLE drivers IS 'Stores driver-specific information linked to users';
COMMENT ON TABLE trips IS 'Stores all trip requests and their lifecycle status';
COMMENT ON TABLE offers IS 'Stores driver offers/bids for trips';
COMMENT ON TABLE ratings IS 'Stores user ratings for completed trips';
COMMENT ON TABLE sos_events IS 'Stores emergency SOS alerts with location data';
COMMENT ON TABLE messages IS 'Stores chat messages between passengers and drivers';
COMMENT ON TABLE calls IS 'Stores voice call records and metadata';
COMMENT ON TABLE refresh_tokens IS 'Stores refresh tokens for JWT authentication';
COMMENT ON TABLE revoked_tokens IS 'Stores revoked access tokens (hashed)';

