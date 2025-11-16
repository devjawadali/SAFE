#!/usr/bin/env node

/**
 * Test Database Setup Script
 * 
 * This script sets up the test database schema using test-specific DATABASE_URL
 * or defaults to saferide_test database. It's cross-platform compatible.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load test environment variables (try .env.test first, then .env)
require('dotenv').config({ path: '.env.test' });
if (!process.env.DATABASE_URL && !process.env.DB_NAME) {
  require('dotenv').config();
}

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

function getTestDatabaseUrl() {
  // Check for test-specific DATABASE_URL
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  // Build DATABASE_URL from individual parameters for test database
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'saferide_test';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  
  // URL-encode password if it contains special characters
  const encodedPassword = encodeURIComponent(password);
  
  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}`;
}

try {
  const databaseUrl = getTestDatabaseUrl();
  console.log('📦 Setting up test database...');
  
  // Run schema setup
  if (fs.existsSync(schemaPath)) {
    console.log('📋 Running schema setup...');
    execSync(`psql "${databaseUrl}" -f "${schemaPath}"`, { 
      stdio: 'inherit', 
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' } 
    });
    console.log('✅ Test database setup complete!');
  } else {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error setting up test database:', error.message);
  process.exit(1);
}






















