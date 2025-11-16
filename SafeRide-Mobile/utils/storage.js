/**
 * Secure storage utilities using Expo SecureStore
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_DATA_KEY = 'userData';
const DRIVER_DATA_KEY = 'driverData';

/**
 * Set auth token securely
 */
export async function setAuthToken(token) {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error('Error storing auth token:', error);
    throw error;
  }
}

/**
 * Get auth token from secure storage
 */
export async function getAuthToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error retrieving auth token:', error);
    return null;
  }
}

/**
 * Set refresh token securely
 */
export async function setRefreshToken(token) {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error storing refresh token:', error);
    throw error;
  }
}

/**
 * Get refresh token from secure storage
 */
export async function getRefreshToken() {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Error retrieving refresh token:', error);
    return null;
  }
}

/**
 * Clear all auth tokens
 */
export async function clearAuthTokens() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_DATA_KEY);
    await clearDriverData(); // Clear driver data on logout
    await clearEmergencyContacts(); // Clear emergency contacts on logout
  } catch (error) {
    console.error('Error clearing auth tokens:', error);
  }
}

/**
 * Set user data (non-sensitive, can use AsyncStorage)
 */
export async function setUserData(userData) {
  try {
    await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
  } catch (error) {
    console.error('Error storing user data:', error);
  }
}

/**
 * Get user data
 */
export async function getUserData() {
  try {
    const data = await AsyncStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error retrieving user data:', error);
    return null;
  }
}

/**
 * Normalize contact to required shape: {name, phone}
 * Validates and extracts only required fields, omitting extraneous data
 */
export function normalizeContact(contact) {
  if (!contact) return null;
  
  // Handle string phone numbers (legacy format)
  if (typeof contact === 'string') {
    return { name: '', phone: contact };
  }
  
  // Handle object contacts - extract only name and phone
  const normalized = {
    name: contact.name || contact.contact_name || '',
    phone: contact.phone || contact.phone_number || contact.contact_phone || ''
  };
  
  // Validate phone is present
  if (!normalized.phone) {
    console.warn('Contact missing phone number:', contact);
    return null;
  }
  
  return normalized;
}

/**
 * Set emergency contacts (cached locally for quick SOS access)
 * Contacts are normalized before storage
 */
export async function setEmergencyContacts(emergencyContact, trustedContacts) {
  try {
    const contactsData = {
      emergencyContact: normalizeContact(emergencyContact),
      trustedContacts: (trustedContacts || []).map(normalizeContact).filter(Boolean)
    };
    await AsyncStorage.setItem('emergencyContacts', JSON.stringify(contactsData));
  } catch (error) {
    console.error('Error storing emergency contacts:', error);
  }
}

/**
 * Get emergency contacts from local storage
 */
export async function getEmergencyContacts() {
  try {
    const data = await AsyncStorage.getItem('emergencyContacts');
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error retrieving emergency contacts:', error);
    return null;
  }
}

/**
 * Clear emergency contacts from storage
 */
export async function clearEmergencyContacts() {
  try {
    await AsyncStorage.removeItem('emergencyContacts');
  } catch (error) {
    // Handle errors silently
  }
}

/**
 * Set driver data (non-sensitive, can use AsyncStorage)
 */
export async function setDriverData(driverData) {
  try {
    await AsyncStorage.setItem(DRIVER_DATA_KEY, JSON.stringify(driverData));
  } catch (error) {
    console.error('Error storing driver data:', error);
  }
}

/**
 * Get driver data
 */
export async function getDriverData() {
  try {
    const data = await AsyncStorage.getItem(DRIVER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error retrieving driver data:', error);
    return null;
  }
}

/**
 * Clear driver data from storage
 */
export async function clearDriverData() {
  try {
    await AsyncStorage.removeItem(DRIVER_DATA_KEY);
  } catch (error) {
    console.error('Error clearing driver data:', error);
  }
}


/**
 * Normalize trip ID to a string
 * Coerces the id to a normalized string format
 */
export function normalizeTripId(id) {
  if (id == null) return '';
  return String(id);
}

