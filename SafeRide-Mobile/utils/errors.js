/**
 * Error handling utilities with environment-aware messaging
 */

import config from '../config/app.config';

/**
 * Build user-friendly error message
 * In production, shows generic messages; in dev, shows detailed info
 */
export function buildNetworkErrorMessage(error, actionLabel) {
  // In production, show generic message and log details
  if (config.isProduction) {
    // Log detailed error to telemetry/logging service
    console.error('Network error:', {
      action: actionLabel,
      code: error.code,
      message: error.message,
      response: error.response?.data
    });
    
    // Return generic user-friendly message
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'Connection timeout. Please check your internet connection and try again.';
    }
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      return 'Unable to connect to server. Please check your internet connection.';
    }
    if (error.code === 'ENOTFOUND') {
      return 'Unable to reach server. Please try again later.';
    }
    if (error.response) {
      return error.response.data?.error || 'An error occurred. Please try again.';
    }
    return 'An unexpected error occurred. Please try again.';
  }

  // Development mode: show detailed error messages
  const { serverHost, serverPort } = getServerInfo();
  
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return `Connection timeout. Backend server at ${serverHost}:${serverPort} is not responding. Please verify:\n\n1. Backend server is running on port ${serverPort}\n2. Your computer IP is ${serverHost}\n3. Phone and computer are on same WiFi network`;
  }
  if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
    return `Cannot connect to backend server at ${serverHost}:${serverPort}. Please check:\n\n1. Backend server is running (npm start or docker-compose up)\n2. Server is listening on port ${serverPort}\n3. Firewall is not blocking port ${serverPort}\n4. Both devices are on WiFi network ${serverHost.split('.').slice(0, 3).join('.')}.x`;
  }
  if (error.code === 'ENOTFOUND') {
    return `Cannot resolve host ${serverHost}. Please verify:\n\n1. Your computer's IP address (run 'ipconfig' on Windows)\n2. Update API_URL in app.config.js if IP changed\n3. Restart Expo with 'npx expo start -c'`;
  }
  if (error.response) {
    return `Backend error: ${error.response.data?.error || error.response.statusText} (Status: ${error.response.status})`;
  }
  return `${actionLabel}: ${error.message}. Backend URL: ${config.API_URL}. Error code: ${error.code || 'UNKNOWN'}`;
}

/**
 * Get server info from API URL
 */
function getServerInfo() {
  try {
    const url = new URL(config.API_URL);
    return {
      serverHost: url.hostname,
      serverPort: url.port || (url.protocol === 'https:' ? '443' : '80'),
    };
  } catch (error) {
    return {
      serverHost: 'unknown',
      serverPort: 'unknown',
    };
  }
}
































