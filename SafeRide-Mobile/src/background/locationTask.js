/**
 * Background location task for SafeRide
 * Registered at module scope per Expo guidelines
 */

import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSocket } from '../../services/network';

export const LOCATION_TASK_NAME = 'background-location-task';

// Guard to avoid duplicate registration if module is re-evaluated
let taskRegistered = false;

if (!taskRegistered) {
  TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
    if (error) {
      console.error('Background location task error:', error);
      return;
    }
    if (data) {
      const { locations } = data;
      const location = locations[0];
      if (location) {
        const socket = getSocket();
        if (socket && socket.connected) {
          // Get tripId from AsyncStorage (stored when starting tracking)
          // Normalize tripId to string
          AsyncStorage.getItem('currentTripId').then(tripId => {
            if (tripId) {
              socket.emit('location_update', {
                tripId: String(tripId), // Ensure tripId is string
                lat: location.coords.latitude,
                lng: location.coords.longitude
              });
            } else {
              socket.emit('location_update', {
                lat: location.coords.latitude,
                lng: location.coords.longitude
              });
            }
          });
        }
      }
    }
  });
  
  taskRegistered = true;
}
























