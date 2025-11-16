-- SafeRide Backend Database Schema
-- PostgreSQL database schema for production deployment

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Stores all users (passengers, drivers, admins)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    profile_picture_url TEXT,
    gender VARCHAR(20) NOT NULL CONSTRAINT users_gender_check CHECK (LOWER(gender) = 'female'),
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'passenger', 'driver')),
    verified BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    emergency_contact VARCHAR(20),
    trusted_contacts TEXT[] -- PostgreSQL array for phone numbers
);

-- Index for fast phone lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ============================================================================
-- DRIVERS TABLE
-- ============================================================================
-- Stores driver-specific information (linked to users table)
CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    user_id INTEGER UNIQUE REFERENCES users(id),
    license_number VARCHAR(50) NOT NULL,
    vehicle_make VARCHAR(100) NOT NULL,
    vehicle_model VARCHAR(100) NOT NULL,
    vehicle_plate VARCHAR(20) NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL,
    vehicle_year INTEGER,
    license_photo_url TEXT,
    vehicle_photo_url TEXT,
    cnic_photo_url TEXT,
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    rating DECIMAL(3,2) DEFAULT 0.0,
    total_trips INTEGER DEFAULT 0,
    is_online BOOLEAN DEFAULT false,
    last_location_lat DECIMAL(10,8),
    last_location_lng DECIMAL(11,8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for driver queries
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_verification_status ON drivers(verification_status);
CREATE INDEX IF NOT EXISTS idx_drivers_is_online ON drivers(is_online);

-- ============================================================================
-- TRIPS TABLE
-- ============================================================================
-- Stores all trip requests and their status
CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    passenger_id INTEGER NOT NULL REFERENCES users(id),
    driver_id INTEGER REFERENCES users(id),
    pickup_lat DECIMAL(10,8) NOT NULL,
    pickup_lng DECIMAL(11,8) NOT NULL,
    pickup_address TEXT NOT NULL,
    drop_lat DECIMAL(10,8) NOT NULL,
    drop_lng DECIMAL(11,8) NOT NULL,
    drop_address TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('requested', 'accepted', 'in_progress', 'completed', 'cancelled')),
    proposed_price DECIMAL(10,2) NOT NULL,
    accepted_price DECIMAL(10,2),
    vehicle_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    shared_with TEXT[], -- Array of phone numbers
    safety_check_enabled BOOLEAN DEFAULT true
);

-- Indexes for trip queries
CREATE INDEX IF NOT EXISTS idx_trips_passenger_id ON trips(passenger_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_created_at ON trips(created_at);

-- ============================================================================
-- OFFERS TABLE
-- ============================================================================
-- Stores driver offers for trips
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    price DECIMAL(10,2) NOT NULL,
    eta INTEGER NOT NULL, -- minutes
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for offer queries
CREATE INDEX IF NOT EXISTS idx_offers_trip_id ON offers(trip_id);
CREATE INDEX IF NOT EXISTS idx_offers_driver_id ON offers(driver_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

-- ============================================================================
-- RATINGS TABLE
-- ============================================================================
-- Stores user ratings for trips
CREATE TABLE IF NOT EXISTS ratings (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    passenger_id INTEGER NOT NULL REFERENCES users(id),
    driver_id INTEGER NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trip_id) -- Prevent duplicate ratings per trip
);

-- Indexes for rating queries
CREATE INDEX IF NOT EXISTS idx_ratings_trip_id ON ratings(trip_id);
CREATE INDEX IF NOT EXISTS idx_ratings_driver_id ON ratings(driver_id);

-- ============================================================================
-- SOS EVENTS TABLE
-- ============================================================================
-- Stores emergency SOS alerts
CREATE TABLE IF NOT EXISTS sos_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    trip_id INTEGER REFERENCES trips(id),
    location_lat DECIMAL(10,8) NOT NULL,
    location_lng DECIMAL(11,8) NOT NULL,
    message TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Indexes for SOS queries
CREATE INDEX IF NOT EXISTS idx_sos_events_user_id ON sos_events(user_id);
CREATE INDEX IF NOT EXISTS idx_sos_events_trip_id ON sos_events(trip_id);
CREATE INDEX IF NOT EXISTS idx_sos_events_status ON sos_events(status);
CREATE INDEX IF NOT EXISTS idx_sos_events_created_at ON sos_events(created_at);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================
-- Stores chat messages between passengers and drivers
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_flagged BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);

-- Indexes for message queries
CREATE INDEX IF NOT EXISTS idx_messages_trip_id ON messages(trip_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- ============================================================================
-- CALLS TABLE
-- ============================================================================
-- Stores voice call records
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    caller_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('ringing', 'connected', 'ended', 'missed')),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    duration INTEGER, -- seconds
    is_emergency BOOLEAN DEFAULT false
);

-- Indexes for call queries
CREATE INDEX IF NOT EXISTS idx_calls_trip_id ON calls(trip_id);
CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_receiver_id ON calls(receiver_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);

-- ============================================================================
-- REFRESH TOKENS TABLE
-- ============================================================================
-- Stores refresh tokens for tokenService persistence
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token VARCHAR(128) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for token queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- ============================================================================
-- REVOKED TOKENS TABLE
-- ============================================================================
-- Stores revoked access tokens (SHA-256 hash)
CREATE TABLE IF NOT EXISTS revoked_tokens (
    token_hash VARCHAR(64) PRIMARY KEY, -- SHA-256 hash of token
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);

