// Expo Module Mocks
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({
    coords: {
      latitude: 24.8607,
      longitude: 67.0011,
      altitude: null,
      accuracy: 10,
      altitudeAccuracy: null,
      heading: null,
      speed: null
    },
    timestamp: Date.now()
  })),
  watchPositionAsync: jest.fn(() => ({
    remove: jest.fn()
  }))
}));

jest.mock('expo-secure-store', () => {
  const storage = {};
  return {
    setItemAsync: jest.fn((key, value) => {
      storage[key] = value;
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key) => {
      return Promise.resolve(storage[key] || null);
    }),
    deleteItemAsync: jest.fn((key) => {
      delete storage[key];
      return Promise.resolve();
    })
  };
});

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  addNotificationReceivedListener: jest.fn(() => ({
    remove: jest.fn()
  })),
  setNotificationHandler: jest.fn()
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false))
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({
    cancelled: false,
    assets: [{
      uri: 'file://test-image.jpg',
      width: 100,
      height: 100
    }]
  }))
}));

// React Native Module Mocks
jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = {};
  return {
    setItem: jest.fn((key, value) => {
      storage[key] = value;
      return Promise.resolve();
    }),
    getItem: jest.fn((key) => {
      return Promise.resolve(storage[key] || null);
    }),
    removeItem: jest.fn((key) => {
      delete storage[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(storage).forEach(key => delete storage[key]);
      return Promise.resolve();
    })
  };
});

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: jest.fn((props) => React.createElement(View, props)),
    MapView: jest.fn((props) => React.createElement(View, props)),
    Marker: jest.fn((props) => React.createElement(View, props)),
    Polyline: jest.fn((props) => React.createElement(View, props))
  };
});

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(() => ({
    createOffer: jest.fn(() => Promise.resolve({})),
    createAnswer: jest.fn(() => Promise.resolve({})),
    setLocalDescription: jest.fn(() => Promise.resolve()),
    setRemoteDescription: jest.fn(() => Promise.resolve()),
    addIceCandidate: jest.fn(() => Promise.resolve()),
    close: jest.fn()
  })),
  mediaDevices: {
    getUserMedia: jest.fn(() => Promise.resolve({})),
    getDisplayMedia: jest.fn(() => Promise.resolve({}))
  },
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn()
}));

const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  off: jest.fn(),
  once: jest.fn()
};

jest.mock('socket.io-client', () => {
  const io = jest.fn(() => mockSocket);
  io.mockSocket = mockSocket;
  return { io, __esModule: true, default: io };
});

// Navigation Mocks
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  reset: jest.fn(),
  push: jest.fn(),
  pop: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true)
};

const mockRoute = {
  params: {},
  key: 'test-route',
  name: 'TestRoute'
};

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: jest.fn(() => mockNavigation),
    useRoute: jest.fn(() => mockRoute),
    useFocusEffect: jest.fn((callback) => {
      React.useEffect(callback, []);
    }),
    NavigationContainer: ({ children }) => children
  };
});

// Global test utilities
global.mockNavigation = mockNavigation;
global.mockRoute = mockRoute;

// Helper function to render with navigation context
global.renderWithNavigation = (component, navigationProps = {}) => {
  const { render } = require('@testing-library/react-native');
  const { NavigationContainer } = require('@react-navigation/native');
  
  const mergedNavigation = { ...mockNavigation, ...navigationProps };
  jest.spyOn(require('@react-navigation/native'), 'useNavigation').mockReturnValue(mergedNavigation);
  
  return render(
    <NavigationContainer>
      {component}
    </NavigationContainer>
  );
};

// Helper function to mock socket events
global.mockSocketEmit = (event, data) => {
  const socketIO = require('socket.io-client');
  const io = socketIO.io || socketIO.default || socketIO;
  const socket = io();
  socket.emit(event, data);
  return socket;
};

// Silence console warnings
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = jest.fn((message) => {
    // Suppress expected warnings
    if (
      typeof message === 'string' &&
      (message.includes('react-native') || message.includes('expo'))
    ) {
      return;
    }
    originalWarn(message);
  });

  console.error = jest.fn((message) => {
    // Suppress expected errors
    if (
      typeof message === 'string' &&
      (message.includes('react-native') || message.includes('expo'))
    ) {
      return;
    }
    originalError(message);
  });
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

// Global configuration
jest.setTimeout(10000);

// Mock global fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('')
  })
);

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  
  // Reset AsyncStorage
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  AsyncStorage.clear();
});

