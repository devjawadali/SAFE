const { Pool } = require('pg');
const { logger } = require('./logger');

// Parse DATABASE_URL or use individual parameters
function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: process.env.DB_SSL !== 'false' }
        : false
    };
  }

  // Individual parameters
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'saferide',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: process.env.DB_SSL !== 'false' }
      : false
  };
}

// Create connection pool
const pool = new Pool({
  ...getDatabaseConfig(),
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
});

// Error event listener for connection errors
pool.on('error', (err, client) => {
  logger.error({ err, client: client ? 'client exists' : 'no client' }, 'Unexpected error on idle client');
});

/**
 * Check database connection health
 * @returns {Promise<boolean>} True if connection is healthy
 */
async function checkConnection() {
  const maxRetries = 3;
  let retryCount = 0;
  let delay = 1000; // Start with 1 second

  while (retryCount < maxRetries) {
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('Database connection successful');
      return true;
    } catch (error) {
      retryCount++;
      if (retryCount < maxRetries) {
        logger.warn({ retryCount, delay, error: error.message }, 'Database connection failed, retrying...');
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        logger.error({ error: error.message }, 'Database connection failed after retries');
        throw error;
      }
    }
  }
}

/**
 * Gracefully close the database connection pool
 * @returns {Promise<void>}
 */
async function closePool() {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error({ error: error.message }, 'Error closing database pool');
    throw error;
  }
}

module.exports = {
  pool,
  checkConnection,
  closePool
};

