/**
 * Centralized Socket Manager with reconnection logic and exponential backoff
 */

import { io } from 'socket.io-client';
import config from '../config/app.config';
import { getAuthToken } from '../utils/storage';

const SOCKET_URL = config.SOCKET_URL;

class SocketManager {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.eventHandlers = new Map(); // Track handlers for cleanup
    this.connectedRooms = new Set(); // Track joined trip rooms
  }

  /**
   * Connect to socket with exponential backoff reconnection
   */
  async connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.socket?.connected) {
            clearInterval(checkInterval);
            resolve(this.socket);
          } else if (!this.isConnecting) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });
    }

    this.isConnecting = true;

    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('No auth token available for socket connection');
        this.isConnecting = false;
        return null;
      }

      // Disconnect existing socket if any
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }

      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: false, // Handle reconnection manually
      });

      this.setupEventHandlers();
      this.reconnectAttempts = 0;
      this.isConnecting = false;

      return this.socket;
    } catch (error) {
      console.error('Socket connection error:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
      return null;
    }
  }

  /**
   * Setup socket event handlers
   */
  setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Rejoin all previously joined rooms
      this.connectedRooms.forEach((tripId) => {
        this.socket.emit('join_trip', String(tripId));
      });
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.scheduleReconnect();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Get current socket instance
   */
  getSocket() {
    return this.socket;
  }

  /**
   * Check if socket is connected
   */
  isConnected() {
    return this.socket?.connected || false;
  }

  /**
   * Join a trip room
   */
  async joinTrip(tripId) {
    const normalizedTripId = String(tripId);
    
    if (!this.socket || !this.socket.connected) {
      await this.connect();
    }

    if (this.socket && this.socket.connected) {
      this.socket.emit('join_trip', normalizedTripId);
      this.connectedRooms.add(normalizedTripId);
      console.log(`Joined trip room: ${normalizedTripId}`);
    } else {
      console.warn('Socket not connected, cannot join trip room');
    }
  }

  /**
   * Leave a trip room
   */
  leaveTrip(tripId) {
    const normalizedTripId = String(tripId);
    
    if (this.socket && this.socket.connected) {
      this.socket.emit('leave_trip', normalizedTripId);
      this.connectedRooms.delete(normalizedTripId);
      console.log(`Left trip room: ${normalizedTripId}`);
    }
  }

  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this.socket) {
      console.warn('Socket not initialized, cannot register handler');
      return;
    }

    const handlerKey = `${event}_${Date.now()}_${Math.random()}`;
    this.socket.on(event, handler);
    
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Map());
    }
    this.eventHandlers.get(event).set(handlerKey, handler);

    // Return unsubscribe function
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Unregister event handler
   */
  off(event, handler) {
    if (!this.socket) {
      return;
    }

    if (handler) {
      this.socket.off(event, handler);
      if (this.eventHandlers.has(event)) {
        const handlers = this.eventHandlers.get(event);
        for (const [key, h] of handlers.entries()) {
          if (h === handler) {
            handlers.delete(key);
            break;
          }
        }
      }
    } else {
      // Remove all handlers for this event
      this.socket.off(event);
      this.eventHandlers.delete(event);
    }
  }

  /**
   * Emit an event
   */
  emit(event, data) {
    if (!this.socket || !this.socket.connected) {
      console.warn('Socket not connected, cannot emit event:', event);
      return false;
    }

    this.socket.emit(event, data);
    return true;
  }

  /**
   * Disconnect socket
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.connectedRooms.clear();
    this.eventHandlers.clear();
    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }
}

// Export singleton instance
const socketManager = new SocketManager();
export default socketManager;



















