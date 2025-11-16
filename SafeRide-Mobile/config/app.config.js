/**
 * Environment-aware configuration for SafeRide Mobile
 */

import Constants from 'expo-constants';

// Determine environment
const getEnvironment = () => {
  if (__DEV__) {
    return Constants.expoConfig?.extra?.environment || 'development';
  }
  return Constants.expoConfig?.extra?.environment || 'production';
};

const environment = getEnvironment();

/**
 * Environment-specific configurations
 * 
 * IMPORTANT: Updating IP Address for Development
 * - Update the development IP address to match your computer's local network IP
 * - Find your IP address:
 *   - Windows: Run `ipconfig` command, look for IPv4 Address
 *   - macOS: Run `ifconfig | grep "inet "` command
 *   - Linux: Run `hostname -I` command
 * - Ensure your mobile device and computer are on the same WiFi network
 * - For detailed instructions, see README.md
 * 
 * Note: Staging and production URLs should use HTTPS and proper domain names
 */
const configs = {
  development: {
    API_URL: 'http://192.168.0.146:4000/api',
    SOCKET_URL:'http://192.168.0.146:4000',
    LOG_LEVEL: 'debug',
    SHOW_VERBOSE_ERRORS: true
  },
  staging: {
    API_URL: 'https://staging-api.saferide.com/api',
    SOCKET_URL: 'https://staging-api.saferide.com',
    LOG_LEVEL: 'info',
    SHOW_VERBOSE_ERRORS: false
  },
  production: {
    API_URL: 'https://api.saferide.com/api',
    SOCKET_URL: 'https://api.saferide.com',
    LOG_LEVEL: 'error',
    SHOW_VERBOSE_ERRORS: false
  }
};

// Get current config
const config = configs[environment] || configs.production;

// Validate HTTPS in production
if (environment === 'production' && !config.API_URL.startsWith('https://')) {
  console.warn('WARNING: Production API URL should use HTTPS');
}

if (environment === 'production' && !config.SOCKET_URL.startsWith('https://') && !config.SOCKET_URL.startsWith('wss://')) {
  console.warn('WARNING: Production SOCKET URL should use HTTPS or WSS');
}

export default {
  ...config,
  environment,
  isDevelopment: environment === 'development',
  isStaging: environment === 'staging',
  isProduction: environment === 'production',
  // Support contact details
  SUPPORT_EMAIL: 'support@saferide.com',
  SUPPORT_PHONE: '+92 XXX XXXXXXX'
};

