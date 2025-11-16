/**
 * Location permission utilities
 */

import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

/**
 * Request foreground location permissions with proper error handling
 * @returns {Promise<{granted: boolean, location: Object|null}>}
 */
export async function requestForegroundLocationPermission() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status === 'granted') {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      return { granted: true, location: location.coords };
    } else {
      Alert.alert(
        'Location Permission Required',
        'Please enable location access in settings to use this feature.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }
          }
        ]
      );
      return { granted: false, location: null };
    }
  } catch (error) {
    console.error('Error requesting location permission:', error);
    Alert.alert('Error', 'Failed to request location permission');
    return { granted: false, location: null };
  }
}

/**
 * Request background location permissions (Android only, requires foreground first)
 * @returns {Promise<{granted: boolean}>}
 */
export async function requestBackgroundLocationPermission() {
  try {
    if (Platform.OS !== 'android') {
      // Background location is handled differently on iOS
      return { granted: false };
    }

    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      const foregroundResult = await requestForegroundLocationPermission();
      if (!foregroundResult.granted) {
        return { granted: false };
      }
    }

    const { status } = await Location.requestBackgroundPermissionsAsync();
    return { granted: status === 'granted' };
  } catch (error) {
    console.error('Error requesting background location permission:', error);
    return { granted: false };
  }
}

/**
 * Get current location with permission check
 * @returns {Promise<Object|null>}
 */
export async function getCurrentLocation() {
  const { status } = await Location.getForegroundPermissionsAsync();
  
  if (status !== 'granted') {
    const result = await requestForegroundLocationPermission();
    if (!result.granted) {
      return null;
    }
    return result.location;
  }

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    return location.coords;
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
}

















