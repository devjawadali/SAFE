#!/usr/bin/env node

/**
 * Database Setup Script
 * 
 * This script sets up the database schema and seed data using DATABASE_URL
 * or individual environment variables. It's cross-platform compatible.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
const seedPath = path.join(__dirname, '..', 'db', 'seed.sql');

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  // Build DATABASE_URL from individual parameters
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'saferide';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  
  // URL-encode password if it contains special characters
  const encodedPassword = encodeURIComponent(password);
  
  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}`;
}

try {
  const databaseUrl = getDatabaseUrl();
  console.log('📦 Setting up database...');
  
  // Run schema setup
  if (fs.existsSync(schemaPath)) {
    console.log('📋 Running schema setup...');
    execSync(`psql "${databaseUrl}" -f "${schemaPath}"`, { 
      stdio: 'inherit', 
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' } 
    });
  } else {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    process.exit(1);
  }
  
  // Run seed data if file exists
  if (fs.existsSync(seedPath)) {
    console.log('🌱 Loading seed data...');
    execSync(`psql "${databaseUrl}" -f "${seedPath}"`, { 
      stdio: 'inherit', 
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' } 
    });
  } else {
    console.log('⚠️  Seed file not found, skipping seed data...');
  }
  
  console.log('✅ Database setup complete!');
} catch (error) {
  console.error('❌ Error setting up database:', error.message);
  process.exit(1);
}






















