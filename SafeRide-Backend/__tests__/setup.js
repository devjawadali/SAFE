require('dotenv').config({ path: '.env.test' });

// Set NODE_ENV to test if not already set
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Override database configuration for test database
if (!process.env.DATABASE_URL) {
  process.env.DB_NAME = process.env.DB_NAME || 'saferide_test_db';
  process.env.DB_HOST = process.env.DB_HOST || 'localhost';
  process.env.DB_PORT = process.env.DB_PORT || '5432';
  process.env.DB_USER = process.env.DB_USER || 'postgres';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
} else {
  // If DATABASE_URL is set, ensure it points to test database
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/saferide_test_db';
  process.env.DATABASE_URL = url.toString();
}

// Mock Sentry to prevent actual error reporting during tests
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  Handlers: {
    requestHandler: jest.fn(() => (req, res, next) => next()),
    errorHandler: jest.fn(() => (err, req, res, next) => next(err))
  },
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  withScope: jest.fn((callback) => callback({ setTag: jest.fn(), setUser: jest.fn(), setExtra: jest.fn() }))
}));

// Mock logger to reduce console noise during tests
const pino = require('pino');
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };
  return jest.fn(() => mockLogger);
});

// Database setup
const { pool } = require('../config/database');

/**
 * Clear all tables in the test database
 * This function truncates all tables and resets sequences
 * Dynamically queries user tables to avoid hard-coded table list
 */
async function clearDatabase() {
  try {
    const client = await pool.connect();
    
    // Query information_schema to get all user tables (exclude system tables)
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
        AND table_name NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_name;
    `);
    
    const tableNames = tablesResult.rows.map(row => row.table_name);
    
    if (tableNames.length === 0) {
      client.release();
      return;
    }
    
    // Disable foreign key checks temporarily
    await client.query('SET session_replication_role = replica;');
    
    // Truncate all user tables dynamically
    // Wrap each truncation in try/catch to skip missing tables gracefully
    for (const tableName of tableNames) {
      try {
        await client.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE;`);
      } catch (tableError) {
        // Skip tables that don't exist or can't be truncated
        console.warn(`Warning: Could not truncate table ${tableName}:`, tableError.message);
      }
    }
    
    // Re-enable foreign key checks
    await client.query('SET session_replication_role = DEFAULT;');
    
    client.release();
  } catch (error) {
    console.error('Error clearing database:', error);
    throw error;
  }
}

/**
 * Create a test user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user
 */
async function createTestUser(userData = {}) {
  const defaultUserData = {
    phone: `+92300${Math.floor(Math.random() * 10000000)}`,
    name: 'Test User',
    role: 'passenger',
    ...userData
  };

  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO users (phone, name, role) VALUES ($1, $2, $3) RETURNING *',
      [defaultUserData.phone, defaultUserData.name, defaultUserData.role]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Create a test driver
 * @param {Object} driverData - Driver data
 * @returns {Promise<Object>} Created driver
 */
async function createTestDriver(driverData = {}) {
  const defaultDriverData = {
    user_id: driverData.user_id || null,
    vehicle_model: 'Test Vehicle',
    vehicle_number: 'TEST-123',
    license_number: 'DL-TEST-123',
    status: 'pending',
    ...driverData
  };

  const client = await pool.connect();
  try {
    // First create user if user_id not provided
    let userId = defaultDriverData.user_id;
    if (!userId) {
      const user = await createTestUser({ role: 'driver' });
      userId = user.id;
    }

    const result = await client.query(
      'INSERT INTO drivers (user_id, vehicle_model, vehicle_number, license_number, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, defaultDriverData.vehicle_model, defaultDriverData.vehicle_number, defaultDriverData.license_number, defaultDriverData.status]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Generate JWT token for a user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
function generateTestToken(user) {
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
  
  return jwt.sign(
    {
      userId: user.id,
      phone: user.phone,
      role: user.role
    },
    secret,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '30m' }
  );
}

// Verify test database connection on setup
async function verifyDatabaseConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Test database connection successful');
  } catch (error) {
    console.warn('⚠️  Test database connection failed:', error.message);
    console.warn('⚠️  Make sure test database is set up: npm run test:db:setup');
  }
}

// Set global test timeout
jest.setTimeout(10000);

// Verify database connection
verifyDatabaseConnection();

// Automatically clear database before each test suite
// This ensures a clean state for all tests
beforeAll(async () => {
  try {
    await clearDatabase();
  } catch (error) {
    console.warn('Warning: Could not clear database in beforeAll:', error.message);
  }
});

// Export utilities for use in tests
module.exports = {
  clearDatabase,
  createTestUser,
  createTestDriver,
  generateTestToken
};

