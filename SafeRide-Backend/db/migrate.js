/**
 * Database Migration Script
 * 
 * This script handles database migrations for the SafeRide Backend.
 * Currently, schema setup is handled by db/schema.sql.
 * 
 * For future migrations, consider using a migration tool like:
 * - node-pg-migrate (https://github.com/salsita/node-pg-migrate)
 * - Knex.js migrations (https://knexjs.org/)
 * - Sequelize migrations (https://sequelize.org/docs/v6/other-topics/migrations/)
 */
require('dotenv').config();  // <- YE ADD KARO - Line 15 ke around
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const fs = require('fs');
const path = require('path');

/**
 * Run schema setup
 */
async function runSchema() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schema);
    logger.info('Schema setup completed successfully');
  } catch (error) {
    logger.error({ error: error.message }, 'Schema setup failed');
    throw error;
  }
}

/**
 * Run seed data
 */
async function runSeeds() {
  try {
    const seedPath = path.join(__dirname, 'seed.sql');
    if (fs.existsSync(seedPath)) {
      const seeds = fs.readFileSync(seedPath, 'utf8');
      await pool.query(seeds);
      logger.info('Seed data loaded successfully');
    } else {
      logger.warn('Seed file not found, skipping seed data');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Seed data loading failed');
    throw error;
  }
}

/**
 * Main migration function
 */
async function migrate() {
  logger.info('Starting database migration...');
  
  // Run schema
  await runSchema();
  
  // Run seeds (optional, for development)
  if (process.env.NODE_ENV !== 'production') {
    await runSeeds();
  }
  
  logger.info('Database migration completed successfully');
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error: error.message }, 'Database migration failed');
      process.exit(1);
    });
}

module.exports = { migrate, runSchema, runSeeds };

