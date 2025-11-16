# SafeRide Women - Setup & Troubleshooting Guide

Complete setup instructions and troubleshooting guide for the SafeRide Women backend server.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Running the Server](#running-the-server)
- [Mobile App Connection](#mobile-app-connection)
- [Platform-Specific Commands](#platform-specific-commands)
- [Troubleshooting](#troubleshooting)
- [Defense Day Checklist](#defense-day-checklist)

---

## Prerequisites

### Required Software

1. **Node.js** (v16 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`
   - Verify npm: `npm --version`

2. **npm** (v7 or higher, included with Node.js)
   - Verify: `npm --version`

3. **PostgreSQL** (v12 or higher)
   - Download from: https://www.postgresql.org/download/
   - Verify: `psql --version`
   - See [Database Setup](#database-setup) section below

4. **Git** (for cloning repository)
   - Download from: https://git-scm.com/
   - Verify: `git --version`

### Recommended Tools

- **VS Code** - Text editor with Node.js support
- **Postman** or **Thunder Client** - API testing
- **Terminal/PowerShell** - Command line interface

---

## Installation

### Step 1: Clone or Navigate to Project

**If cloning from repository:**
```bash
git clone <repository-url>
cd SafeRide-Backend
```

**If using existing project:**
```bash
cd SafeRide-Backend
# or on Windows:
cd C:\SafeRide-Backend
```

### Step 2: Install Dependencies

```bash
npm install
```

**Expected Output:**
```
npm WARN deprecated ...
added 150 packages in 30s
```

**Verification:**
- Check `node_modules` folder exists
- Verify `package.json` dependencies are installed

### Step 3: Database Setup

**PostgreSQL Installation:**

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**macOS (Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
Download and install from https://www.postgresql.org/download/windows/

**Create Database:**
```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Create database
CREATE DATABASE saferide;

# Exit
\q
```

**Run Schema Setup:**
```bash
npm run db:setup
```

This will:
- Create all required tables
- Set up indexes
- Load seed data (optional)

### Step 4: Configure Environment

Copy the example environment file:
```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# Windows (CMD)
copy .env.example .env

# macOS/Linux
cp .env.example .env
```

Edit `.env` file with your configuration (see [Environment Configuration](#environment-configuration)).

---

## Environment Configuration

### Environment Variables

Create `.env` file in the project root with the following variables:

```env
# Server Configuration
PORT=4000
NODE_ENV=development

# Authentication
JWT_SECRET=your-secret-key-change-in-production-2024
ACCESS_TOKEN_EXPIRY=30m
REFRESH_TOKEN_EXPIRY_DAYS=7
OTP_EXPIRY=300

# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/saferide
# Or use individual parameters:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=saferide
# DB_USER=postgres
# DB_PASSWORD=password
# DB_SSL=false

# Note: If your password contains special characters (e.g., @, #, $, %, &, etc.),
# you must URL-encode them in DATABASE_URL. For example:
# - Password "p@ssw0rd" becomes "p%40ssw0rd" (@ = %40)
# - Password "my#pass" becomes "my%23pass" (# = %23)
# - Password "p$ss" becomes "p%24ss" ($ = %24)
# Common encodings: @=%40, #=%23, $=%24, %=%25, &=%26, +=%2B, /=%2F, :=%3A, ?=%3F, ==%3D
# Alternatively, use individual DB_* variables instead of DATABASE_URL to avoid encoding issues.

# Security
CORS_ORIGIN=*

# Error Tracking (Optional)
SENTRY_DSN=
SENTRY_RELEASE=saferide-backend@1.0.0

# Socket.io (Optional)
SOCKET_TRANSPORTS=websocket,polling
```

### Variable Descriptions

**PORT**
- Default: `4000`
- Server listening port
- Change if port 4000 is in use

**NODE_ENV**
- Options: `development`, `production`
- `development`: Shows OTP in API responses, verbose logging
- `production`: Hides OTP, stricter CORS, error logging only

**JWT_SECRET**
- Required: Yes
- JWT token signing key
- **IMPORTANT:** Change in production!
- Use strong random string (32+ characters)

**ACCESS_TOKEN_EXPIRY**
- Default: `30m`
- Access token expiration time
- Format: `1h`, `30m`, `15m`
- Recommended: 15-30 minutes for security

**REFRESH_TOKEN_EXPIRY_DAYS**
- Default: `7`
- Refresh token expiration in days
- Recommended: 7-30 days

**OTP_EXPIRY**
- Default: `300` (5 minutes)
- OTP expiration in seconds

**CORS_ORIGIN**
- Development: `*` (allows all origins)
- Production: Comma-separated list of allowed origins
  - Example: `http://localhost:3000,https://yourdomain.com`

**DATABASE_URL**
- Required: Yes
- PostgreSQL connection string
- Format: `postgresql://user:password@host:port/database`
- **Important:** If your password contains special characters, you must URL-encode them:
  - `@` becomes `%40`
  - `#` becomes `%23`
  - `$` becomes `%24`
  - `%` becomes `%25`
  - `&` becomes `%26`
  - `+` becomes `%2B`
  - `/` becomes `%2F`
  - `:` becomes `%3A`
  - `?` becomes `%3F`
  - `=` becomes `%3D`
- Example: If password is `p@ss#w0rd`, use `postgresql://user:p%40ss%23w0rd@host:port/database`
- Alternative: Use individual DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD parameters to avoid encoding issues

**DB_SSL**
- Default: `false` (development)
- Enable SSL for database connections
- Set to `true` in production with SSL-enabled databases

**SENTRY_DSN**
- Optional but recommended
- Sentry error tracking DSN
- Get from https://sentry.io

**SENTRY_RELEASE**
- Optional
- Release version for Sentry tracking

**SOCKET_TRANSPORTS**
- Default: `websocket,polling`
- Socket.io transport methods
- Options: `websocket`, `polling`

### Security Notes

⚠️ **Never commit `.env` to version control!**

- `.env` should be in `.gitignore`
- Use `.env.example` as template
- Use different secrets for development/production
- Rotate secrets periodically

---

## Running the Server

### Development Mode

```bash
npm start
```

**Expected Output:**
```
╔═══════════════════════════════════════════════════════════╗
║           SAFERIDE WOMEN BACKEND SERVER                   ║
╚═══════════════════════════════════════════════════════════╝

✓ Server running on: http://localhost:4000
✓ Socket.io ready for connections
✓ Environment: development

📡 API Endpoints:
   ...
```

### Verify Server is Running

**Option 1: Health Check**
```bash
curl http://localhost:4000/api/health
```

**Option 2: Browser**
Open: `http://localhost:4000/api/health`

**Expected Response:**
```json
{
  "status": "OK",
  "message": "SafeRide Women Backend is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

### Stop Server

Press `Ctrl + C` in the terminal.

---

## Mobile App Connection

### Step 1: Find Your Computer's IP Address

**Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" under your active network adapter.
Example: `192.168.0.108`

**macOS:**
```bash
ifconfig | grep "inet "
```
Look for `inet` under `en0` or `wlan0`.
Example: `192.168.0.108`

**Linux:**
```bash
hostname -I
```
or
```bash
ip addr show | grep "inet "
```

### Step 2: Configure Mobile App

Edit the mobile app configuration file (typically `App.js` or `config.js`):

```javascript
// Development
const API_URL = 'http://192.168.0.108:4000/api';
const SOCKET_URL = 'http://192.168.0.108:4000';

// Replace 192.168.0.108 with your computer's IP address
```

### Step 3: Verify Network Connectivity

**Requirements:**
- ✅ Mobile device and computer on **same WiFi network**
- ✅ Firewall allows port 4000
- ✅ VPN disabled (if causing issues)
- ✅ Backend server running

**Test Connection:**
```bash
# From mobile device browser or app
http://192.168.0.108:4000/api/health
```

### Step 4: Firewall Configuration

**Windows Firewall:**
1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. TCP, Port 4000 → Next
6. Allow connection → Next
7. Apply to all profiles → Next
8. Name: "SafeRide Backend" → Finish

**macOS Firewall:**
1. System Preferences → Security & Privacy → Firewall
2. Click "Firewall Options"
3. Add Node.js to allowed applications
4. Or disable firewall temporarily for testing

**Linux (ufw):**
```bash
sudo ufw allow 4000/tcp
```

### Step 5: Start Mobile App

```bash
cd SafeRide-Mobile
npx expo start
```

Scan QR code with Expo Go app on your mobile device.

---

## Platform-Specific Commands

### Windows

**PowerShell:**
```powershell
# Navigate to project
cd C:\SafeRide-Backend

# Install dependencies
npm install

# Copy environment file
Copy-Item .env.example .env

# Start server
npm start

# Check if port is in use
netstat -ano | findstr :4000

# Kill process on port (replace PID)
taskkill /PID <PID> /F
```

**CMD:**
```cmd
cd C:\SafeRide-Backend
npm install
copy .env.example .env
npm start
```

### macOS / Linux

```bash
# Navigate to project
cd ~/SafeRide-Backend
# or
cd /path/to/SafeRide-Backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start server
npm start

# Check if port is in use
lsof -i :4000

# Kill process on port
kill -9 <PID>
```

---

## Troubleshooting

### Issue: Server Won't Start

**Error:** `EADDRINUSE: address already in use :::4000`

**Solution 1: Change Port**
Edit `.env`:
```env
PORT=4001
```

**Solution 2: Kill Process**
Windows:
```cmd
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

macOS/Linux:
```bash
lsof -i :4000
kill -9 <PID>
```

**Solution 3: Find and Kill Node Process**
Windows:
```cmd
taskkill /F /IM node.exe
```

macOS/Linux:
```bash
pkill node
```

---

### Issue: Dependencies Installation Failed

**Error:** `npm ERR!` messages

**Solutions:**
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Delete `node_modules` and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
   Windows:
   ```cmd
   rmdir /s node_modules
   del package-lock.json
   npm install
   ```

3. Update npm:
   ```bash
   npm install -g npm@latest
   ```

4. Check Node.js version (requires 16+):
   ```bash
   node --version
   ```

---

### Issue: OTP Not Shown in Response

**Problem:** OTP not visible in API response

**Solution:**
1. Verify `NODE_ENV=development` in `.env`
2. Check server console logs (OTP printed there)
3. Ensure not in production mode

**Check:**
```bash
# Request OTP
curl -X POST http://localhost:4000/api/auth/otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+923001111111"}'

# Check server console for OTP
```

---

### Issue: JWT Token Invalid

**Error:** `403 Invalid or expired token`

**Solutions:**
1. Verify token format:
   ```
   Authorization: Bearer <token>
   ```
   (Space between "Bearer" and token)

2. Check token expiration (7 days default)

3. Verify `JWT_SECRET` matches between requests

4. Request new token:
   ```bash
   # Get new OTP
   curl -X POST http://localhost:4000/api/auth/otp \
     -H "Content-Type: application/json" \
     -d '{"phone":"+923001111111"}'
   
   # Verify and get new token
   curl -X POST http://localhost:4000/api/auth/verify \
     -H "Content-Type: application/json" \
     -d '{"phone":"+923001111111","otp":"123456"}'
   ```

---

### Issue: Mobile App Can't Connect

**Problem:** Connection timeout or refused

**Checklist:**
1. ✅ Backend server running
2. ✅ Correct IP address in mobile app config
3. ✅ Same WiFi network
4. ✅ Firewall allows port 4000
5. ✅ VPN disabled
6. ✅ Test with health endpoint from mobile browser

**Test from Mobile Device:**
```
http://<your-ip>:4000/api/health
```

**Debug Steps:**
1. Check server logs for connection attempts
2. Verify CORS settings in `.env`
3. Try `CORS_ORIGIN=*` for development
4. Check router/network settings

---

### Issue: Socket.io Connection Fails

**Error:** `WebSocket connection failed`

**Solutions:**
1. Verify server running and Socket.io initialized
2. Check CORS configuration
3. Use both transports:
   ```env
   SOCKET_TRANSPORTS=websocket,polling
   ```
4. Check firewall allows WebSocket connections
5. Verify client connects after authentication

**Test Socket.io:**
```javascript
// Client-side test
const socket = io('http://localhost:4000', {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('Connected!');
  socket.emit('authenticate', { token: 'your-token' });
});
```

---

### Issue: Rate Limiting Too Aggressive

**Error:** `429 Too Many Requests`

**Auth Endpoints:**
- Limit: 5 requests per 15 minutes
- Wait 15 minutes for reset

**General API:**
- Limit: 100 requests per minute
- Wait 1 minute for reset

**Solution:**
- Wait for rate limit window to reset
- Adjust limits in `server.js` (lines 146-161) if needed for development

---

### Issue: Database Connection Failed

**Error:** `Database connection failed` or `Connection refused`

**Solutions:**
1. **Verify PostgreSQL is running:**
   ```bash
   # Ubuntu/Debian
   sudo systemctl status postgresql
   
   # macOS
   brew services list | grep postgresql
   ```

2. **Check DATABASE_URL:**
   - Verify connection string format
   - Test connection: `psql $DATABASE_URL`

3. **Check database exists:**
   ```bash
   psql -U postgres -l | grep saferide
   ```

4. **Verify credentials:**
   - Check DB_USER and DB_PASSWORD
   - Test login: `psql -U postgres -d saferide`

5. **Check firewall/network:**
   - Ensure PostgreSQL port (5432) is accessible
   - For remote databases, check security groups

### Issue: Database Schema Not Found

**Error:** `relation "users" does not exist`

**Solution:**
```bash
# Run database setup
npm run db:setup

# Or manually:
psql -U postgres -d saferide -f db/schema.sql
```

### Issue: Test Database Setup

**Problem:** Tests failing due to missing or incorrect test database

**Solution:**
```bash
# Create test database
psql -U postgres -c 'CREATE DATABASE saferide_test;'

# Run test database setup
npm run test:db:setup

# Or reset test database completely
npm run test:db:reset
```

**Note:** The test database uses `saferide_test` by default. You can configure it using:
- Test-specific `DATABASE_URL` in `.env.test` file, or
- Individual `DB_NAME=saferide_test` in `.env.test` or `.env` file

The `db:setup` and `test:db:setup` scripts automatically use `DATABASE_URL` if available, or fall back to individual environment variables. Ensure `DATABASE_URL` is available to these scripts by setting it in your `.env` file.

### Issue: Sentry Not Working

**Problem:** Errors not appearing in Sentry

**Solutions:**
1. Verify `SENTRY_DSN` is set in `.env`
2. Check Sentry dashboard for project configuration
3. Verify network access to Sentry (check firewall)
4. Check server logs for Sentry initialization messages

---

### Issue: Driver Verification Not Working

**Error:** `Driver verification required`

**Solution:**
1. Ensure driver is registered:
   ```bash
   POST /api/drivers/register
   ```

2. Admin must verify driver:
   ```bash
   POST /api/admin/drivers/:id/verify
   {
     "status": "verified"
   }
   ```

3. Check driver status:
   ```bash
   GET /api/me
   # Check driver record verificationStatus
   ```

---

### Issue: CORS Errors

**Error:** `CORS policy: No 'Access-Control-Allow-Origin' header`

**Solutions:**
1. Check `.env` CORS_ORIGIN setting:
   ```env
   CORS_ORIGIN=*
   ```

2. For production, specify origins:
   ```env
   CORS_ORIGIN=http://localhost:3000,https://yourdomain.com
   ```

3. Restart server after changing `.env`

---

## Defense Day Checklist

### Pre-Defense Preparation (30 minutes before)

#### 1. Server Setup
- [ ] Start backend server: `npm start`
- [ ] Verify health check: `curl http://localhost:4000/api/health`
- [ ] Check server logs for errors
- [ ] Verify all endpoints accessible

#### 2. Test Accounts
- [ ] Admin account accessible (`+923001234567`)
- [ ] Passenger account accessible (`+923001111111`)
- [ ] Driver account accessible (`+923002222222`)
- [ ] All accounts can login (OTP verification works)

#### 3. Mobile App Connection
- [ ] Mobile app configured with correct IP
- [ ] Mobile app connects to backend
- [ ] Socket.io connection works
- [ ] Test login from mobile app

#### 4. API Testing Tools
- [ ] Postman/Thunder Client installed
- [ ] Import API collection (if available)
- [ ] Test key endpoints prepared
- [ ] Sample requests ready

#### 5. Demo Flow Preparation
- [ ] Trip creation request ready
- [ ] Offer creation request ready
- [ ] Trip acceptance request ready
- [ ] Chat message examples ready
- [ ] SOS alert request ready

### During Defense (10-15 minutes)

#### Demonstration Flow

**1. System Overview (2 min)**
- [ ] Show server startup
- [ ] Display health check
- [ ] Explain architecture (REST + Socket.io)
- [ ] Highlight key features

**2. Authentication (2 min)**
- [ ] Request OTP for passenger
- [ ] Show OTP in response (development mode)
- [ ] Verify OTP and get token
- [ ] Explain JWT security

**3. Trip Lifecycle (4 min)**
- [ ] Passenger creates trip
- [ ] Show Socket.io notification to driver
- [ ] Driver makes offer
- [ ] Passenger receives offer notification
- [ ] Passenger accepts offer
- [ ] Driver starts trip
- [ ] Driver completes trip
- [ ] Passenger rates driver

**4. Safety Features (3 min)**
- [ ] Demonstrate trip sharing
- [ ] Trigger SOS alert
- [ ] Show admin monitoring
- [ ] Display flagged messages

**5. Real-Time Features (2 min)**
- [ ] Send chat message
- [ ] Show real-time delivery
- [ ] Demonstrate call signaling
- [ ] Show location updates

**6. Admin Panel (2 min)**
- [ ] Display system statistics
- [ ] Show all trips
- [ ] Monitor messages
- [ ] Review SOS events

### Post-Defense Cleanup

- [ ] Stop server
- [ ] Document any issues encountered
- [ ] Save demonstration notes

---

## Quick Reference

### Common Commands

```bash
# Start server
npm start

# Health check
curl http://localhost:4000/api/health

# Request OTP
curl -X POST http://localhost:4000/api/auth/otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+923001111111"}'

# Verify OTP (replace OTP value)
curl -X POST http://localhost:4000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+923001111111","otp":"123456"}'
```

### Test Accounts

- **Admin:** `+923001234567`
- **Passenger:** `+923001111111`
- **Driver:** `+923002222222`

### Important Ports

- Backend API: `4000`
- Socket.io: `4000` (same port)

### File Locations

- Server: `server.js`
- Configuration: `.env`
- Dependencies: `package.json`

---

## Additional Resources

- **API Reference:** See `API_REFERENCE.md`
- **Architecture:** See `ARCHITECTURE.md`
- **Deployment:** See `DEPLOYMENT.md`
- **Testing:** See `TESTING.md`
- **Main Documentation:** See `README.md`

---

## Support

For issues not covered in this guide:

1. Check server console logs
2. Review `README.md` troubleshooting section
3. Check `API_REFERENCE.md` for endpoint details
4. Verify environment configuration
5. Test with sample accounts

---

**Last Updated:** January 2024  
**Guide Version:** 1.0.0

