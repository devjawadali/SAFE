#!/usr/bin/env node

/**
 * Reset Test Database Script
 * 
 * This script resets the test database by dropping and recreating it,
 * then running the schema setup. It's cross-platform compatible.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load test environment variables
require('dotenv').config({ path: '.env.test' });

const DB_NAME = process.env.DB_NAME || 'saferide_test';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

// Set PGPASSWORD environment variable for psql (if password is provided)
if (DB_PASSWORD) {
  process.env.PGPASSWORD = DB_PASSWORD;
}

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

try {
  console.log(`🔄 Resetting test database: ${DB_NAME}...`);
  
  // Drop and recreate database
  const dropCreateCmd = `psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME}; CREATE DATABASE ${DB_NAME};"`;
  console.log('📦 Dropping and creating database...');
  execSync(dropCreateCmd, { stdio: 'inherit', env: process.env });
  
  // Run schema setup
  if (fs.existsSync(schemaPath)) {
    console.log('📋 Setting up schema...');
    const setupCmd = `psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -f ${schemaPath}`;
    execSync(setupCmd, { stdio: 'inherit', env: process.env });
    console.log('✅ Test database reset complete!');
  } else {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error resetting test database:', error.message);
  process.exit(1);
}


