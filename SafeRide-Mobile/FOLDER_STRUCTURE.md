# SafeRide Mobile - Folder Structure

```
SafeRide-Mobile/
├── App.js                           # Main App component
├── app.json                         # Expo configuration
├── index.js                         # Entry point
├── jest.config.js                   # Jest testing configuration
├── package.json                     # Dependencies and scripts
├── package-lock.json
├── README.md                        # Project README
├── INTEGRATION_TESTING_GUIDE.md     # Testing documentation
│
├── .expo/                           # Expo cache and settings
│   ├── devices.json
│   ├── packager-info.json
│   ├── README.md
│   └── settings.json
│
├── .gitignore                       # Git ignore file
│
├── assets/                          # Static assets
│   ├── adaptive-icon.png
│   ├── favicon.png
│   ├── icon.png
│   └── splash-icon.png
│
├── components/                      # Reusable components
│   └── ImageUpload.js
│
├── config/                          # Configuration files
│   └── app.config.js
│
├── screens/                         # App screens
│   ├── CallScreen.js
│   ├── ChatScreen.js
│   ├── DriverRegistrationScreen.js
│   └── RatingScreen.js
│
├── services/                        # Business logic and API services
│   ├── network.js                   # API/Network requests
│   └── socketManager.js             # WebSocket management
│
├── src/                             # Source code
│   └── background/
│       └── locationTask.js          # Background location tracking
│
├── utils/                           # Utility functions
│   ├── errors.js                    # Error handling
│   ├── location.js                  # Location utilities
│   ├── retry.js                     # Retry logic
│   ├── storage.js                   # Local storage utilities
│   └── toast.js                     # Toast notifications
│
├── __mocks__/                       # Test mocks
│   └── fileMock.js
│
└── __tests__/                       # Test files
    ├── setup.js                     # Test setup
    ├── helpers/                     # Test helpers
    ├── integration/                 # Integration tests
    └── unit/                        # Unit tests
```

## Directory Descriptions

| Directory | Purpose |
|-----------|---------|
| `.expo/` | Expo framework cache and configuration |
| `assets/` | Images, icons, and static media files |
| `components/` | Reusable React Native components |
| `config/` | Application configuration files |
| `screens/` | Screen components for different views |
| `services/` | Business logic, API calls, WebSocket |
| `src/background/` | Background tasks (location tracking) |
| `utils/` | Helper functions and utilities |
| `__mocks__/` | Mock files for testing |
| `__tests__/` | Test suite (unit, integration, helpers) |
