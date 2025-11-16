# SafeRide Mobile - React Native App

**Women-Focused Ride Hailing Mobile Application**

![React Native](https://img.shields.io/badge/React%20Native-0.81.5-blue.svg)
![Expo](https://img.shields.io/badge/Expo-54.0.20-black.svg)
![Socket.io](https://img.shields.io/badge/Socket.io-4.8.1-blue.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-124.0.4-green.svg)

A comprehensive mobile application for the SafeRide women-only ride-hailing platform, featuring real-time communication, trip management, and comprehensive safety features.

---

## Project Overview

SafeRide Mobile is a React Native application built with Expo, providing a secure and user-friendly interface for passengers and drivers in a women-focused ride-hailing service.

### Technology Stack

- **React Native** 0.81.5 - Mobile app framework
- **Expo** ~54.0.20 - Development platform and tools
- **Socket.io Client** 4.8.1 - Real-time communication
- **WebRTC** 124.0.4 - Voice call functionality
- **React Navigation** - Navigation system
- **Axios** - HTTP client
- **AsyncStorage** - Local data persistence
- **Testing:** Jest, @testing-library/react-native, @testing-library/jest-native, jest-expo

### Key Features

- 🔐 **Authentication** - OTP-based login system
- 🚗 **Ride Booking** - Request and manage trips
- 📍 **Real-time Tracking** - Live location updates
- 💬 **In-app Chat** - Real-time messaging
- 📞 **Voice Calls** - WebRTC-based calling
- 🚨 **SOS Alerts** - Emergency assistance
- ⭐ **Rating System** - Trip rating and feedback
- 👥 **Emergency Contacts** - Trusted contacts management
- 🔔 **Notifications** - Push notifications support

---

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js** 16+ and **npm** 7+ (verify: `node --version` and `npm --version`)
- **Expo CLI** (install globally: `npm install -g expo-cli`)
- **Expo Go app** on your mobile device:
  - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
  - [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
- **Backend server running** - See `../backend/SafeRide-Backend/README.md` for setup instructions

---

## Installation

### Step 1: Navigate to Project Directory

```bash
cd mobile/SafeRide-Mobile
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- React Native core libraries
- Expo SDK and modules
- Navigation libraries
- Socket.io client
- WebRTC libraries
- And other dependencies listed in `package.json`

### Step 3: Verify Installation

```bash
# Check if Expo CLI is available
npx expo --version

# Verify dependencies
npm list --depth=0
```

---

## Configuration

### ⚠️ CRITICAL: Updating API URLs for Development

**Configuration Location:** `config/app.config.js`

All API configuration is centralized in `config/app.config.js`. This file contains environment-specific settings for development, staging, and production.

#### Step 1: Find Your Computer's IP Address

**Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" under your WiFi adapter (e.g., `192.168.1.100`)

**macOS:**
```bash
ifconfig | grep "inet "
```
Look for the IP address under `en0` or `wlan0` (e.g., `192.168.1.100`)

**Linux:**
```bash
hostname -I
```
This will display your IP address directly

#### Step 2: Update Development Configuration

Open `config/app.config.js` and locate the `development` configuration object:

```javascript
development: {
  API_URL: 'http://192.168.100.254:4000/api',  // Update this IP
  SOCKET_URL: 'http://192.168.100.254:4000',   // Update this IP
  LOG_LEVEL: 'debug',
  SHOW_VERBOSE_ERRORS: true
}
```

**Replace the IP address** (`192.168.100.254`) with your computer's IP address:

```javascript
development: {
  API_URL: 'http://YOUR_IP:4000/api',  // e.g., http://192.168.1.100:4000/api
  SOCKET_URL: 'http://YOUR_IP:4000',   // e.g., http://192.168.1.100:4000
  LOG_LEVEL: 'debug',
  SHOW_VERBOSE_ERRORS: true
}
```

#### Step 3: Verify Network Requirements

⚠️ **IMPORTANT:** Your mobile device and computer must be on the **same WiFi network** for the app to connect to the backend server.

**Common Issues:**
- Mobile device on different WiFi network → Connection will fail
- Computer using VPN → May cause connection issues
- Firewall blocking port 4000 → App won't connect
- Backend server not running → Connection timeout

### Environment Variables

The app supports three environments:

- **Development** - Uses local IP address (default in dev mode)
- **Staging** - Uses staging server URL
- **Production** - Uses production server URL

The environment is automatically detected based on `__DEV__` flag and Expo configuration. You can override it by setting `extra.environment` in `app.json`.

### Important Notes

- ⚠️ **Never commit sensitive API keys** to version control
- ✅ **Use HTTPS in production** - The config validates HTTPS for production URLs
- 🔒 **Backend must be running** before starting the mobile app
- 📱 **Same WiFi network required** for development connection

---

## Running the App

### Start Development Server

```bash
npx expo start
```

This will:
- Start the Expo development server
- Display a QR code in the terminal
- Open Expo DevTools in your browser

### Connect Mobile Device

1. **Open Expo Go app** on your mobile device
2. **Scan the QR code** displayed in the terminal:
   - **iOS**: Use the Camera app (it will detect Expo QR codes)
   - **Android**: Use the Expo Go app's built-in scanner
3. The app will load on your device

### Platform-Specific Commands

```bash
# Start and open on Android emulator/device
npm run android

# Start and open on iOS simulator/device
npm run ios

# Start and open in web browser
npm run web
```

### Clear Cache (if needed)

If you encounter issues, try clearing the cache:

```bash
npx expo start -c
```

---

## Project Structure

```
SafeRide-Mobile/
├── App.js                    # Main application entry point
├── index.js                  # Expo entry point
├── app.json                  # Expo configuration
├── package.json              # Dependencies and scripts
│
├── config/
│   └── app.config.js         # ⭐ Centralized configuration (API URLs, environment)
│
├── services/
│   └── network.js            # API client and Socket.io connection
│
├── screens/
│   ├── CallScreen.js         # Voice call interface (WebRTC)
│   ├── ChatScreen.js         # Chat messaging interface
│   └── RatingScreen.js       # Trip rating interface
│
├── utils/
│   ├── errors.js             # Error handling utilities
│   └── storage.js            # AsyncStorage helpers
│
├── __tests__/                # Test directory
│   ├── setup.js              # Global test setup and mocks
│   ├── unit/                 # Unit tests for utilities and services
│   ├── integration/          # Integration tests for screens and navigation
│   └── helpers/              # Reusable test utilities
│
├── __mocks__/                # Module mocks
│   └── fileMock.js           # Mock for static assets (images, fonts)
│
├── jest.config.js            # Jest testing configuration
│
└── assets/
    └── [images, icons]       # App assets
```

### Key Files

- **`App.js`** - Main application component with navigation, screens, and state management
- **`config/app.config.js`** - ⭐ **Centralized configuration** - All API URLs and environment settings
- **`services/network.js`** - Axios instance and Socket.io client setup
- **`screens/`** - All screen components (Chat, Call, Rating)
- **`utils/`** - Utility functions for errors and storage

---

## Connecting to Backend

### Prerequisites

1. **Backend server must be running** - See `../backend/SafeRide-Backend/README.md` for setup
2. **Backend running on port 4000** (default) or update port in `config/app.config.js`
3. **Same WiFi network** - Mobile device and computer must be connected

### Network Requirements

- ✅ Both devices on same WiFi network
- ✅ Firewall allows port 4000 (backend port)
- ✅ No VPN interfering with local network
- ✅ Backend server is accessible from network

### Testing Connection

1. **Verify backend is running:**
   ```bash
   curl http://localhost:4000/api/health
   ```

2. **Test from mobile device:**
   - Open the app
   - Try to login with test account
   - Check console logs for connection status

3. **Common connection issues:**
   - **Connection timeout**: Backend not running or wrong IP
   - **Cannot resolve host**: IP address incorrect
   - **Network error**: Different WiFi networks or firewall blocking

### Troubleshooting Connection Issues

See the **Troubleshooting** section below for detailed solutions.

---

## Available Scripts

```bash
# Start Expo development server
npm start
# or
npx expo start

# Start on Android
npm run android

# Start on iOS
npm run ios

# Start in web browser
npm run web

# Start with cleared cache
npx expo start -c

# Testing
npm test
# - Run all tests
npm run test:watch
# - Run tests in watch mode for TDD
npm run test:coverage
# - Generate coverage reports
npm run test:verbose
# - Detailed test output
npm run test:debug
# - Debug mode for troubleshooting
```

---

## Troubleshooting

### Connection Timeout

**Symptoms:** App shows "Connection timeout" error

**Solutions:**
1. ✅ Verify backend server is running (`npm start` in backend directory)
2. ✅ Check IP address in `config/app.config.js` matches your computer's IP
3. ✅ Ensure mobile device and computer are on same WiFi network
4. ✅ Check firewall allows port 4000
5. ✅ Disable VPN if active

### Build Errors

**Symptoms:** App won't start, dependency errors

**Solutions:**
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npx expo start -c

# For iOS specifically
cd ios && pod install && cd ..
```

### Socket.io Connection Fails

**Symptoms:** Real-time features not working, chat/calls not connecting

**Solutions:**
1. ✅ Verify backend Socket.io is running (check backend logs)
2. ✅ Check `SOCKET_URL` in `config/app.config.js` is correct
3. ✅ Ensure backend CORS allows your origin
4. ✅ Check network connection (same WiFi)

### WebRTC Issues

**Symptoms:** Voice calls not working

**Solutions:**
1. ✅ Check app permissions (microphone access)
2. ✅ Verify WebRTC libraries are installed
3. ✅ Check `CallScreen.js` imports are not commented out
4. ✅ Test on physical device (WebRTC requires real device)

### IP Address Changed

**Symptoms:** App worked before but now can't connect

**Solutions:**
1. ✅ Find new IP address (`ipconfig` on Windows, `ifconfig` on Mac/Linux)
2. ✅ Update `config/app.config.js` with new IP
3. ✅ Restart Expo server: `npx expo start -c`
4. ✅ Reload app on device

### Cannot Resolve Host

**Symptoms:** "ENOTFOUND" or "Cannot resolve host" error

**Solutions:**
1. ✅ Verify IP address format is correct (e.g., `192.168.1.100`)
2. ✅ Check for typos in `config/app.config.js`
3. ✅ Ensure no spaces or special characters in IP
4. ✅ Try pinging the IP from your computer to verify it's reachable

---

## Testing

The mobile app includes comprehensive automated testing infrastructure using Jest and React Native Testing Library.

### Testing Approach

- **Unit Tests** - Test individual functions, utilities, and hooks in isolation with mocked dependencies
- **Integration Tests** - Test screen components, navigation flows, and user interactions with mocked API calls and socket events

### Test Directory Structure

- `__tests__/unit/` - Unit tests for utilities and services (storage.js, errors.js, network.js, app.config.js)
- `__tests__/integration/` - Integration tests for screens and navigation flows
- `__tests__/helpers/` - Reusable test utilities (test data, renderers, navigation helpers, socket mocks)
- `__tests__/setup.js` - Global test setup with Expo and React Native module mocks
- `__mocks__/` - Module mocks for static assets (images, fonts)

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for TDD)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Verbose output
npm run test:verbose

# Debug mode (detect open handles)
npm run test:debug
```

### Mocked Modules

The test setup automatically mocks the following modules since they require native code:

- **Expo Modules:** expo-location, expo-secure-store, expo-notifications, expo-task-manager, expo-image-picker
- **React Native Modules:** @react-native-async-storage/async-storage, react-native-maps, react-native-webrtc
- **Navigation:** @react-navigation/native (useNavigation, useRoute hooks)
- **Socket.io:** socket.io-client (mock socket with on, emit, connect, disconnect methods)
- **Static Assets:** Images, fonts, and other static files are mocked

### Coverage Requirements

Initial coverage thresholds are set at 40% for:
- Branches
- Functions
- Lines
- Statements

Coverage reports are generated in the `coverage/` directory. View the HTML report by opening `coverage/index.html` in your browser.

### Writing Tests

**Guidelines for writing component tests:**

1. **Test user behavior, not implementation details** - Focus on what users see and do, not internal state or methods
2. **Use @testing-library/react-native** - Provides utilities like `render`, `fireEvent`, `waitFor`
3. **Mock navigation** - Use `renderWithNavigation` helper or mock `useNavigation` hook
4. **Mock API calls** - Use `jest.mock` to mock axios or network service
5. **Mock socket events** - Use `mockSocketEmit` helper to simulate socket events
6. **Test async operations** - Use `waitFor` and `act` for asynchronous updates

**Example test structure:**

```javascript
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MyScreen from '../screens/MyScreen';

describe('MyScreen', () => {
  it('should render correctly', () => {
    const { getByText } = render(<MyScreen />);
    expect(getByText('Welcome')).toBeTruthy();
  });

  it('should handle button press', async () => {
    const { getByText } = render(<MyScreen />);
    const button = getByText('Submit');
    fireEvent.press(button);
    
    await waitFor(() => {
      expect(getByText('Success')).toBeTruthy();
    });
  });
});
```

### Manual Testing

### Test Accounts

Use the test accounts from the backend (see `../backend/SafeRide-Backend/README.md`):

**Passenger Account:**
- Phone: `+923001111111`
- Name: `Test Passenger`

**Driver Account:**
- Phone: `+923002222222`
- Name: `Test Driver`

**Admin Account:**
- Phone: `+923001234567`
- Name: `Admin User`

### Manual Testing Checklist

- [ ] **Authentication**
  - [ ] Request OTP
  - [ ] Verify OTP and login
  - [ ] Token persistence on app restart

- [ ] **Trip Management**
  - [ ] Create trip (passenger)
  - [ ] View available trips (driver)
  - [ ] Accept/decline offers
  - [ ] Start trip
  - [ ] Complete trip
  - [ ] Rate trip

- [ ] **Real-time Features**
  - [ ] Location tracking updates
  - [ ] Chat messages send/receive
  - [ ] Voice call initiate/answer
  - [ ] Trip status updates

- [ ] **Safety Features**
  - [ ] SOS alert trigger
  - [ ] Trip sharing with contacts
  - [ ] Emergency contacts management

---

## Additional Resources

- **Backend API Documentation:** `../backend/SafeRide-Backend/API_REFERENCE.md`
- **Backend Setup Guide:** `../backend/SafeRide-Backend/README.md`
- **Expo Documentation:** [https://docs.expo.dev/](https://docs.expo.dev/)
- **React Native Documentation:** [https://reactnative.dev/](https://reactnative.dev/)
- **Socket.io Client Docs:** [https://socket.io/docs/v4/client-api/](https://socket.io/docs/v4/client-api/)
- **WebRTC Documentation:** [https://webrtc.org/](https://webrtc.org/)

---

## Support

For issues or questions:

1. Check the **Troubleshooting** section above
2. Review backend documentation: `../backend/SafeRide-Backend/README.md`
3. Check Expo logs: `npx expo start` shows detailed logs
4. Verify configuration in `config/app.config.js`

---

**Made with ❤️ for Women's Safety**

---

