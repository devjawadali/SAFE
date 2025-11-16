# SafeRide Backend - Testing Guide

## Shell Compatibility Note

This document provides command examples for multiple operating systems. Each command block is labeled with the shell it targets:
- **Bash (macOS/Linux)**: Standard Unix shells
- **PowerShell (Windows)**: Modern Windows shell (Windows 10+)
- **CMD (Windows)**: Classic Windows Command Prompt

When testing on Windows, use PowerShell or CMD examples as appropriate. For macOS/Linux, use the Bash examples.

**Windows Users Note**: 
- **PowerShell is recommended** for complex JSON operations and loops, as it has better variable handling and native JSON support.
- **CMD** commands are provided for compatibility but may require delayed expansion (`setlocal enabledelayedexpansion`) for complex loops with variables. Single-line CMD commands work best.

---

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Authentication Flow](#authentication-flow)
3. [Rate Limiting Tests](#rate-limiting-tests)
4. [Trip Lifecycle](#trip-lifecycle)
5. [Chat Testing](#chat-testing)
6. [Socket.io Real-Time Event Testing](#socketio-real-time-event-testing)
7. [Voice Call Testing](#voice-call-testing)
8. [Women Safety Features](#women-safety-features)
9. [Admin Endpoints](#admin-endpoints)
10. [Security Tests](#security-tests)
11. [Additional Endpoints](#additional-endpoints)
12. [API Endpoint Testing Checklist](#api-endpoint-testing-checklist)

---

## Environment Setup

### Setting API Base URL

**Bash (macOS/Linux)**
```bash
export API_BASE="http://localhost:4000"
```

**PowerShell (Windows)**
```powershell
$env:API_BASE = "http://localhost:4000"
```

**CMD (Windows)**
```cmd
set API_BASE=http://localhost:4000
```

### Setting Authentication Token

**Bash (macOS/Linux)**
```bash
export TOKEN="your_jwt_token_here"
```

**PowerShell (Windows)**
```powershell
$env:TOKEN = "your_jwt_token_here"
```

**CMD (Windows)**
```cmd
set TOKEN=your_jwt_token_here
```

### Setting Multiple Variables

**Bash (macOS/Linux)**
```bash
export API_BASE="http://localhost:4000"
export PHONE="+1234567890"
export OTP="123456"
```

**PowerShell (Windows)**
```powershell
$env:API_BASE = "http://localhost:4000"
$env:PHONE = "+1234567890"
$env:OTP = "123456"
```

**CMD (Windows)**
```cmd
set API_BASE=http://localhost:4000
set PHONE=+1234567890
set OTP=123456
```

---

## Authentication Flow

### Obtaining Tokens for Each Role

Before testing other endpoints, you need to obtain authentication tokens for each role (admin, driver, passenger). Follow these steps for each role:

#### Get Admin Token

**Bash (macOS/Linux)**
```bash
# Step 1: Request OTP for admin
curl -X POST "$API_BASE/api/auth/otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"+923001234567\"}"

# Step 2: Extract OTP from response (in development mode) and verify
# Replace 123456 with the actual OTP from step 1
export ADMIN_OTP="123456"
export ADMIN_PHONE="+923001234567"

curl -X POST "$API_BASE/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$ADMIN_PHONE\", \"otp\": \"$ADMIN_OTP\", \"name\": \"Admin User\", \"role\": \"admin\"}"

# Step 3: Extract token from response and export it
export ADMIN_TOKEN="your_admin_token_here"
```

**PowerShell (Windows)**
```powershell
# Step 1: Request OTP for admin
curl.exe -X POST "$env:API_BASE/api/auth/otp" `
  -H "Content-Type: application/json" `
  -d '{"phone": "+923001234567"}'

# Step 2: Extract OTP from response and verify
$env:ADMIN_OTP = "123456"
$env:ADMIN_PHONE = "+923001234567"

$adminVerifyBody = @{
    phone = $env:ADMIN_PHONE
    otp = $env:ADMIN_OTP
    name = "Admin User"
    role = "admin"
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/auth/verify" `
  -H "Content-Type: application/json" `
  -d $adminVerifyBody

# Step 3: Extract token from response and set it
$env:ADMIN_TOKEN = "your_admin_token_here"
```

#### Get Driver Token

**Bash (macOS/Linux)**
```bash
# Step 1: Request OTP for driver
curl -X POST "$API_BASE/api/auth/otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"+923002222222\"}"

# Step 2: Verify OTP (replace with actual OTP)
export DRIVER_OTP="123456"
export DRIVER_PHONE="+923002222222"

curl -X POST "$API_BASE/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$DRIVER_PHONE\", \"otp\": \"$DRIVER_OTP\", \"name\": \"Test Driver\", \"role\": \"driver\"}"

# Step 3: Export driver token
export DRIVER_TOKEN="your_driver_token_here"
```

**PowerShell (Windows)**
```powershell
# Step 1: Request OTP for driver
curl.exe -X POST "$env:API_BASE/api/auth/otp" `
  -H "Content-Type: application/json" `
  -d '{"phone": "+923002222222"}'

# Step 2: Verify OTP
$env:DRIVER_OTP = "123456"
$env:DRIVER_PHONE = "+923002222222"

$driverVerifyBody = @{
    phone = $env:DRIVER_PHONE
    otp = $env:DRIVER_OTP
    name = "Test Driver"
    role = "driver"
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/auth/verify" `
  -H "Content-Type: application/json" `
  -d $driverVerifyBody

# Step 3: Set driver token
$env:DRIVER_TOKEN = "your_driver_token_here"
```

#### Get Passenger Token

**Bash (macOS/Linux)**
```bash
# Step 1: Request OTP for passenger
curl -X POST "$API_BASE/api/auth/otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"+923001111111\"}"

# Step 2: Verify OTP (replace with actual OTP)
export PASSENGER_OTP="123456"
export PASSENGER_PHONE="+923001111111"

curl -X POST "$API_BASE/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$PASSENGER_PHONE\", \"otp\": \"$PASSENGER_OTP\", \"name\": \"Test Passenger\", \"role\": \"passenger\"}"

# Step 3: Export passenger token
export PASSENGER_TOKEN="your_passenger_token_here"
```

**PowerShell (Windows)**
```powershell
# Step 1: Request OTP for passenger
curl.exe -X POST "$env:API_BASE/api/auth/otp" `
  -H "Content-Type: application/json" `
  -d '{"phone": "+923001111111"}'

# Step 2: Verify OTP
$env:PASSENGER_OTP = "123456"
$env:PASSENGER_PHONE = "+923001111111"

$passengerVerifyBody = @{
    phone = $env:PASSENGER_PHONE
    otp = $env:PASSENGER_OTP
    name = "Test Passenger"
    role = "passenger"
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/auth/verify" `
  -H "Content-Type: application/json" `
  -d $passengerVerifyBody

# Step 3: Set passenger token
$env:PASSENGER_TOKEN = "your_passenger_token_here"
```

**Expected Response (200 OK)**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 2,
    "phone": "+923001111111",
    "name": "Test Passenger",
    "role": "passenger",
    "verified": true,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "emergencyContact": null,
    "trustedContacts": []
  }
}
```

**Note**: In development mode, the OTP is returned in the response. Extract it and use it in the verify step. The token variable names (`$ADMIN_TOKEN`, `$DRIVER_TOKEN`, `$PASSENGER_TOKEN`) should be used consistently in subsequent examples for the appropriate role.

### Get Current User Profile

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/me" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/me" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN"
```

**CMD (Windows)**
```cmd
curl -X GET "%API_BASE%/api/me" -H "Authorization: Bearer %PASSENGER_TOKEN%"
```

**Expected Response (200 OK)**
```json
{
  "id": 2,
  "phone": "+923001111111",
  "name": "Test Passenger",
  "role": "passenger",
  "verified": true,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "emergencyContact": null,
  "trustedContacts": []
}
```

---

## Rate Limiting Tests

### Testing Authentication Rate Limiting (5 requests per 15 minutes)

**Bash (macOS/Linux)**
```bash
for i in {1..6}; do
  echo "Request $i:"
  curl -X POST "$API_BASE/api/auth/otp" \
    -H "Content-Type: application/json" \
    -d "{\"phone\": \"+1234567890\"}" \
    -w "\nHTTP Status: %{http_code}\n\n"
  sleep 1
done
```

**PowerShell (Windows)**
```powershell
for ($i=1; $i -le 6; $i++) {
  Write-Host "Request $i:"
  curl.exe -X POST "$env:API_BASE/api/auth/otp" `
    -H "Content-Type: application/json" `
    -d '{\"phone\": \"+1234567890\"}' `
    -w "`nHTTP Status: %{http_code}`n`n"
  Start-Sleep -Seconds 1
}
```

**CMD (Windows)**
```cmd
for /L %i in (1,1,6) do @(echo Request %i: & curl -X POST "%API_BASE%/api/auth/otp" -H "Content-Type: application/json" -d "{\"phone\": \"+1234567890\"}" -w "\nHTTP Status: %{http_code}\n\n" & timeout /t 1 /nobreak >nul)
```

### Testing General API Rate Limiting (100 requests per minute)

**Bash (macOS/Linux)**
```bash
for i in {1..105}; do
  curl -X GET "$API_BASE/api/health" \
    -H "Authorization: Bearer $PASSENGER_TOKEN" \
    -w "\nHTTP Status: %{http_code}\n" \
    -o /dev/null -s
  if [ $((i % 10)) -eq 0 ]; then
    echo "Completed $i requests"
  fi
done
```

**PowerShell (Windows)**
```powershell
for ($i=1; $i -le 105; $i++) {
  curl.exe -X GET "$env:API_BASE/api/health" `
    -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
    -w "`nHTTP Status: %{http_code}`n" `
    -o $null -s
  if ($i % 10 -eq 0) {
    Write-Host "Completed $i requests"
  }
}
```

**CMD (Windows)**
```cmd
for /L %i in (1,1,105) do @(curl -X GET "%API_BASE%/api/health" -H "Authorization: Bearer %PASSENGER_TOKEN%" -w "\nHTTP Status: %{http_code}\n" -o nul -s & set /a mod=%i%%10 & if !mod!==0 echo Completed %i requests)
```

**Note**: For CMD loops with variable expansion, you may need to enable delayed expansion: `setlocal enabledelayedexpansion` before running the loop. Alternatively, use single-line format or run in PowerShell for better variable handling.

---

## Trip Lifecycle

### 1. Create a Trip Request

**Bash (macOS/Linux)**
```bash
curl -X POST "$API_BASE/api/trips" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_lat": 40.7128,
    "pickup_lng": -74.0060,
    "pickup_address": "123 Main St, New York, NY",
    "drop_lat": 40.7589,
    "drop_lng": -73.9851,
    "drop_address": "456 Park Ave, New York, NY",
    "proposed_price": 25.50
  }'
```

**PowerShell (Windows)**
```powershell
$body = @{
    pickup_lat = 40.7128
    pickup_lng = -74.0060
    pickup_address = "123 Main St, New York, NY"
    drop_lat = 40.7589
    drop_lng = -73.9851
    drop_address = "456 Park Ave, New York, NY"
    proposed_price = 25.50
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $body
```

**CMD (Windows)**
```cmd
curl -X POST "%API_BASE%/api/trips" -H "Authorization: Bearer %PASSENGER_TOKEN%" -H "Content-Type: application/json" -d "{\"pickup_lat\": 40.7128, \"pickup_lng\": -74.0060, \"pickup_address\": \"123 Main St, New York, NY\", \"drop_lat\": 40.7589, \"drop_lng\": -73.9851, \"drop_address\": \"456 Park Ave, New York, NY\", \"proposed_price\": 25.50}"
```

### 2. Get Trip Details

**Bash (macOS/Linux)**
```bash
export TRIP_ID=1
curl -X GET "$API_BASE/api/trips/$TRIP_ID" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**PowerShell (Windows)**
```powershell
$env:TRIP_ID = "1"
curl.exe -X GET "$env:API_BASE/api/trips/$env:TRIP_ID" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN"
```

**CMD (Windows)**
```cmd
set TRIP_ID=1
curl -X GET "%API_BASE%/api/trips/%TRIP_ID%" -H "Authorization: Bearer %TOKEN%"
```

### 3. Create Driver Offer

**Bash (macOS/Linux)**
```bash
curl -X POST "$API_BASE/api/trips/$TRIP_ID/offers" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"price_offer\": 28.00,
    \"eta_minutes\": 5
  }"
```

**PowerShell (Windows)**
```powershell
$offerBody = @{
    price_offer = 28.00
    eta_minutes = 5
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/offers" `
  -H "Authorization: Bearer $env:DRIVER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $offerBody
```

**CMD (Windows)**
```cmd
curl -X POST "%API_BASE%/api/trips/%TRIP_ID%/offers" -H "Authorization: Bearer %DRIVER_TOKEN%" -H "Content-Type: application/json" -d "{\"price_offer\": 28.00, \"eta_minutes\": 5}"
```

### 4. Accept an Offer

**Bash (macOS/Linux)**
```bash
export OFFER_ID=1
curl -X POST "$API_BASE/api/trips/$TRIP_ID/accept" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"offer_id\": $OFFER_ID}"
```

**PowerShell (Windows)**
```powershell
$env:OFFER_ID = "1"
$acceptBody = @{
    offer_id = [int]$env:OFFER_ID
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/accept" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $acceptBody
```

**CMD (Windows)**
```cmd
set OFFER_ID=1
curl -X POST "%API_BASE%/api/trips/%TRIP_ID%/accept" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"offer_id\": %OFFER_ID%}"
```

### 5. Start Trip

**Bash (macOS/Linux)**
```bash
curl -X POST "$API_BASE/api/trips/$TRIP_ID/start" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json"
```

**PowerShell (Windows)**
```powershell
curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/start" `
  -H "Authorization: Bearer $env:DRIVER_TOKEN" `
  -H "Content-Type: application/json"
```

**CMD (Windows)**
```cmd
curl -X POST "%API_BASE%/api/trips/%TRIP_ID%/start" -H "Authorization: Bearer %DRIVER_TOKEN%" -H "Content-Type: application/json"
```

### 6. Complete Trip

**Bash (macOS/Linux)**
```bash
curl -X POST "$API_BASE/api/trips/$TRIP_ID/complete" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json"
```

**PowerShell (Windows)**
```powershell
curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/complete" `
  -H "Authorization: Bearer $env:DRIVER_TOKEN" `
  -H "Content-Type: application/json"
```

**CMD (Windows)**
```cmd
curl -X POST "%API_BASE%/api/trips/%TRIP_ID%/complete" -H "Authorization: Bearer %DRIVER_TOKEN%" -H "Content-Type: application/json"
```

### 7. Cancel Trip

Trips can be cancelled by either the passenger or driver (except completed trips).

**Bash (macOS/Linux)**
```bash
# Cancel as passenger
curl -X POST "$API_BASE/api/trips/$TRIP_ID/cancel" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json"

# Cancel as driver
curl -X POST "$API_BASE/api/trips/$TRIP_ID/cancel" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json"
```

**PowerShell (Windows)**
```powershell
# Cancel as passenger
curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/cancel" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json"

# Cancel as driver
curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/cancel" `
  -H "Authorization: Bearer $env:DRIVER_TOKEN" `
  -H "Content-Type: application/json"
```

**Expected Response (200 OK)**
```json
{
  "id": 1,
  "passengerId": 2,
  "driverId": 3,
  "status": "cancelled",
  "cancelledAt": "2024-01-15T10:30:00.000Z",
  "cancelledBy": 2,
  ...
}
```

**Validation Points:**
- Status changes to `cancelled`
- `cancelledAt` timestamp is set
- `cancelledBy` field indicates who cancelled
- Active calls are ended automatically
- Chat is disabled for cancelled trips

### 8. Share Trip with Trusted Contact

Passengers can share their trip location with trusted contacts for safety.

**Bash (macOS/Linux)**
```bash
# Share trip (contact_id must be in passenger's trustedContacts)
curl -X POST "$API_BASE/api/trips/$TRIP_ID/share" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"contact_id\": 4}"
```

**PowerShell (Windows)**
```powershell
$shareBody = @{
    contact_id = 4
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/share" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $shareBody
```

**Expected Response (200 OK)**
```json
{
  "message": "Trip shared successfully",
  "trip": {
    "id": 1,
    "sharedWith": ["4"]
  }
}
```

**Socket.io Event**: The trusted contact receives a `trip_shared` event with trip details.

**Validation Points:**
- `sharedWith` array is updated
- Contact receives socket notification if online
- Only trusted contacts can be added

### 9. Unshare Trip

Remove a trusted contact from trip sharing.

**Bash (macOS/Linux)**
```bash
curl -X DELETE "$API_BASE/api/trips/$TRIP_ID/share/4" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X DELETE "$env:API_BASE/api/trips/$env:TRIP_ID/share/4" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN"
```

**Expected Response (200 OK)**
```json
{
  "message": "Contact removed from shared trip",
  "trip": {
    "id": 1,
    "sharedWith": []
  }
}
```

**Validation Points:**
- Contact is removed from `sharedWith` array
- Only passenger can unshare

### 10. List Offers for a Trip

View all pending offers for a specific trip.

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/trips/$TRIP_ID/offers" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/trips/$env:TRIP_ID/offers" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN"
```

**Expected Response (200 OK)**
```json
[
  {
    "id": 1,
    "tripId": 1,
    "driverId": 3,
    "driver_name": "Test Driver",
    "driver_phone": "+923002222222",
    "vehicle_make": "Toyota",
    "vehicle_model": "Corolla",
    "vehicle_plate": "ABC-123",
    "priceOffer": 28.00,
    "etaMinutes": 5,
    "rating": 4.8,
    "status": "pending",
    "createdAt": "2024-01-15T10:20:00.000Z"
  },
  {
    "id": 2,
    "tripId": 1,
    "driverId": 4,
    "driver_name": "Another Driver",
    "priceOffer": 27.50,
    "etaMinutes": 8,
    "status": "pending",
    "createdAt": "2024-01-15T10:21:00.000Z"
  }
]
```

**Validation Points:**
- Only shows pending offers
- Includes driver details and vehicle info
- Passenger, driver, or admin can view offers

### 11. List User Trips

Get all trips for the authenticated user with optional status filter.

**Bash (macOS/Linux)**
```bash
# Get all trips
curl -X GET "$API_BASE/api/trips" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"

# Get trips with specific status
curl -X GET "$API_BASE/api/trips?status=completed" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"

# Get active trips
curl -X GET "$API_BASE/api/trips?status=in_progress" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**PowerShell (Windows)**
```powershell
# Get all trips
curl.exe -X GET "$env:API_BASE/api/trips" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN"

# Get trips with specific status
curl.exe -X GET "$env:API_BASE/api/trips?status=completed" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN"
```

**Expected Response (200 OK)**
```json
[
  {
    "id": 1,
    "passengerId": 2,
    "driverId": 3,
    "passenger_name": "Test Passenger",
    "driver_name": "Test Driver",
    "pickupLat": 40.7128,
    "pickupLng": -74.0060,
    "pickupAddress": "123 Main St, New York, NY",
    "dropLat": 40.7589,
    "dropLng": -73.9851,
    "dropAddress": "456 Park Ave, New York, NY",
    "status": "completed",
    "proposedPrice": 25.50,
    "acceptedPrice": 28.00,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "startedAt": "2024-01-15T10:15:00.000Z",
    "completedAt": "2024-01-15T10:45:00.000Z",
    "sharedWith": [],
    "safetyCheckEnabled": true
  }
]
```

**Validation Points:**
- Returns trips where user is passenger or driver
- Sorted by creation date (newest first)
- Status filter works correctly
- Includes enriched data (passenger_name, driver_name)

### 12. Rate a Trip

**Bash (macOS/Linux)**
```bash
curl -X POST "$API_BASE/api/trips/$TRIP_ID/rate" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"rating\": 5,
    \"comment\": \"Great ride!\"
  }"
```

**PowerShell (Windows)**
```powershell
$ratingBody = @{
    rating = 5
    comment = "Great ride!"
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/rate" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $ratingBody
```

**Expected Response (200 OK)**
```json
{
  "message": "Rating submitted successfully",
  "rating": {
    "id": 1,
    "tripId": 1,
    "raterId": 2,
    "rateeId": 3,
    "rating": 5,
    "comment": "Great ride!",
    "createdAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**Validation Points:**
- Rating must be 1-5
- Only completed trips can be rated
- Driver rating is recalculated automatically
- Cannot rate the same trip twice

---

## Admin Endpoints

### Get All Trips (Admin)

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/admin/trips" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/admin/trips" `
  -H "Authorization: Bearer $env:ADMIN_TOKEN"
```

**CMD (Windows)**
```cmd
curl -X GET "%API_BASE%/api/admin/trips" -H "Authorization: Bearer %ADMIN_TOKEN%"
```

### Get Pending Driver Verifications

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/admin/drivers/pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/admin/drivers/pending" `
  -H "Authorization: Bearer $env:ADMIN_TOKEN"
```

**CMD (Windows)**
```cmd
curl -X GET "%API_BASE%/api/admin/drivers/pending" -H "Authorization: Bearer %ADMIN_TOKEN%"
```

### Verify a Driver

**Bash (macOS/Linux)**
```bash
export DRIVER_ID=1
curl -X POST "$API_BASE/api/admin/drivers/$DRIVER_ID/verify" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"verified"}'
```

**PowerShell (Windows)**
```powershell
$env:DRIVER_ID = "1"
$verifyBody = @{
    status = "verified"
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/admin/drivers/$env:DRIVER_ID/verify" `
  -H "Authorization: Bearer $env:ADMIN_TOKEN" `
  -H "Content-Type: application/json" `
  -d $verifyBody
```

**CMD (Windows)**
```cmd
set DRIVER_ID=1
curl -X POST "%API_BASE%/api/admin/drivers/%DRIVER_ID%/verify" -H "Authorization: Bearer %ADMIN_TOKEN%" -H "Content-Type: application/json" -d "{\"status\":\"verified\"}"
```

**Note**: Only `"verified"` and `"rejected"` are accepted values for the `status` field. Any other value will result in a 400 error.

**Expected Response (200 OK)**
```json
{
  "id": 3,
  "userId": 3,
  "licenseNumber": "DL123456",
  "vehicleMake": "Toyota",
  "vehicleModel": "Corolla",
  "vehiclePlate": "ABC-123",
  "vehicleYear": 2020,
  "verificationStatus": "verified",
  "rating": 5.0,
  "totalTrips": 0,
  "isOnline": false,
  "lastLocationLat": null,
  "lastLocationLng": null,
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

### Get Admin Statistics

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/admin/stats" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/admin/stats" `
  -H "Authorization: Bearer $env:ADMIN_TOKEN"
```

**CMD (Windows)**
```cmd
curl -X GET "%API_BASE%/api/admin/stats" -H "Authorization: Bearer %ADMIN_TOKEN%"
```

### Get All SOS Requests

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/sos" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/sos" `
  -H "Authorization: Bearer $env:ADMIN_TOKEN"
```

**CMD (Windows)**
```cmd
curl -X GET "%API_BASE%/api/sos" -H "Authorization: Bearer %ADMIN_TOKEN%"
```

---

## Security Tests

### Test Token Authentication

**Bash (macOS/Linux)**
```bash
# Test without token
curl -X GET "$API_BASE/api/me" -w "\nHTTP Status: %{http_code}\n"

# Test with invalid token
curl -X GET "$API_BASE/api/me" \
  -H "Authorization: Bearer invalid_token_here" \
  -w "\nHTTP Status: %{http_code}\n"

# Test with valid token
curl -X GET "$API_BASE/api/me" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n"
```

**PowerShell (Windows)**
```powershell
# Test without token
curl.exe -X GET "$env:API_BASE/api/me" -w "`nHTTP Status: %{http_code}`n"

# Test with invalid token
curl.exe -X GET "$env:API_BASE/api/me" `
  -H "Authorization: Bearer invalid_token_here" `
  -w "`nHTTP Status: %{http_code}`n"

# Test with valid token
curl.exe -X GET "$env:API_BASE/api/me" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -w "`nHTTP Status: %{http_code}`n"
```

**CMD (Windows)**
```cmd
REM Test without token
curl -X GET "%API_BASE%/api/me" -w "\nHTTP Status: %{http_code}\n"

REM Test with invalid token
curl -X GET "%API_BASE%/api/me" -H "Authorization: Bearer invalid_token_here" -w "\nHTTP Status: %{http_code}\n"

REM Test with valid token
curl -X GET "%API_BASE%/api/me" -H "Authorization: Bearer %TOKEN%" -w "\nHTTP Status: %{http_code}\n"
```

### Test Role-Based Authorization

**Bash (macOS/Linux)**
```bash
# Test passenger trying to access driver-only endpoint
curl -X POST "$API_BASE/api/drivers/register" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"

# Test driver accessing driver endpoint
curl -X POST "$API_BASE/api/drivers/register" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"

# Test non-admin accessing admin endpoint
curl -X GET "$API_BASE/api/admin/trips" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -w "\nHTTP Status: %{http_code}\n"
```

**PowerShell (Windows)**
```powershell
# Test passenger trying to access driver-only endpoint
curl.exe -X POST "$env:API_BASE/api/drivers/register" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -w "`nHTTP Status: %{http_code}`n"

# Test driver accessing driver endpoint
curl.exe -X POST "$env:API_BASE/api/drivers/register" `
  -H "Authorization: Bearer $env:DRIVER_TOKEN" `
  -H "Content-Type: application/json" `
  -w "`nHTTP Status: %{http_code}`n"

# Test non-admin accessing admin endpoint
curl.exe -X GET "$env:API_BASE/api/admin/trips" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -w "`nHTTP Status: %{http_code}`n"
```

**CMD (Windows)**
```cmd
REM Test passenger trying to access driver-only endpoint
curl -X POST "%API_BASE%/api/drivers/register" -H "Authorization: Bearer %PASSENGER_TOKEN%" -H "Content-Type: application/json" -w "\nHTTP Status: %{http_code}\n"

REM Test driver accessing driver endpoint
curl -X POST "%API_BASE%/api/drivers/register" -H "Authorization: Bearer %DRIVER_TOKEN%" -H "Content-Type: application/json" -w "\nHTTP Status: %{http_code}\n"

REM Test non-admin accessing admin endpoint
curl -X GET "%API_BASE%/api/admin/trips" -H "Authorization: Bearer %PASSENGER_TOKEN%" -w "\nHTTP Status: %{http_code}\n"
```

### Test Input Validation

**Bash (macOS/Linux)**
```bash
# Test invalid OTP request (missing phone)
curl -X POST "$API_BASE/api/auth/otp" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n"

# Test invalid trip creation (missing required fields)
curl -X POST "$API_BASE/api/trips" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pickup_lat": 40.7128}' \
  -w "\nHTTP Status: %{http_code}\n"

# Test invalid coordinates
curl -X POST "$API_BASE/api/trips" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_lat": "invalid",
    "pickup_lng": -74.0060,
    "pickup_address": "123 Main St",
    "drop_lat": 40.7589,
    "drop_lng": -73.9851,
    "drop_address": "456 Park Ave",
    "proposed_price": 25.50
  }' \
  -w "\nHTTP Status: %{http_code}\n"
```

**PowerShell (Windows)**
```powershell
# Test invalid OTP request (missing phone)
curl.exe -X POST "$env:API_BASE/api/auth/otp" `
  -H "Content-Type: application/json" `
  -d '{}' `
  -w "`nHTTP Status: %{http_code}`n"

# Test invalid trip creation (missing required fields)
$invalidTripBody = @{
    pickup_lat = 40.7128
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $invalidTripBody `
  -w "`nHTTP Status: %{http_code}`n"

# Test invalid coordinates
$invalidCoordBody = @{
    pickup_lat = "invalid"
    pickup_lng = -74.0060
    pickup_address = "123 Main St"
    drop_lat = 40.7589
    drop_lng = -73.9851
    drop_address = "456 Park Ave"
    proposed_price = 25.50
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $invalidCoordBody `
  -w "`nHTTP Status: %{http_code}`n"
```

**CMD (Windows)**
```cmd
REM Test invalid OTP request (missing phone)
curl -X POST "%API_BASE%/api/auth/otp" -H "Content-Type: application/json" -d "{}" -w "\nHTTP Status: %{http_code}\n"

REM Test invalid trip creation (missing required fields)
curl -X POST "%API_BASE%/api/trips" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"pickup_lat\": 40.7128}" -w "\nHTTP Status: %{http_code}\n"

REM Test invalid coordinates
curl -X POST "%API_BASE%/api/trips" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"pickup_lat\": \"invalid\", \"pickup_lng\": -74.0060, \"pickup_address\": \"123 Main St\", \"drop_lat\": 40.7589, \"drop_lng\": -73.9851, \"drop_address\": \"456 Park Ave\", \"proposed_price\": 25.50}" -w "\nHTTP Status: %{http_code}\n"
```

---

## Additional Endpoints

### Send Trip Message

**Bash (macOS/Linux)**
```bash
curl -X POST "$API_BASE/api/trips/$TRIP_ID/messages" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"I'm on my way!\"
  }"
```

**PowerShell (Windows)**
```powershell
$messageBody = @{
    message = "I'm on my way!"
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/messages" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $messageBody
```

**CMD (Windows)**
```cmd
curl -X POST "%API_BASE%/api/trips/%TRIP_ID%/messages" -H "Authorization: Bearer %PASSENGER_TOKEN%" -H "Content-Type: application/json" -d "{\"message\": \"I'm on my way!\"}"
```

### Initiate Emergency SOS

**Bash (macOS/Linux)**
```bash
curl -X POST "$API_BASE/api/sos" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"trip_id\": $TRIP_ID,
    \"emergency_contact\": \"+923009999999\",
    \"message\": \"Need immediate help!\",
    \"location_lat\": 40.7128,
    \"location_lng\": -74.0060
  }"
```

**PowerShell (Windows)**
```powershell
$sosBody = @{
    trip_id = [int]$env:TRIP_ID
    emergency_contact = "+923009999999"
    message = "Need immediate help!"
    location_lat = 40.7128
    location_lng = -74.0060
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/sos" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $sosBody
```

**CMD (Windows)**
```cmd
curl -X POST "%API_BASE%/api/sos" -H "Authorization: Bearer %PASSENGER_TOKEN%" -H "Content-Type: application/json" -d "{\"trip_id\": %TRIP_ID%, \"emergency_contact\": \"+923009999999\", \"message\": \"Need immediate help!\", \"location_lat\": 40.7128, \"location_lng\": -74.0060}"
```

**Expected Response (201 Created)**
```json
{
  "message": "SOS alert sent successfully",
  "sos_id": 1,
  "emergency_services_notified": true
}
```

**Socket.io Event**
When an SOS request is sent, the server emits a `sos_alert` event to all connected clients. The event payload structure:

```json
{
  "sos_id": 1,
  "user_id": 2,
  "trip_id": 1,
  "message": "Need immediate help!",
  "location": {
    "lat": 40.7128,
    "lng": -74.0060
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

To verify the real-time broadcast, connect to Socket.io and listen for the `sos_alert` event (see Socket.io Real-Time Event Testing section).

### Health Check

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/health"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/health"
```

**CMD (Windows)**
```cmd
curl -X GET "%API_BASE%/api/health"
```

---

## Chat Testing

### Get Message History

Retrieve all messages for a trip (sorted chronologically).

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/trips/$TRIP_ID/messages" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/trips/$env:TRIP_ID/messages" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN"
```

**Expected Response (200 OK)**
```json
[
  {
    "message_id": 1,
    "trip_id": 1,
    "sender_id": 2,
    "sender_name": "Test Passenger",
    "recipient_id": 3,
    "recipient_name": "Test Driver",
    "message": "I'm on my way!",
    "timestamp": "2024-01-15T10:20:00.000Z",
    "read_at": null,
    "is_flagged": false
  },
  {
    "message_id": 2,
    "trip_id": 1,
    "sender_id": 3,
    "sender_name": "Test Driver",
    "recipient_id": 2,
    "recipient_name": "Test Passenger",
    "message": "Almost there!",
    "timestamp": "2024-01-15T10:25:00.000Z",
    "read_at": "2024-01-15T10:25:30.000Z",
    "is_flagged": false
  }
]
```

**Validation Points:**
- Messages are sorted by timestamp (oldest first)
- Includes sender/recipient names
- Shows read status and flagged status
- Only accessible by trip participants

### Send Message (with Profanity Filtering)

**Bash (macOS/Linux)**
```bash
# Send normal message
curl -X POST "$API_BASE/api/trips/$TRIP_ID/messages" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"I'm on my way!\"}"

# Send message with profanity (will be filtered)
curl -X POST "$API_BASE/api/trips/$TRIP_ID/messages" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"This is a bad word test\"}"
```

**PowerShell (Windows)**
```powershell
$messageBody = @{
    message = "I'm on my way!"
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/messages" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $messageBody
```

**Expected Response (201 Created)**
```json
{
  "message_id": 1,
  "trip_id": 1,
  "message": "I'm on my way!",
  "timestamp": "2024-01-15T10:20:00.000Z",
  "is_flagged": false
}
```

For profanity-filtered messages:
```json
{
  "message_id": 2,
  "trip_id": 1,
  "message": "This is a **** word test",
  "timestamp": "2024-01-15T10:21:00.000Z",
  "is_flagged": true
}
```

**Validation Points:**
- Profanity is automatically filtered (replaced with asterisks)
- `is_flagged` is set to `true` for filtered messages
- Socket.io `receive_message` event is emitted to trip room
- Message appears in history with filtered content

### Admin View Flagged Messages

Admins can retrieve flagged messages for moderation.

**Bash (macOS/Linux)**
```bash
# Get all flagged messages
curl -X GET "$API_BASE/api/admin/messages?flagged=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get flagged messages for specific trip
curl -X GET "$API_BASE/api/admin/messages?tripId=$TRIP_ID&flagged=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**PowerShell (Windows)**
```powershell
curl.exe -X GET "$env:API_BASE/api/admin/messages?flagged=true" `
  -H "Authorization: Bearer $env:ADMIN_TOKEN"
```

**Expected Response (200 OK)**
```json
[
  {
    "message_id": 2,
    "trip_id": 1,
    "sender_id": 2,
    "sender_name": "Test Passenger",
    "recipient_id": 3,
    "recipient_name": "Test Driver",
    "message": "This is a **** word test",
    "timestamp": "2024-01-15T10:21:00.000Z",
    "read_at": null,
    "is_flagged": true,
    "trip_status": "in_progress"
  }
]
```

**Validation Points:**
- Only flagged messages are returned
- Includes trip context
- Sorted by timestamp (newest first)

### Typing Indicators (Socket.io)

Use Socket.io to send and receive typing indicators.

**Node.js Client Example**
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:4000', {
  transports: ['websocket']
});

// Authenticate first
socket.emit('authenticate', { token: 'your_token_here' });

socket.on('authenticated', (data) => {
  console.log('Authenticated:', data);
  
  // Join trip room
  socket.emit('join_trip', { tripId: 1 });
  
  // Listen for typing indicators
  socket.on('user_typing', (data) => {
    console.log('User typing:', data);
    // Expected: { trip_id: 1, user_id: 2, is_typing: true }
  });
  
  // Send typing indicator
  socket.emit('typing_indicator', {
    tripId: 1,
    isTyping: true
  });
  
  // Stop typing
  setTimeout(() => {
    socket.emit('typing_indicator', {
      tripId: 1,
      isTyping: false
    });
  }, 3000);
});
```

**Validation Points:**
- `typing_indicator` event sent by typing user
- `user_typing` event received by other participant
- Only works for active trips (accepted/in_progress)
- Typing state can be toggled on/off

### Read Receipts (Socket.io)

Mark messages as read and receive read receipts.

**Node.js Client Example**
```javascript
// Listen for read receipts
socket.on('message_read_receipt', (data) => {
  console.log('Message read:', data);
  // Expected: { message_id: 1, trip_id: 1, read_at: "2024-01-15T10:25:30.000Z" }
});

// Mark message as read
socket.emit('message_read', {
  messageId: 1
});
```

**Validation Points:**
- `message_read` event marks message as read
- `message_read_receipt` event broadcasts to trip room
- `read_at` timestamp is set in database
- Only recipient can mark message as read

---

## Socket.io Real-Time Event Testing

This section provides a Node.js client for testing all Socket.io real-time events.

### Setup Node.js Test Client

Create a file `socket-test.js`:

```javascript
const io = require('socket.io-client');

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const TOKEN = process.env.TOKEN || 'your_token_here';

const socket = io(API_BASE, {
  transports: ['websocket', 'polling']
});

console.log('Connecting to', API_BASE);

socket.on('connect', () => {
  console.log('✓ Connected to server');
  
  // Step 1: Authenticate
  console.log('\n1. Authenticating...');
  socket.emit('authenticate', { token: TOKEN });
});

socket.on('authenticated', (data) => {
  console.log('✓ Authenticated:', data);
  
  // Step 2: Join trip room
  console.log('\n2. Joining trip room...');
  socket.emit('join_trip', { tripId: 1 });
});

socket.on('joined_trip', (data) => {
  console.log('✓ Joined trip:', data);
  
  // Step 3: Test driver online (if driver role)
  console.log('\n3. Testing driver_online...');
  socket.emit('driver_online', {});
});

socket.on('error', (data) => {
  console.error('✗ Error:', data);
});

socket.on('auth_error', (data) => {
  console.error('✗ Auth error:', data);
});

socket.on('join_error', (data) => {
  console.error('✗ Join error:', data);
});

// Step 4: Test location updates (if driver role)
socket.on('authenticated', () => {
  setTimeout(() => {
    console.log('\n4. Testing location_update...');
    socket.emit('location_update', {
      lat: 40.7128,
      lng: -74.0060
    });
  }, 2000);
});

socket.on('location_update', (data) => {
  console.log('✓ Location update received:', data);
  // Expected: { driverId: 3, lat: 40.7128, lng: -74.0060, timestamp: "..." }
});

// Step 5: Test new_trip event (for drivers)
socket.on('new_trip', (data) => {
  console.log('✓ New trip received:', data);
  // Expected: { trip_id: 1, pickup_lat: ..., pickup_lng: ..., proposed_price: ... }
});

// Step 6: Test new_offer event (for passengers)
socket.on('new_offer', (data) => {
  console.log('✓ New offer received:', data);
  // Expected: { offer_id: 1, driver_id: 3, driver_name: ..., price_offer: ..., eta_minutes: ... }
});

// Step 7: Test offer_accepted event (for drivers)
socket.on('offer_accepted', (data) => {
  console.log('✓ Offer accepted:', data);
  // Expected: { trip_id: 1, offer_id: 1 }
});

// Step 8: Test trip_started event
socket.on('trip_started', (data) => {
  console.log('✓ Trip started:', data);
  // Expected: { trip_id: 1, started_at: "..." }
});

// Step 9: Test trip_completed event
socket.on('trip_completed', (data) => {
  console.log('✓ Trip completed:', data);
  // Expected: { trip_id: 1, completed_at: "..." }
});

// Step 10: Test send_message and receive_message
socket.on('authenticated', () => {
  setTimeout(() => {
    console.log('\n5. Testing send_message...');
    socket.emit('send_message', {
      tripId: 1,
      message: 'Test message'
    });
  }, 3000);
});

socket.on('receive_message', (data) => {
  console.log('✓ Message received:', data);
  // Expected: { message_id: 1, trip_id: 1, sender_id: 2, message: "...", timestamp: "...", is_flagged: false }
});

socket.on('message_error', (data) => {
  console.error('✗ Message error:', data);
});

// Step 11: Test typing indicators
socket.on('user_typing', (data) => {
  console.log('✓ User typing:', data);
  // Expected: { trip_id: 1, user_id: 2, is_typing: true }
});

// Step 12: Test read receipts
socket.on('message_read_receipt', (data) => {
  console.log('✓ Message read receipt:', data);
  // Expected: { message_id: 1, trip_id: 1, read_at: "..." }
});

// Step 13: Test call events
socket.on('call_incoming', (data) => {
  console.log('✓ Call incoming:', data);
  // Expected: { call_id: 1, trip_id: 1, caller_id: 2, callee_id: 3, emergency_recording: false, initiated_at: "..." }
});

socket.on('call_offer', (data) => {
  console.log('✓ Call offer:', data);
  // Expected: { call_id: 1, trip_id: 1, from_user_id: 2, sdp: { type: "offer", sdp: "..." } }
});

socket.on('call_answer', (data) => {
  console.log('✓ Call answer:', data);
  // Expected: { call_id: 1, trip_id: 1, from_user_id: 3, sdp: { type: "answer", sdp: "..." } }
});

socket.on('call_connected', (data) => {
  console.log('✓ Call connected:', data);
  // Expected: { call_id: 1, trip_id: 1, connected_at: "..." }
});

socket.on('ice_candidate', (data) => {
  console.log('✓ ICE candidate:', data);
  // Expected: { call_id: 1, trip_id: 1, from_user_id: 2, candidate: {...} }
});

socket.on('call_ended', (data) => {
  console.log('✓ Call ended:', data);
  // Expected: { call_id: 1, trip_id: 1, ended_at: "...", duration: 120, reason: "completed" }
});

socket.on('call_error', (data) => {
  console.error('✗ Call error:', data);
});

// Step 14: Test SOS alert
socket.on('sos_alert', (data) => {
  console.log('🚨 SOS ALERT:', data);
  // Expected: { sos_id: 1, user_id: 2, trip_id: 1, message: "...", location: { lat: ..., lng: ... }, timestamp: "..." }
});

// Step 15: Test trip sharing
socket.on('trip_shared', (data) => {
  console.log('✓ Trip shared:', data);
  // Expected: { trip_id: 1, passenger_id: 2, passenger_name: "...", pickup_address: "...", drop_address: "...", status: "...", shared_at: "..." }
});

socket.on('disconnect', () => {
  console.log('\n✗ Disconnected from server');
});

// Run tests
console.log('Socket.io test client started. Events will be logged as they occur.');
```

**Run the test client:**
```bash
# Install socket.io-client if needed
npm install socket.io-client

# Run with token
TOKEN=$PASSENGER_TOKEN node socket-test.js

# Or for driver
TOKEN=$DRIVER_TOKEN node socket-test.js
```

**Expected Console Output:**
- Successful connection and authentication
- All emitted events are logged
- All received events show expected payload structures
- Errors are clearly displayed

---

## Voice Call Testing

### REST API Testing

#### 1. Initiate a Call

**Bash (macOS/Linux)**
```bash
# Regular call
curl -X POST "$API_BASE/api/trips/$TRIP_ID/call/initiate" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Emergency recording call
curl -X POST "$API_BASE/api/trips/$TRIP_ID/call/initiate" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"emergency_recording": true}'
```

**PowerShell (Windows)**
```powershell
$callBody = @{
    emergency_recording = $false
} | ConvertTo-Json

curl.exe -X POST "$env:API_BASE/api/trips/$env:TRIP_ID/call/initiate" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $callBody
```

**Expected Response (201 Created)**
```json
{
  "call_id": 1,
  "trip_id": 1,
  "caller_id": 2,
  "callee_id": 3,
  "status": "ringing",
  "emergency_recording": false,
  "initiated_at": "2024-01-15T10:30:00.000Z"
}
```

**Validation Points:**
- Call status starts as `ringing`
- `initiated_at` timestamp is set
- `emergency_recording` flag is preserved
- `call_incoming` event is emitted via Socket.io
- Cannot initiate concurrent calls (returns 400 error)

#### 2. Get Call Status

**Bash (macOS/Linux)**
```bash
curl -X GET "$API_BASE/api/trips/$TRIP_ID/call/status" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**Expected Response (200 OK)**
```json
{
  "call_id": 1,
  "trip_id": 1,
  "caller_id": 2,
  "caller_name": "Test Passenger",
  "callee_id": 3,
  "callee_name": "Test Driver",
  "status": "connected",
  "initiated_at": "2024-01-15T10:30:00.000Z",
  "connected_at": "2024-01-15T10:30:05.000Z",
  "ended_at": null,
  "duration": null,
  "emergency_recording": false,
  "end_reason": null
}
```

**Validation Points:**
- Status transitions: `ringing` → `connected` → `ended`
- Timestamps are updated at each transition
- Duration is calculated when call ends

#### 3. Prevent Concurrent Calls

**Bash (macOS/Linux)**
```bash
# First call
curl -X POST "$API_BASE/api/trips/$TRIP_ID/call/initiate" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Second call (should fail)
curl -X POST "$API_BASE/api/trips/$TRIP_ID/call/initiate" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response (400 Bad Request)**
```json
{
  "error": "Call already in progress"
}
```

**Validation Points:**
- Only one active call per trip
- Both REST and Socket.io enforce this

### Socket.io WebRTC Signaling Testing

End-to-end WebRTC signaling flow using Socket.io events.

**Node.js Client Example**
```javascript
const io = require('socket.io-client');

const callerSocket = io('http://localhost:4000');
const calleeSocket = io('http://localhost:4000');

// Authenticate both sockets
callerSocket.emit('authenticate', { token: PASSENGER_TOKEN });
calleeSocket.emit('authenticate', { token: DRIVER_TOKEN });

callerSocket.on('authenticated', () => {
  calleeSocket.on('authenticated', () => {
    // Step 1: Caller initiates call
    console.log('1. Initiating call...');
    callerSocket.emit('call_initiate', {
      tripId: 1,
      emergencyRecording: false
    });
  });
});

// Step 2: Callee receives call_incoming
calleeSocket.on('call_incoming', (data) => {
  console.log('2. Call incoming:', data);
  
  // Step 3: Create WebRTC offer (simulated)
  const offer = {
    type: 'offer',
    sdp: 'v=0\r\no=- 123456 123456 IN IP4 127.0.0.1\r\n...'
  };
  
  // Step 4: Caller sends offer
  setTimeout(() => {
    console.log('3. Sending offer...');
    callerSocket.emit('call_offer', {
      callId: data.call_id,
      sdp: offer
    });
  }, 1000);
});

// Step 5: Callee receives offer
calleeSocket.on('call_offer', (data) => {
  console.log('4. Received offer:', data);
  
  // Step 6: Create WebRTC answer (simulated)
  const answer = {
    type: 'answer',
    sdp: 'v=0\r\no=- 789012 789012 IN IP4 127.0.0.1\r\n...'
  };
  
  // Step 7: Callee sends answer
  setTimeout(() => {
    console.log('5. Sending answer...');
    calleeSocket.emit('call_answer', {
      callId: data.call_id,
      sdp: answer
    });
  }, 1000);
});

// Step 8: Caller receives answer
callerSocket.on('call_answer', (data) => {
  console.log('6. Received answer:', data);
});

// Step 9: Both receive call_connected
callerSocket.on('call_connected', (data) => {
  console.log('7. Call connected:', data);
  // Expected: { call_id: 1, trip_id: 1, connected_at: "..." }
});

calleeSocket.on('call_connected', (data) => {
  console.log('7. Call connected:', data);
});

// Step 10: Exchange ICE candidates
callerSocket.on('call_connected', () => {
  // Simulate ICE candidate
  const candidate = {
    candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
    sdpMLineIndex: 0,
    sdpMid: '0'
  };
  
  callerSocket.emit('ice_candidate', {
    callId: 1,
    candidate: candidate
  });
});

calleeSocket.on('ice_candidate', (data) => {
  console.log('8. ICE candidate received:', data);
  // Expected: { call_id: 1, trip_id: 1, from_user_id: 2, candidate: {...} }
});

// Step 11: End the call
setTimeout(() => {
  console.log('9. Ending call...');
  callerSocket.emit('call_end', {
    callId: 1,
    reason: 'completed'
  });
}, 10000);

// Step 12: Both receive call_ended
callerSocket.on('call_ended', (data) => {
  console.log('10. Call ended:', data);
  // Expected: { call_id: 1, trip_id: 1, ended_at: "...", duration: 10, reason: "completed" }
});

calleeSocket.on('call_ended', (data) => {
  console.log('10. Call ended:', data);
});
```

**Validation Points:**
- Status transitions: `ringing` → `connected` → `ended`
- All signaling events are received in order
- ICE candidates are exchanged correctly
- Duration is calculated accurately
- Both participants receive all events

---

## Women Safety Features

### Set Emergency Contact and Trusted Contacts

**Bash (macOS/Linux)**
```bash
# Update profile with emergency contact and trusted contacts
curl -X PUT "$API_BASE/api/me" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "emergencyContact": "+923009999999",
    "trustedContacts": ["4", "5"]
  }'
```

**PowerShell (Windows)**
```powershell
$profileBody = @{
    emergencyContact = "+923009999999"
    trustedContacts = @("4", "5")
} | ConvertTo-Json

curl.exe -X PUT "$env:API_BASE/api/me" `
  -H "Authorization: Bearer $env:PASSENGER_TOKEN" `
  -H "Content-Type: application/json" `
  -d $profileBody
```

**Expected Response (200 OK)**
```json
{
  "id": 2,
  "phone": "+923001111111",
  "name": "Test Passenger",
  "role": "passenger",
  "verified": true,
  "emergencyContact": "+923009999999",
  "trustedContacts": ["4", "5"],
  "createdAt": "2024-01-15T10:00:00.000Z"
}
```

**Validation Points:**
- Emergency contact is saved
- Trusted contacts array is updated
- Both are included in SOS requests automatically

### Share Trip with Trusted Contact

See Trip Lifecycle section (Step 8) for detailed sharing instructions.

**Validation Checklist:**
- Contact must be in `trustedContacts` list
- `sharedWith` array is updated
- Trusted contact receives `trip_shared` socket event
- Contact can view trip details if authenticated

### Verify SOS Includes Safety Contacts

**Bash (macOS/Linux)**
```bash
# Send SOS (emergency_contact can be different from profile)
curl -X POST "$API_BASE/api/sos" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trip_id": 1,
    "emergency_contact": "+923009999999",
    "message": "Emergency situation",
    "location_lat": 40.7128,
    "location_lng": -74.0060
  }'
```

**Validation Points:**
- SOS request includes `emergency_contact` field
- Emergency contact is notified (via socket event or SMS in production)
- `sos_alert` event is broadcast to all connected clients
- Location is accurately captured
- Trusted contacts who have trip shared receive notifications

### Complete Safety Features Test Flow

1. **Set up safety contacts**
   - Update profile with emergency contact and trusted contacts
   - Verify profile is updated correctly

2. **Create a trip**
   - Create trip as passenger
   - Verify trip is created with `safetyCheckEnabled: true`

3. **Share trip with trusted contact**
   - Share trip with a trusted contact
   - Verify `sharedWith` array is updated
   - Verify trusted contact receives `trip_shared` event

4. **Send SOS during trip**
   - Send SOS request
   - Verify SOS response includes `emergency_services_notified: true`
   - Verify `sos_alert` event is broadcast
   - Verify location is included in alert

5. **Monitor safety signals**
   - Check admin SOS endpoint for logged alerts
   - Verify timestamps and location data
   - Confirm emergency contact is recorded

---

## API Endpoint Testing Checklist

This section provides a comprehensive checklist of all API endpoints with copy-paste curl commands, expected responses, and validation points.

### Authentication Endpoints

#### POST /api/auth/otp

**Command:**
```bash
curl -X POST "$API_BASE/api/auth/otp" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+923001111111"}'
```

**Success Response (200 OK):**
```json
{
  "message": "OTP sent successfully",
  "expiresIn": 300,
  "otp": "123456"
}
```

**Validation:**
- OTP returned in development mode
- `expiresIn` is 300 seconds (5 minutes)
- Rate limiting: max 5 requests per 15 minutes

#### POST /api/auth/verify

**Command:**
```bash
curl -X POST "$API_BASE/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+923001111111", "otp": "123456", "name": "Test User", "role": "passenger"}'
```

**Success Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 2,
    "phone": "+923001111111",
    "name": "Test User",
    "role": "passenger",
    "verified": true
  }
}
```

**Validation:**
- Token is valid JWT
- User object matches request
- OTP is deleted after successful verification

### Profile Endpoints

#### GET /api/me

**Command:**
```bash
curl -X GET "$API_BASE/api/me" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**Success Response (200 OK):** See Authentication Flow section

**Error Response (401 Unauthorized):**
```json
{
  "error": "Access token required"
}
```

#### PUT /api/me

**Command:**
```bash
curl -X PUT "$API_BASE/api/me" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "emergencyContact": "+923009999999"}'
```

**Success Response (200 OK):**
```json
{
  "id": 2,
  "name": "Updated Name",
  "emergencyContact": "+923009999999",
  ...
}
```

### Trip Endpoints

#### POST /api/trips

**Command:**
```bash
curl -X POST "$API_BASE/api/trips" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pickup_lat": 40.7128, "pickup_lng": -74.0060, "pickup_address": "123 Main St", "drop_lat": 40.7589, "drop_lng": -73.9851, "drop_address": "456 Park Ave", "proposed_price": 25.50}'
```

**Success Response (201 Created):**
```json
{
  "id": 1,
  "passengerId": 2,
  "status": "requested",
  "pickupLat": 40.7128,
  "pickupLng": -74.0060,
  ...
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "All trip details required"
}
```

#### GET /api/trips/:id

**Command:**
```bash
curl -X GET "$API_BASE/api/trips/1" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**Success Response (200 OK):** See Trip Lifecycle section

**Error Response (404 Not Found):**
```json
{
  "error": "Trip not found"
}
```

#### GET /api/trips

**Command:**
```bash
curl -X GET "$API_BASE/api/trips?status=completed" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**Success Response (200 OK):** See Trip Lifecycle section (Step 11)

### Offer Endpoints

#### POST /api/trips/:id/offers

**Command:**
```bash
curl -X POST "$API_BASE/api/trips/1/offers" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"price_offer": 28.00, "eta_minutes": 5}'
```

**Success Response (201 Created):**
```json
{
  "id": 1,
  "tripId": 1,
  "driverId": 3,
  "priceOffer": 28.00,
  "etaMinutes": 5,
  "status": "pending"
}
```

#### GET /api/trips/:id/offers

**Command:**
```bash
curl -X GET "$API_BASE/api/trips/1/offers" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**Success Response (200 OK):** See Trip Lifecycle section (Step 10)

### Trip Action Endpoints

#### POST /api/trips/:id/accept

**Command:**
```bash
curl -X POST "$API_BASE/api/trips/1/accept" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"offer_id": 1}'
```

**Success Response (200 OK):**
```json
{
  "message": "Offer accepted successfully",
  "trip": { "status": "accepted", ... }
}
```

#### POST /api/trips/:id/start

**Command:**
```bash
curl -X POST "$API_BASE/api/trips/1/start" \
  -H "Authorization: Bearer $DRIVER_TOKEN"
```

**Success Response (200 OK):** Trip status changes to `in_progress`

#### POST /api/trips/:id/complete

**Command:**
```bash
curl -X POST "$API_BASE/api/trips/1/complete" \
  -H "Authorization: Bearer $DRIVER_TOKEN"
```

**Success Response (200 OK):** Trip status changes to `completed`

#### POST /api/trips/:id/cancel

**Command:**
```bash
curl -X POST "$API_BASE/api/trips/1/cancel" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**Success Response (200 OK):** Trip status changes to `cancelled`

### Chat Endpoints

#### POST /api/trips/:id/messages

**Command:**
```bash
curl -X POST "$API_BASE/api/trips/1/messages" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'
```

**Success Response (201 Created):**
```json
{
  "message_id": 1,
  "trip_id": 1,
  "message": "Hello!",
  "timestamp": "2024-01-15T10:20:00.000Z",
  "is_flagged": false
}
```

#### GET /api/trips/:id/messages

**Command:**
```bash
curl -X GET "$API_BASE/api/trips/1/messages" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**Success Response (200 OK):** See Chat Testing section

### Voice Call Endpoints

#### POST /api/trips/:id/call/initiate

**Command:**
```bash
curl -X POST "$API_BASE/api/trips/1/call/initiate" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"emergency_recording": false}'
```

**Success Response (201 Created):** See Voice Call Testing section

#### GET /api/trips/:id/call/status

**Command:**
```bash
curl -X GET "$API_BASE/api/trips/1/call/status" \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

**Success Response (200 OK):** See Voice Call Testing section

### Driver Endpoints

#### POST /api/drivers/register

**Command:**
```bash
curl -X POST "$API_BASE/api/drivers/register" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"license_number": "DL123456", "vehicle_make": "Toyota", "vehicle_model": "Corolla", "vehicle_plate": "ABC-123", "vehicle_year": 2020}'
```

**Success Response (201 Created):**
```json
{
  "id": 3,
  "userId": 3,
  "licenseNumber": "DL123456",
  "verificationStatus": "pending",
  ...
}
```

#### PUT /api/drivers/status

**Command:**
```bash
curl -X PUT "$API_BASE/api/drivers/status" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_online": true}'
```

**Success Response (200 OK):** Driver status updated

### SOS Endpoints

#### POST /api/sos

**Command:**
```bash
curl -X POST "$API_BASE/api/sos" \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trip_id": 1, "emergency_contact": "+923009999999", "message": "Emergency!", "location_lat": 40.7128, "location_lng": -74.0060}'
```

**Success Response (201 Created):** See SOS section above

### Admin Endpoints

#### GET /api/admin/trips

**Command:**
```bash
curl -X GET "$API_BASE/api/admin/trips" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Success Response (200 OK):** Array of all trips (max 50)

#### GET /api/admin/drivers/pending

**Command:**
```bash
curl -X GET "$API_BASE/api/admin/drivers/pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Success Response (200 OK):** Array of pending driver verifications

#### POST /api/admin/drivers/:id/verify

**Command:**
```bash
curl -X POST "$API_BASE/api/admin/drivers/3/verify" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "verified"}'
```

**Success Response (200 OK):** See Admin Endpoints section

#### GET /api/admin/stats

**Command:**
```bash
curl -X GET "$API_BASE/api/admin/stats" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Success Response (200 OK):**
```json
{
  "total_users": 10,
  "total_drivers": 5,
  "total_trips": 25,
  "active_trips": 3,
  "completed_trips": 20,
  "verified_drivers": 4,
  "sos_events": 2,
  "active_sos": 1
}
```

#### GET /api/admin/messages

**Command:**
```bash
curl -X GET "$API_BASE/api/admin/messages?flagged=true&limit=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Success Response (200 OK):** Array of messages (filtered by flagged status)

#### GET /api/admin/calls

**Command:**
```bash
curl -X GET "$API_BASE/api/admin/calls?emergency=true&limit=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Success Response (200 OK):** Array of calls (filtered by emergency status)

### Health Endpoint

#### GET /api/health

**Command:**
```bash
curl -X GET "$API_BASE/api/health"
```

**Success Response (200 OK):**
```json
{
  "status": "OK",
  "message": "SafeRide Women Backend is running",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Tips for Windows Users

1. **Use PowerShell over CMD** when possible - it has better JSON handling and more modern features
2. **Escape quotes carefully** - PowerShell uses backticks (`) for escaping, CMD uses `^` or double quotes
3. **JSON in PowerShell** - Use `ConvertTo-Json` cmdlet for complex JSON objects
4. **Variable persistence** - Environment variables set in a session only last for that session. Consider using a `.env` file or PowerShell profile
5. **curl.exe vs Invoke-RestMethod** - PowerShell has `Invoke-RestMethod` which is more PowerShell-native, but `curl.exe` (alias for `curl.exe` in PowerShell) maintains consistency with cross-platform examples

