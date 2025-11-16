import axios from 'axios';
import config from '../config/app.config';
import { getAuthToken as getSecureAuthToken, setAuthToken as setSecureAuthToken, getRefreshToken as getSecureRefreshToken, setRefreshToken as setSecureRefreshToken, clearAuthTokens } from '../utils/storage';
import socketManager from './socketManager';

const API_URL = config.API_URL;

// ========================================
// API CLIENT
// ========================================
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Dedicated axios instance for token refresh to avoid interceptor recursion
const refreshClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Initialize auth token from SecureStore on module load
let authTokenInitialized = false;
const initializeAuthToken = async () => {
  if (!authTokenInitialized) {
    const token = await getSecureAuthToken();
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    authTokenInitialized = true;
  }
};

// Initialize on import
initializeAuthToken();

const setAuthToken = async (token) => {
  await setSecureAuthToken(token);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

const getAuthToken = async () => {
  return await getSecureAuthToken();
};

// Legacy connectSocket - now uses socketManager
const connectSocket = async (token) => {
  await socketManager.connect();
  return socketManager.getSocket();
};

// Legacy getSocket - now uses socketManager
const getSocket = () => {
  return socketManager.getSocket();
};

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// Response interceptor to handle token refresh on 401 errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getSecureRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        // Attempt to refresh the token using dedicated refresh client
        const response = await refreshClient.post('/auth/refresh', {
          refreshToken
        });

        const { token: newToken, refreshToken: newRefreshToken } = response.data;
        
        // Update tokens
        await setSecureAuthToken(newToken);
        if (newRefreshToken) {
          await setSecureRefreshToken(newRefreshToken);
        }
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

        // Process queued requests
        processQueue(null, newToken);
        isRefreshing = false;

        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and reject queued requests
        processQueue(refreshError, null);
        isRefreshing = false;
        await clearAuthTokens();
        delete api.defaults.headers.common['Authorization'];
        
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export { api, setAuthToken, getAuthToken, connectSocket, getSocket };
export { default as socketManager } from './socketManager';

