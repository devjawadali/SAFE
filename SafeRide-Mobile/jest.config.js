module.exports = {
  // Preset
  preset: 'jest-expo',

  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo|@expo|@unimodules|react-navigation|@react-navigation|socket.io-client|react-native-webrtc|react-native-paper|react-native-maps)/'
  ],

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/setup.js',
    '@testing-library/jest-native/extend-expect'
  ],

  // Module name mapper
  moduleNameMapper: {
    '^@/(.*)': '<rootDir>/$1',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/__mocks__/fileMock.js'
  },

  // Test match patterns
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/'],

  // Coverage configuration
  collectCoverageFrom: [
    '**/*.{js,jsx}',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/android/**',
    '!**/ios/**',
    '!**/.expo/**',
    '!**/index.js',
    '!jest.config.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40
    }
  },

  // Module file extensions
  moduleFileExtensions: ['js', 'jsx', 'json', 'node'],

  // Globals
  globals: {
    '__DEV__': true
  },

  // Timeouts
  testTimeout: 10000,

  // Clear mocks
  clearMocks: true,
  resetMocks: true
};

