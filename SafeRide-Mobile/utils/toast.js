/**
 * Toast/Snackbar utility with throttling support
 */

import { Snackbar } from 'react-native-paper';
import React, { useState } from 'react';

// Global toast state
let toastState = {
  visible: false,
  message: '',
  duration: 3000,
  action: null,
};

let toastListeners = new Set();

// Throttle map to prevent message flooding
const throttleMap = new Map();
const THROTTLE_DELAY = 2000; // 2 seconds between same messages

/**
 * Show a toast message with optional throttling
 * @param {string} message - Message to display
 * @param {Object} options - Toast options
 * @param {number} options.duration - Duration in ms (default: 3000)
 * @param {Object} options.action - Action button config
 * @param {boolean} options.throttle - Whether to throttle this message (default: true)
 */
export function showToast(message, options = {}) {
  const { duration = 3000, action = null, throttle = true } = options;

  // Throttle check
  if (throttle) {
    const now = Date.now();
    const lastShown = throttleMap.get(message);
    if (lastShown && now - lastShown < THROTTLE_DELAY) {
      return; // Skip if shown recently
    }
    throttleMap.set(message, now);
  }

  toastState = {
    visible: true,
    message,
    duration,
    action,
  };

  // Notify all listeners
  toastListeners.forEach(listener => listener(toastState));
}

/**
 * Hide the toast
 */
export function hideToast() {
  toastState = {
    ...toastState,
    visible: false,
  };
  toastListeners.forEach(listener => listener(toastState));
}

/**
 * React hook to use toast in components
 */
export function useToast() {
  const [state, setState] = useState(toastState);

  React.useEffect(() => {
    const listener = (newState) => {
      setState(newState);
    };
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  return {
    visible: state.visible,
    message: state.message,
    duration: state.duration,
    action: state.action,
    show: showToast,
    hide: hideToast,
  };
}

/**
 * Toast Provider Component - should be added to App root
 */
export function ToastProvider({ children }) {
  const toast = useToast();

  return (
    <>
      {children}
      <Snackbar
        visible={toast.visible}
        onDismiss={toast.hide}
        duration={toast.duration}
        action={toast.action}
        style={{ marginBottom: 50 }}
      >
        {toast.message}
      </Snackbar>
    </>
  );
}

