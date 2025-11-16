# SafeRide Women - Backend Server

**Secure, Real-Time Backend for Women-Only Ride Hailing Platform**

![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)
![Express.js](https://img.shields.io/badge/Express.js-4.x-lightgrey.svg)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-blue.svg)
![JWT](https://img.shields.io/badge/JWT-Auth-purple.svg)
![License](https://img.shields.io/badge/License-ISC-blue.svg)
![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)

A comprehensive, production-ready backend server for a women-focused ride-hailing platform featuring real-time communication, comprehensive safety features, and admin monitoring capabilities.

---

## Key Features

### Core Features

- ✅ **JWT Authentication** with OTP verification (6-digit, 5-minute expiry)
- ✅ **Real-time communication** via Socket.io (12+ events)
- ✅ **Complete trip lifecycle management** (request → accept → start → complete → rate)
- ✅ **In-app chat** with profanity filtering
- ✅ **WebRTC voice call signaling**
- ✅ **Driver offer/bidding system**

### Women Safety Features

- 🚨 **SOS Emergency Alerts** with location tracking
- 🔗 **Trip sharing** with trusted contacts
- 📞 **Emergency contact system**
- 🎙️ **Emergency call recording flag**
- 👮 **Admin monitoring** (messages, calls, SOS events)
- ✅ **Driver verification workflow**
- 📍 **Real-time location tracking**

### Security Features

- 🔒 **Helmet security headers**
- 🚦 **Rate limiting** (auth: 5/15min, API: 100/min)
- 🛡️ **Role-based authorization** (passenger, driver, admin)
- 🔑 **JWT tokens** with access/refresh token pairs
- 🔐 **Token revocation** - Access tokens are revoked on logout for immediate invalidation
- 🌐 **CORS configuration**
- 🚫 **Profanity filtering** in chat
- 🔍 **Sentry error tracking** with automatic scrubbing of sensitive data (tokens, headers, phone numbers)

### Technical Highlights

- 📡 **25+ REST API endpoints**
- ⚡ **12+ Socket.io real-time events**
- 💾 **PostgreSQL database** with connection pooling
- 📊 **Admin dashboard endpoints**
- 🐛 **Sentry error tracking** for production monitoring
- 🧪 **Comprehensive testing suite** (see TESTING.md)

---

## Quick Start

### Prerequisites

- **Node.js 16+** (verify: `node --version`)
- **npm 7+** (verify: `npm --version`)
- **Git** (for cloning)
- Text editor (VS Code recommended)

### Installation (5 minutes)

```bash
# 1. Navigate to project directory
# Windows (PowerShell/CMD):
cd SafeRide-Backend
# macOS/Linux:
cd ~/SafeRide-Backend
# or use the full path to your project directory

# 2. Copy environment file and configure
# Windows (PowerShell):
Copy-Item .env.example .env
# Windows (CMD):
copy .env.example .env
# macOS/Linux:
cp .env.example .env
# Then edit .env with your settings

# 3. Install dependencies
npm install

# 4. Setup database
npm run db:setup

# 5. Start server
npm start

# 5. Verify server running
curl http://localhost:4000/api/health
```

### Expected Output

```
╔═══════════════════════════════════════════════╗
║   🚗 SAFERIDE WOMEN BACKEND SERVER           ║
╚═══════════════════════════════════════════════╝

✅ Server running on: http://localhost:4000
✅ Socket.io ready
✅ Environment: development
```

### First API Call

```bash
# Request OTP for sample passenger
curl -X POST http://localhost:4000/api/auth/otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+923001111111"}'

# Response includes OTP (development mode only)
# Use OTP to verify and get JWT token
```

---

## Architecture Overview

### System Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Mobile App     │◄───────►│  Backend Server  │
│  (React Native) │  HTTP   │  (Express.js)    │
│                 │  WS     │                  │
└─────────────────┘         └──────────────────┘
                                     │
                            ┌────────┴────────┐
                            │                 │
                    ┌───────▼──────┐  ┌──────▼──────┐
                    │  REST API    │  │  Socket.io  │
                    │  (25+ routes)│  │  (Real-time)│
                    └──────────────┘  └─────────────┘
                            │
                    ┌───────▼──────────┐
                    │   PostgreSQL     │
                    │  (Connection     │
                    │   Pooling)       │
                    └──────────────────┘
```

### Technology Stack

- **Runtime:** Node.js 16+
- **Framework:** Express.js 4.x
- **Real-time:** Socket.io 4.x
- **Authentication:** jsonwebtoken
- **Security:** helmet, express-rate-limit, cors
- **Utilities:** dotenv, bad-words (profanity filter)
- **Database:** PostgreSQL with connection pooling
- **Error Tracking:** Sentry
- **Logging:** Pino
- **Testing:** Jest, Supertest, socket.io-client

### Data Flow

1. Mobile app sends HTTP request with JWT token
2. Authentication middleware validates token
3. Authorization middleware checks user role
4. Business logic processes request
5. Database operations (in-memory Maps)
6. Socket.io broadcasts real-time events
7. Response sent to client

For detailed architecture, see `ARCHITECTURE.md`.  
For deployment instructions, see `DEPLOYMENT.md`.

---

## API Overview

**Note:** Complete API documentation with detailed request/response examples lives in `API_REFERENCE.md`. The following is a summary of available endpoints.

### API Endpoints (25+)

**Authentication:**

- `POST /api/auth/otp` - Request OTP code
- `POST /api/auth/verify` - Verify OTP & get JWT token

**User Profile:**

- `GET /api/me` - Get current user profile
- `PUT /api/me` - Update profile (emergency contacts, trusted contacts)

**Trip Management:**

- `POST /api/trips` - Create new trip (passenger only)
- `GET /api/trips/:id` - Get trip details
- `GET /api/trips` - List user's trips (with status filter)

**Offers & Acceptance:**

- `POST /api/trips/:id/offers` - Driver makes offer
- `GET /api/trips/:id/offers` - List pending offers
- `POST /api/trips/:id/accept` - Passenger accepts offer

**Trip Actions:**

- `POST /api/trips/:id/start` - Driver starts trip
- `POST /api/trips/:id/complete` - Driver completes trip
- `POST /api/trips/:id/cancel` - Cancel trip (passenger/driver)
- `POST /api/trips/:id/share` - Share trip with contacts
- `DELETE /api/trips/:id/share/:contactId` - Unshare trip (requires contactId parameter, e.g., phone or identifier)

**Chat & Communication:**

- `POST /api/trips/:id/messages` - Send chat message
- `GET /api/trips/:id/messages` - Get message history

**Voice Calls:**

- `POST /api/trips/:id/call/initiate` - Initiate voice call
- `GET /api/trips/:id/call/status` - Get call status

**Ratings:**

- `POST /api/trips/:id/rate` - Rate trip (1-5 stars + comment)

**Driver Management:**

- `POST /api/drivers/register` - Register as driver
- `PUT /api/drivers/status` - Update online status

**SOS Emergency:**

- `POST /api/sos` - Trigger SOS alert
- `GET /api/sos` - List SOS events (admin only)

**Admin Panel:**

- `GET /api/admin/trips` - List all trips
- `GET /api/admin/drivers/pending` - Pending verifications
- `POST /api/admin/drivers/:id/verify` - Verify/reject driver
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/messages` - Monitor chat messages
- `GET /api/admin/calls` - Monitor voice calls

**Health Check:**

- `GET /api/health` - Server health status

See `API_REFERENCE.md` for complete API documentation with request/response examples, data models, and detailed endpoint specifications.

---

## Socket.io Events

### Socket.io Events (12+)

**Connection Management:**

- `authenticate` - Authenticate socket with JWT token
  ```javascript
  socket.emit('authenticate', { token: 'your-jwt-token' });
  socket.on('authenticated', (data) => {
    console.log('Authenticated:', data.userId);
  });
  ```
- `join_trip` - Join trip-specific room
- `disconnect` - Handle disconnection

**Location Tracking:**

- `location_update` - Driver sends location
- `driver_online` - Driver goes online

**Chat Messaging:**

- `send_message` - Send chat message
- `receive_message` - Receive message (broadcast)
- `typing_indicator` - User typing status
- `user_typing` - Typing notification (broadcast)
- `message_read` - Mark message as read
- `message_read_receipt` - Read receipt (broadcast)
- `chat_disabled` - Chat disabled notification

**Voice Call Signaling:**

- `call_initiate` - Initiate call
- `call_incoming` - Incoming call notification
- `call_offer` - WebRTC SDP offer
- `call_answer` - WebRTC SDP answer
- `ice_candidate` - WebRTC ICE candidate
- `call_connected` - Call connected notification
- `call_end` - End call
- `call_ended` - Call ended notification

**Trip Updates:**

- `new_trip` - New trip available (to drivers)
- `new_offer` - New offer received (to passenger)
- `offer_accepted` - Offer accepted (to driver)
- `trip_started` - Trip started notification
- `trip_completed` - Trip completed notification
- `trip_shared` - Trip shared notification

**Emergency:**

- `sos_alert` - SOS alert broadcast (global)

For event payloads and usage examples, see `API_REFERENCE.md`.

---

## Sample Data & Demo Accounts

### Pre-loaded Test Accounts

The backend includes sample data for immediate testing (from `initializeDatabase()` function in `server.js`):

**Admin Account:**

- Phone: `+923001234567`
- Name: `Admin User`
- Role: admin
- User ID: 1
- Access: All admin endpoints

**Passenger Account:**

- Phone: `+923001111111`
- Name: `Test Passenger`
- Role: passenger
- User ID: 2
- Access: Create trips, accept offers, chat, call

**Driver Account:**

- Phone: `+923002222222`
- Name: `Test Driver`
- Role: driver
- User ID: 3
- Vehicle: Toyota Corolla (ABC-123)
- License: `DL123456`
- Rating: 4.8 ⭐
- Status: Verified ✅
- Total Trips: `15`
- Access: Make offers, start/complete trips, chat, call

### Quick Test Flow

```bash
# 1. Login as passenger
curl -X POST http://localhost:4000/api/auth/otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+923001111111"}'

# 2. Note OTP from response (development mode)

# 3. Verify OTP to get token

# 4. Use token for authenticated requests
```

---

## Environment Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure your settings:

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Windows (CMD):**
```cmd
copy .env.example .env
```

**macOS/Linux:**
```bash
cp .env.example .env
```

Then edit `.env` with your configuration:

```env
# Server Configuration
PORT=4000                    # Server port
NODE_ENV=development         # Environment mode

# Authentication
JWT_SECRET=your-secret-key-change-in-production-2024  # JWT signing key
ACCESS_TOKEN_EXPIRY=30m      # Access token expiration (e.g., 30m, 1h)
REFRESH_TOKEN_EXPIRY_DAYS=7  # Refresh token expiration in days
OTP_EXPIRY=300              # OTP expiration (seconds)

# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/saferide
# Or use individual parameters:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=saferide
# DB_USER=postgres
# DB_PASSWORD=password
# DB_SSL=false  # Set to true in production

# Security
CORS_ORIGIN=*               # CORS allowed origins (* for dev, restrict in production)

# Error Tracking (Optional but recommended)
SENTRY_DSN=                 # Sentry DSN for error tracking
SENTRY_RELEASE=saferide-backend@1.0.0

# Socket.io (Optional)
SOCKET_TRANSPORTS=websocket,polling
```

### Important Notes

- `.env.example` is provided as a template - you must create your own `.env` file
- `NODE_ENV=development` shows OTP in API responses (for testing)
- `JWT_SECRET` should be changed in production (use a strong random string)
- `CORS_ORIGIN=*` allows all origins (restrict in production)
- `DATABASE_URL` is required for PostgreSQL connection
- `SENTRY_DSN` should be set in production for error tracking
- `DB_SSL` should be enabled in production for secure database connections
- Never commit `.env` to version control

---

## Mobile App Connection

### Connecting Mobile App

**Step 1: Find Your IP Address**

Windows:

```cmd
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
# Example: 192.168.0.108
```

Mac/Linux:

```bash
ifconfig
# Look for "inet" under en0 or wlan0
# Example: 192.168.0.108
```

**Step 2: Update Mobile App Configuration**

The mobile app now uses centralized configuration. Edit `mobile/SafeRide-Mobile/config/app.config.js`:

1. Open `mobile/SafeRide-Mobile/config/app.config.js`
2. Find the `development` configuration object
3. Update `API_URL` and `SOCKET_URL` with your computer's IP address:

```javascript
development: {
  API_URL: 'http://YOUR_IP:4000/api',  // Replace YOUR_IP with your computer's IP
  SOCKET_URL: 'http://YOUR_IP:4000',   // Replace YOUR_IP with your computer's IP
  // ... other settings
}
```

**Note:** The mobile app now uses centralized configuration. All API URLs are managed in `config/app.config.js` for easier environment management.

For detailed mobile app setup instructions, see `mobile/SafeRide-Mobile/README.md`.

**Step 3: Verify Network**

- Ensure mobile device and computer on **same WiFi network**
- Disable VPN if connection fails
- Check firewall allows port 4000

**Step 4: Start Backend**

```bash
# Navigate to backend directory
cd SafeRide-Backend
npm start
```

**Step 5: Start Mobile App**

```bash
# Navigate to mobile app directory
cd SafeRide-Mobile
npx expo start
```

**Step 6: Test Connection**

- Open Expo Go app on mobile device
- Scan QR code
- App should connect to backend
- Try login with sample passenger account

For detailed troubleshooting, see `SETUP_GUIDE.md`.

---

## Project Structure

```
SafeRide-Backend/
├── server.js              # Main server (2331 lines)
│   ├── Dependencies & Config
│   ├── In-Memory Database
│   ├── Security Middleware
│   ├── Authentication Middleware
│   ├── Socket.io Handlers (lines 206-777)
│   ├── Helper Functions
│   ├── REST API Endpoints (25+)
│   └── Server Startup
│
├── package.json           # Dependencies & scripts
│   ├── express: ^4.18.2
│   ├── socket.io: ^4.6.1
│   ├── jsonwebtoken: ^9.0.2
│   ├── helmet: ^7.1.0
│   ├── express-rate-limit: ^7.1.5
│   ├── bad-words: ^3.0.4
│   └── cors, dotenv
│
├── .env.example          # Environment configuration template
├── .env                  # Environment configuration (create from .env.example)
├── .env.test             # Test environment configuration
├── .gitignore            # Git ignore rules
├── jest.config.js        # Jest testing configuration
│
├── __tests__/            # Test directory
│   ├── setup.js          # Global test setup (database, mocks)
│   ├── teardown.js       # Global test teardown (cleanup)
│   ├── unit/             # Unit tests for individual modules
│   ├── integration/      # Integration tests for API endpoints and Socket.io
│   └── helpers/          # Reusable test utilities
│
├── README.md             # This file (main documentation)
├── API_REFERENCE.md      # Detailed API documentation
├── ARCHITECTURE.md       # System architecture & design
├── SETUP_GUIDE.md        # Setup & troubleshooting
├── DEPLOYMENT.md         # Deployment guide
└── TESTING.md            # Comprehensive testing guide
```

### Key Files

- `server.js`: Complete backend implementation (all features)
- `package.json`: Dependencies and npm scripts
- `.env.example`: Environment configuration template (copy to `.env` and edit)
- `TESTING.md`: 2300+ lines of test procedures

---

## Available Scripts

```bash
# Start production server
npm start
# - Runs server with production settings
# - No auto-reload
# - Optimized for performance

# Start development server (if configured)
npm run dev
# - Auto-reload on file changes
# - Verbose logging
# - Shows OTP in responses

# Install dependencies
npm install
# - Installs all packages from package.json
# - Run after cloning repository

# Check for updates
npm outdated
# - Shows outdated packages

# Testing
npm test
# - Run all tests
npm run test:watch
# - Run tests in watch mode for TDD
npm run test:coverage
# - Generate coverage reports
npm run test:unit
# - Run only unit tests
npm run test:integration
# - Run only integration tests
npm run test:db:setup
# - Set up test database schema
npm run test:db:reset
# - Reset test database
```

---

## Testing

The backend includes comprehensive automated testing infrastructure using Jest and Supertest.

### Testing Approach

- **Unit Tests** - Test individual modules, functions, and utilities in isolation with mocked dependencies
- **Integration Tests** - Test API endpoints, Socket.io events, and database operations with real test database

### Test Directory Structure

- `__tests__/unit/` - Unit tests for individual modules (services, middleware, utils, config)
- `__tests__/integration/` - Integration tests for API endpoints, Socket.io, and database operations
- `__tests__/helpers/` - Reusable test utilities (test data factories, server helpers, authentication helpers)
- `__tests__/setup.js` - Global test setup (database connection, mocks, test utilities)
- `__tests__/teardown.js` - Global test teardown (database cleanup)

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for TDD)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Verbose output
npm run test:verbose
```

### Test Database Setup

Before running tests, you need to set up a separate test database:

```bash
# Create test database
createdb saferide_test_db

# Set up test database schema
npm run test:db:setup

# Reset test database (drop and recreate)
npm run test:db:reset
```

**Important:** The test database (`saferide_test`) is completely separate from the development database (`saferide`) to prevent data pollution. Test configuration is loaded from `.env.test` file.

**Test Environment Setup:** Before running tests, copy `.env.test.example` to `.env.test` and update it with your test database credentials:

```bash
# Windows (PowerShell):
Copy-Item .env.test.example .env.test

# Windows (CMD):
copy .env.test.example .env.test

# macOS/Linux:
cp .env.test.example .env.test
```

Then edit `.env.test` with your test database configuration.

### Coverage Requirements

Initial coverage thresholds are set at 50% for:
- Branches
- Functions
- Lines
- Statements

Coverage reports are generated in the `coverage/` directory. View the HTML report by opening `coverage/index.html` in your browser.

### Manual Testing

Comprehensive manual testing documentation is available in `TESTING.md` (2300+ lines) covering:

- ✅ Authentication flow (OTP → JWT)
- ✅ All 25+ REST API endpoints
- ✅ Socket.io real-time events
- ✅ Complete trip lifecycle
- ✅ Chat & voice call features
- ✅ Security & authorization
- ✅ Women safety features (SOS, trip sharing)
- ✅ Rate limiting
- ✅ Input validation
- ✅ Error handling

### Quick Test

```bash
# Health check
curl http://localhost:4000/api/health

# Request OTP
curl -X POST http://localhost:4000/api/auth/otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+923001111111"}'
```

For complete manual testing procedures, see `TESTING.md`.

---

## Documentation

- **README.md** (this file) - Overview & quick start
- **[API_REFERENCE.md](API_REFERENCE.md)** - Complete API documentation
  - All endpoints with request/response examples
  - Authentication flows
  - Socket.io event payloads
  - Error codes & handling
  
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture
  - Component diagrams
  - Data flow
  - Technology stack
  - Design decisions
  
- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Setup & troubleshooting
  - Development environment setup
  - Mobile app connection
  - Common issues & solutions
  - Defense demonstration guide
  
- **[TESTING.md](TESTING.md)** - Testing procedures
  - Manual testing guide
  - API endpoint tests
  - Socket.io event tests
  - Security testing

---

## Troubleshooting

### Common Issues & Solutions

**Issue: Server won't start**

```bash
# Check if port 4000 is in use
# Windows:
netstat -ano | findstr :4000
# macOS/Linux:
lsof -i :4000

# Solution: Change PORT in .env or kill process
# See SETUP_GUIDE.md for detailed instructions
```

**Issue: Mobile app can't connect**

- ✅ Verify IP address is correct
- ✅ Ensure same WiFi network
- ✅ Check firewall allows port 4000
- ✅ Disable VPN
- ✅ Restart backend server

**Issue: OTP not received in response**

- ✅ Verify `NODE_ENV=development` in .env
- ✅ Check server console logs for OTP
- ✅ OTP only shown in development mode

**Issue: Token authentication fails**

- ✅ Verify token format: `Bearer [token]`
- ✅ Check token not expired (7 days)
- ✅ Ensure JWT_SECRET matches

**Issue: Socket.io connection fails**

- ✅ Verify server running
- ✅ Check CORS configuration
- ✅ Ensure client uses websocket transport

**Issue: Rate limiting too aggressive**

- ✅ Wait 15 minutes for auth limit reset
- ✅ Wait 1 minute for API limit reset
- ✅ Adjust limits in server.js if needed

For detailed troubleshooting, see `SETUP_GUIDE.md`.

### PostgreSQL Database Issues

The SafeRide backend requires PostgreSQL 16+ with proper configuration. Below are common database-related issues and solutions.

#### Issue: Backend crashes on startup (silent exit)

**Symptoms:**

- Running `npm start` or `node server.js` exits immediately
- No "Server running on port 4000" message
- No visible error in console

**Diagnosis:**

- The startup sequence (server.js lines 110-119) calls `checkConnection()` and `runDatabaseMigrations()`
- If either fails, the server logs an error and calls `process.exit(1)`
- Errors may not be visible if logger isn't outputting to console

**Solutions:**

1. **Run with tracing to see hidden errors:**

   ```bash
   node --trace-warnings --trace-uncaught server.js
   ```

   This reveals unhandled promise rejections and warnings.

2. **Check if .env file exists and is complete:**

   - Location: `c:/SafeRide-Complete/backend/SafeRide-Backend/.env`
   - Must include: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET
   - Copy from .env.example if missing: `copy .env.example .env`
   - See "Environment Configuration" section above for required variables

3. **Verify PostgreSQL service is running:**

   - Windows: Open Services (Win+R → services.msc) → Find "postgresql-x64-16" → Status should be "Running"
   - Start if stopped: Right-click → Start
   - Or command: `net start postgresql-x64-16`
   - Verify port: `netstat -ano | findstr :5432` (should show LISTENING)

4. **Check database exists:**

   ```bash
   psql -U postgres -c "\l"
   ```

   Should list 'saferide' database. If missing:

   ```bash
   psql -U postgres -c "CREATE DATABASE saferide;"
   ```

5. **Verify database credentials:**

   - Test connection manually:

     ```bash
     psql -h localhost -p 5432 -U postgres -d saferide
     ```

   - If "password authentication failed": DB_PASSWORD in .env is incorrect
   - If "database does not exist": Run CREATE DATABASE command above

#### Issue: "password authentication failed for user postgres"

**Cause:** DB_PASSWORD in .env doesn't match PostgreSQL password, or password is empty.

**Solutions:**

1. **If you remember the password:**

   - Edit .env file
   - Set `DB_PASSWORD=your_actual_password` (no quotes, no spaces)
   - Restart server

2. **If you forgot the password (Windows):**

   - Stop PostgreSQL service: `net stop postgresql-x64-16`
   - Edit `C:\Program Files\PostgreSQL\16\data\pg_hba.conf` (as Administrator)
   - Find line: `host    all             all             127.0.0.1/32            scram-sha-256`
   - Change `scram-sha-256` to `trust` (allows passwordless local access)
   - Save and start service: `net start postgresql-x64-16`
   - Connect without password: `psql -U postgres -h localhost`
   - Reset password: `ALTER USER postgres PASSWORD 'new_password_here';`
   - Exit: `\q`
   - Revert pg_hba.conf: Change `trust` back to `scram-sha-256`
   - Restart service: `net stop postgresql-x64-16` then `net start postgresql-x64-16`
   - Update .env: `DB_PASSWORD=new_password_here`
   - Restart backend server

#### Issue: "database saferide does not exist"

**Cause:** The 'saferide' database hasn't been created in PostgreSQL.

**Solution:**

```bash
# Create database
psql -U postgres -c "CREATE DATABASE saferide;"

# Verify creation
psql -U postgres -c "\l" | findstr saferide

# Run schema (creates tables)
psql -U postgres -d saferide -f db/schema.sql

# Optional: Load seed data (test accounts)
psql -U postgres -d saferide -f db/seed.sql

# Restart server
node server.js
```

#### Issue: "connect ECONNREFUSED 127.0.0.1:5432" or "connect ECONNREFUSED ::1:5432"

**Cause:** PostgreSQL service is not running, or not listening on port 5432.

**Solutions:**

1. **Start PostgreSQL service:**

   - Windows: `net start postgresql-x64-16`
   - Or via Services GUI: services.msc → postgresql-x64-16 → Start

2. **Verify port 5432 is listening:**

   ```bash
   netstat -ano | findstr :5432
   ```

   Should show: `TCP    0.0.0.0:5432           0.0.0.0:0              LISTENING`

3. **Check if another service is using port 5432:**

   - If port is in use by another process, change PostgreSQL port or kill the process
   - Update .env: `DB_PORT=5433` (or another free port)

4. **Verify PostgreSQL is installed:**

   - Check: `psql --version`
   - Should show: `psql (PostgreSQL) 16.x`
   - If not installed: Download from https://www.postgresql.org/download/windows/

#### Issue: "role postgres does not exist"

**Cause:** PostgreSQL user 'postgres' wasn't created during installation.

**Solution:**

```bash
# Connect as superuser (may be different username)
psql -U <your_username>

# Create postgres user
CREATE USER postgres WITH SUPERUSER PASSWORD 'your_password';

# Exit
\q

# Update .env
DB_USER=postgres
DB_PASSWORD=your_password

# Restart server
```

#### Issue: Database migrations fail

**Symptoms:**

- Server starts but shows "Database migration failed" error
- Tables or columns are missing

**Diagnosis:**

- The `runDatabaseMigrations()` function (server.js lines 68-108) adds columns to users table
- Adds: city, profile_picture_url, gender columns
- Adds CHECK constraint: gender IN ('female', 'woman')

**Solutions:**

1. **Run schema manually:**

   ```bash
   psql -U postgres -d saferide -f db/schema.sql
   ```

   This creates all tables with proper structure.

2. **Check for conflicting constraints:**

   ```sql
   -- Connect to database
   psql -U postgres -d saferide
   
   -- List constraints on users table
   \d users
   
   -- If gender constraint exists with wrong values, drop it
   ALTER TABLE users DROP CONSTRAINT IF EXISTS users_gender_check;
   
   -- Exit and restart server (will recreate constraint)
   \q
   ```

3. **Verify table structure:**

   ```sql
   psql -U postgres -d saferide -c "\d users"
   ```

   Should show columns: id, phone, name, role, city, profile_picture_url, gender, created_at, updated_at

4. **Check migration logs:**

   - Look for "Database migrations completed successfully" in console
   - If not present, check error message above it
   - Common issues: Permission denied, table doesn't exist, constraint already exists

#### Issue: JWT_SECRET not set or too weak

**Symptoms:**

- Server starts but authentication fails
- "Invalid token" errors on API calls
- Security warnings in logs

**Solution:**

```bash
# Generate strong JWT secret (64+ characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Copy output and add to .env
JWT_SECRET=<paste_generated_secret_here>

# Restart server
```

**Important:** Never use the placeholder value from .env.example (`your-secret-key-change-in-production-2024`) in production.

#### Issue: Missing .env file

**Symptoms:**

- Server crashes with "DB_PASSWORD is undefined" or similar
- Environment variables not loaded

**Solution:**

```bash
# Navigate to backend directory
cd c:\SafeRide-Complete\backend\SafeRide-Backend

# Copy .env.example to .env
copy .env.example .env

# Edit .env with your configuration
notepad .env

# Required variables:
# - DB_HOST=localhost
# - DB_PORT=5432
# - DB_NAME=saferide
# - DB_USER=postgres
# - DB_PASSWORD=<your_password>
# - JWT_SECRET=<generated_secret>
# - NODE_ENV=development
# - PORT=4000
# - CORS_ORIGIN=*

# Restart server
node server.js
```

#### Verification Checklist

Before starting the server, verify:

- [ ] PostgreSQL 16+ installed
- [ ] PostgreSQL service running (services.msc)
- [ ] Port 5432 listening (netstat -ano | findstr :5432)
- [ ] Database 'saferide' exists (psql -U postgres -c "\l")
- [ ] .env file exists with all required variables
- [ ] DB_PASSWORD matches PostgreSQL password
- [ ] JWT_SECRET is strong (64+ characters)
- [ ] NODE_ENV=development for local testing
- [ ] Schema loaded (psql -U postgres -d saferide -f db/schema.sql)

#### Quick Diagnostic Commands

```bash
# Check PostgreSQL version
psql --version

# Check if service is running
net start | findstr postgres

# List databases
psql -U postgres -c "\l"

# Test connection
psql -h localhost -p 5432 -U postgres -d saferide -c "SELECT NOW();"

# List tables in saferide database
psql -U postgres -d saferide -c "\dt"

# Check users table structure
psql -U postgres -d saferide -c "\d users"

# Count users (should be 3 after seed data)
psql -U postgres -d saferide -c "SELECT COUNT(*) FROM users;"

# Verify gender constraint
psql -U postgres -d saferide -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_gender_check';"
```

#### Additional Resources

- PostgreSQL Documentation: https://www.postgresql.org/docs/16/
- pg_hba.conf Configuration: https://www.postgresql.org/docs/16/auth-pg-hba-conf.html
- Connection String Format: https://www.postgresql.org/docs/16/libpq-connect.html#LIBPQ-CONNSTRING
- SafeRide Setup Guide: See SETUP_GUIDE.md for detailed instructions
- Database Schema: See db/schema.sql for table definitions

---

## Defense Demonstration Guide

### Preparation (5 minutes before defense)

1. Start backend server: `npm start`
2. Verify health check: `curl http://localhost:4000/api/health`
3. Open Postman/Thunder Client with prepared requests
4. Have mobile app ready on phone (connected to backend)
5. Open admin dashboard (if available)

### Demonstration Flow (10-15 minutes)

**1. System Overview (2 min)**

- Show server startup logs
- Explain architecture (REST + Socket.io)
- Highlight women safety features

**2. Authentication Demo (2 min)**

- Request OTP for passenger
- Show OTP in response (development mode)
- Verify OTP and receive JWT token
- Explain security (rate limiting, JWT expiry)

**3. Trip Lifecycle Demo (4 min)**

- Passenger creates trip
- Driver receives notification (Socket.io)
- Driver makes offer
- Passenger receives offer (Socket.io)
- Passenger accepts offer
- Driver starts trip
- Show real-time location updates
- Driver completes trip
- Passenger rates driver

**4. Safety Features Demo (3 min)**

- Show trip sharing with contacts
- Demonstrate SOS alert (global broadcast)
- Show emergency contact system
- Display admin monitoring (messages, calls)

**5. Chat & Call Demo (2 min)**

- Send chat messages (real-time delivery)
- Show profanity filtering
- Demonstrate call signaling (WebRTC)
- Show emergency call recording flag

**6. Admin Panel Demo (2 min)**

- Show system statistics
- Display all trips
- Monitor flagged messages
- Review SOS events

### Q&A Preparation

- Be ready to explain JWT authentication
- Know rate limiting values (5/15min, 100/min)
- Understand Socket.io vs REST differences
- Explain in-memory vs PostgreSQL choice
- Discuss scalability considerations

---

## Contributing

This is an FYP project. For improvements:

1. Review code in `server.js`
2. Check `TESTING.md` for test coverage
3. Follow existing patterns (middleware, error handling)
4. Test thoroughly before committing

### Future Enhancements

- Redis for session management and OTP storage
- SMS integration for OTP delivery
- Push notifications
- Payment gateway integration
- Advanced analytics dashboard
- Automated testing suite (Jest/Mocha)
- Database query optimization
- Caching layer for frequently accessed data

---

## License

ISC License - See LICENSE file for details.

---

## Contact

For questions or issues:

- Review documentation files
- Check `TESTING.md` for examples
- Consult `SETUP_GUIDE.md` for troubleshooting

---

**Made with ❤️ for Women's Safety**

---
