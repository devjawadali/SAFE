# SafeRide Women - API Reference

Complete REST API and Socket.io event documentation for the SafeRide Women backend server.

---

## Table of Contents

- [Authentication](#authentication)
- [User Profile](#user-profile)
- [Trip Management](#trip-management)
- [Offers & Acceptance](#offers--acceptance)
- [Trip Actions](#trip-actions)
- [Chat & Communication](#chat--communication)
- [Voice Calls](#voice-calls)
- [Ratings](#ratings)
- [Driver Management](#driver-management)
- [SOS Emergency](#sos-emergency)
- [Admin Panel](#admin-panel)
- [Socket.io Events](#socketio-events)
- [Data Models](#data-models)
- [Error Handling](#error-handling)

---

## Authentication

All endpoints except `/api/auth/otp`, `/api/auth/verify`, and `/api/health` require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### POST /api/auth/otp

Request an OTP code for phone number verification.

**Rate Limit:** 5 requests per 15 minutes

**Request:**
```json
{
  "phone": "+923001111111"
}
```

**Response (200):**
```json
{
  "message": "OTP sent successfully",
  "expiresIn": 300
}
```

**Response (Development Mode Only):**
```json
{
  "message": "OTP sent successfully",
  "expiresIn": 300,
  "otp": "123456"
}
```

**Error Responses:**
- `400` - Invalid phone number (less than 10 characters)
- `429` - Too many requests (rate limit exceeded)

---

### POST /api/auth/verify

Verify OTP and receive JWT token.

**Rate Limit:** 5 requests per 15 minutes

**Request:**
```json
{
  "phone": "+923001111111",
  "otp": "123456",
  "name": "Ayesha Khan",
  "role": "passenger"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresAt": "2024-01-08T00:00:00.000Z",
  "user": {
    "id": 2,
    "phone": "+923001111111",
    "name": "Ayesha Khan",
    "role": "passenger",
    "verified": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "emergencyContact": null,
    "trustedContacts": []
  }
}
```

**Error Responses:**
- `400` - Invalid OTP or OTP expired
- `400` - Name required for new user
- `429` - Too many requests (rate limit exceeded)

**Notes:**
- `role` must be `"passenger"` or `"driver"` (defaults to `"passenger"`) 
- For existing users, `name` is optional
- `accessToken` is the primary token field (use this for new clients)
- `token` field is provided for backward compatibility (mirrors `accessToken`)
- Access token expiration is configurable via `ACCESS_TOKEN_EXPIRY` (default: 30m)
- Refresh token expiration is configurable via `REFRESH_TOKEN_EXPIRY_DAYS` (default: 7 days)

---

## User Profile

### GET /api/me

Get current user profile.

**Authentication:** Required

**Response (200):**
```json
{
  "id": 2,
  "phone": "+923001111111",
  "name": "Ayesha Khan",
  "role": "passenger",
  "verified": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "emergencyContact": "+923009999999",
  "trustedContacts": ["+923008888888"]
}
```

**Error Responses:**
- `401` - Access token required
- `403` - Invalid or expired token
- `404` - User not found

---

### PUT /api/me

Update current user profile.

**Authentication:** Required

**Request:**
```json
{
  "name": "Ayesha Khan",
  "emergencyContact": "+923009999999",
  "trustedContacts": ["+923008888888", "+923007777777"]
}
```

**Response (200):**
```json
{
  "id": 2,
  "phone": "+923001111111",
  "name": "Ayesha Khan",
  "role": "passenger",
  "verified": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "emergencyContact": "+923009999999",
  "trustedContacts": ["+923008888888", "+923007777777"]
}
```

**Error Responses:**
- `401` - Access token required
- `403` - Invalid or expired token
- `404` - User not found

---

## Trip Management

### POST /api/trips

Create a new trip request.

**Authentication:** Required  
**Authorization:** `passenger` role only

**Request:**
```json
{
  "pickup_lat": 31.5204,
  "pickup_lng": 74.3587,
  "pickup_address": "Lahore Railway Station",
  "drop_lat": 31.5497,
  "drop_lng": 74.3436,
  "drop_address": "Lahore Fort",
  "proposed_price": 250
}
```

**Response (201):**
```json
{
  "id": 1,
  "passengerId": 2,
  "driverId": null,
  "pickupLat": 31.5204,
  "pickupLng": 74.3587,
  "pickupAddress": "Lahore Railway Station",
  "dropLat": 31.5497,
  "dropLng": 74.3436,
  "dropAddress": "Lahore Fort",
  "status": "requested",
  "proposedPrice": 250,
  "acceptedPrice": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "startedAt": null,
  "completedAt": null,
  "sharedWith": [],
  "safetyCheckEnabled": true
}
```

**Socket.io Event:** Emits `new_trip` to all drivers in `drivers_online` room

**Error Responses:**
- `400` - All trip details required
- `400` - Invalid coordinate or price values
- `401` - Access token required
- `403` - Access denied (not a passenger)

---

### GET /api/trips/:id

Get trip details by ID.

**Authentication:** Required  
**Authorization:** Must be trip passenger, driver, or admin

**Response (200):**
```json
{
  "id": 1,
  "passengerId": 2,
  "driverId": 3,
  "pickupLat": 31.5204,
  "pickupLng": 74.3587,
  "pickupAddress": "Lahore Railway Station",
  "dropLat": 31.5497,
  "dropLng": 74.3436,
  "dropAddress": "Lahore Fort",
  "status": "accepted",
  "proposedPrice": 250,
  "acceptedPrice": 250,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "startedAt": null,
  "completedAt": null,
  "sharedWith": [],
  "safetyCheckEnabled": true,
  "passenger_name": "Ayesha Khan",
  "driver_name": "Test Driver",
  "vehicle_make": "Toyota",
  "vehicle_model": "Corolla",
  "vehicle_plate": "ABC-123"
}
```

**Error Responses:**
- `401` - Access token required
- `403` - Access denied
- `404` - Trip not found

---

### GET /api/trips

List user's trips (filtered by status if provided).

**Authentication:** Required

**Query Parameters:**
- `status` (optional) - Filter by status: `requested`, `accepted`, `in_progress`, `completed`, `cancelled`

**Response (200):**
```json
[
  {
    "id": 1,
    "passengerId": 2,
    "driverId": 3,
    "status": "completed",
    "pickupAddress": "Lahore Railway Station",
    "dropAddress": "Lahore Fort",
    "proposedPrice": 250,
    "acceptedPrice": 250,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "completedAt": "2024-01-01T01:00:00.000Z",
    "passenger_name": "Ayesha Khan",
    "driver_name": "Test Driver"
  }
]
```

**Error Responses:**
- `401` - Access token required

---

## Offers & Acceptance

### POST /api/trips/:id/offers

Create an offer for a trip (driver only).

**Authentication:** Required  
**Authorization:** `driver` role only  
**Note:** Driver must be verified

**Request:**
```json
{
  "price_offer": 240,
  "eta_minutes": 10
}
```

**Response (201):**
```json
{
  "id": 1,
  "tripId": 1,
  "driverId": 3,
  "priceOffer": 240,
  "etaMinutes": 10,
  "status": "pending",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Socket.io Event:** Emits `new_offer` to trip room

**Error Responses:**
- `400` - Price and ETA required
- `400` - Price must be a positive number
- `400` - ETA must be a positive number
- `400` - You already made an offer
- `401` - Access token required
- `403` - Access denied (not a driver or driver not verified)
- `404` - Trip not available

---

### GET /api/trips/:id/offers

List pending offers for a trip.

**Authentication:** Required  
**Authorization:** Must be trip passenger, driver, or admin

**Response (200):**
```json
[
  {
    "id": 1,
    "tripId": 1,
    "driverId": 3,
    "priceOffer": 240,
    "etaMinutes": 10,
    "status": "pending",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "driver_name": "Test Driver",
    "driver_phone": "+923002222222",
    "vehicle_make": "Toyota",
    "vehicle_model": "Corolla",
    "vehicle_plate": "ABC-123",
    "rating": 4.8
  }
]
```

**Error Responses:**
- `401` - Access token required
- `403` - Access denied
- `404` - Trip not found

---

### POST /api/trips/:id/accept

Accept an offer (passenger only).

**Authentication:** Required  
**Authorization:** `passenger` role only

**Request:**
```json
{
  "offer_id": 1
}
```

**Response (200):**
```json
{
  "message": "Offer accepted successfully",
  "trip": {
    "id": 1,
    "passengerId": 2,
    "driverId": 3,
    "status": "accepted",
    "acceptedPrice": 240
  }
}
```

**Socket.io Event:** Emits `offer_accepted` to driver

**Error Responses:**
- `400` - Offer not found
- `401` - Access token required
- `403` - Access denied (not a passenger)
- `404` - Trip not found or not available

---

## Trip Actions

### POST /api/trips/:id/start

Start a trip (driver only).

**Authentication:** Required  
**Authorization:** `driver` role only  
**Note:** Driver must be verified and assigned to trip

**Response (200):**
```json
{
  "id": 1,
  "passengerId": 2,
  "driverId": 3,
  "status": "in_progress",
  "startedAt": "2024-01-01T00:15:00.000Z"
}
```

**Socket.io Event:** Emits `trip_started` to trip room

**Error Responses:**
- `401` - Access token required
- `403` - Access denied (not driver or driver not verified)
- `404` - Trip not found or not authorized

---

### POST /api/trips/:id/complete

Complete a trip (driver only).

**Authentication:** Required  
**Authorization:** `driver` role only

**Response (200):**
```json
{
  "id": 1,
  "passengerId": 2,
  "driverId": 3,
  "status": "completed",
  "completedAt": "2024-01-01T01:00:00.000Z"
}
```

**Socket.io Events:**
- Emits `trip_completed` to trip room
- Emits `chat_disabled` to trip room
- Ends all active calls for the trip

**Error Responses:**
- `401` - Access token required
- `403` - Access denied (not driver)
- `404` - Trip not found or not authorized

---

### POST /api/trips/:id/cancel

Cancel a trip (passenger or driver).

**Authentication:** Required  
**Authorization:** Must be trip passenger or driver

**Response (200):**
```json
{
  "id": 1,
  "passengerId": 2,
  "driverId": 3,
  "status": "cancelled",
  "cancelledAt": "2024-01-01T00:10:00.000Z",
  "cancelledBy": 2
}
```

**Socket.io Events:**
- Emits `chat_disabled` to trip room
- Ends all active calls for the trip

**Error Responses:**
- `400` - Cannot cancel completed trip
- `401` - Access token required
- `403` - Not authorized
- `404` - Trip not found

---

### POST /api/trips/:id/share

Share trip with a trusted contact.

**Authentication:** Required  
**Authorization:** Must be trip passenger

**Request:**
```json
{
  "contact_id": "4"
}
```

**Response (200):**
```json
{
  "message": "Trip shared successfully",
  "trip": {
    "id": 1,
    "sharedWith": ["4"]
  }
}
```

**Socket.io Event:** Emits `trip_shared` to contact if online

**Error Responses:**
- `400` - Contact ID required
- `400` - User has no trusted contacts
- `400` - Contact is not in your trusted contacts list
- `401` - Access token required
- `403` - Only the trip passenger can share the trip
- `404` - Trip not found

---

### DELETE /api/trips/:id/share/:contactId

Unshare trip with a contact.

**Authentication:** Required  
**Authorization:** Must be trip passenger

**Response (200):**
```json
{
  "message": "Contact removed from shared trip",
  "trip": {
    "id": 1,
    "sharedWith": []
  }
}
```

**Error Responses:**
- `401` - Access token required
- `403` - Only the trip passenger can unshare the trip
- `404` - Trip not found
- `404` - Contact not found in shared list

---

## Chat & Communication

### POST /api/trips/:id/messages

Send a chat message.

**Authentication:** Required  
**Authorization:** Must be trip passenger or driver  
**Note:** Chat only available for trips with status `accepted` or `in_progress`

**Request:**
```json
{
  "message": "Hello, I'm on my way!"
}
```

**Response (201):**
```json
{
  "message_id": 1,
  "trip_id": 1,
  "message": "Hello, I'm on my way!",
  "timestamp": "2024-01-01T00:20:00.000Z",
  "is_flagged": false
}
```

**Socket.io Event:** Emits `receive_message` to trip room

**Error Responses:**
- `400` - Message cannot be empty
- `400` - Message too long (max 1000 characters)
- `401` - Access token required
- `403` - Access denied or chat disabled for this trip

**Notes:**
- Messages are filtered for profanity
- Flagged messages are marked with `is_flagged: true`

---

### GET /api/trips/:id/messages

Get message history for a trip.

**Authentication:** Required  
**Authorization:** Must be trip passenger or driver

**Response (200):**
```json
[
  {
    "message_id": 1,
    "trip_id": 1,
    "sender_id": 2,
    "sender_name": "Ayesha Khan",
    "recipient_id": 3,
    "recipient_name": "Test Driver",
    "message": "Hello, I'm on my way!",
    "timestamp": "2024-01-01T00:20:00.000Z",
    "read_at": "2024-01-01T00:20:05.000Z",
    "is_flagged": false
  }
]
```

**Error Responses:**
- `401` - Access token required
- `403` - Access denied

---

## Voice Calls

### POST /api/trips/:id/call/initiate

Initiate a voice call for a trip.

**Authentication:** Required  
**Authorization:** Must be trip passenger or driver  
**Note:** Call only available for trips with status `accepted` or `in_progress`

**Request:**
```json
{
  "emergency_recording": false
}
```

**Response (201):**
```json
{
  "call_id": 1,
  "trip_id": 1,
  "caller_id": 2,
  "callee_id": 3,
  "status": "ringing",
  "emergency_recording": false,
  "initiated_at": "2024-01-01T00:25:00.000Z"
}
```

**Socket.io Event:** Emits `call_incoming` to trip room and callee

**Error Responses:**
- `400` - Call already in progress
- `401` - Access token required
- `403` - Access denied or call not available for this trip

---

### GET /api/trips/:id/call/status

Get call status for a trip.

**Authentication:** Required  
**Authorization:** Must be trip passenger or driver

**Response (200):**
```json
{
  "call_id": 1,
  "trip_id": 1,
  "caller_id": 2,
  "caller_name": "Ayesha Khan",
  "callee_id": 3,
  "callee_name": "Test Driver",
  "status": "connected",
  "initiated_at": "2024-01-01T00:25:00.000Z",
  "connected_at": "2024-01-01T00:25:05.000Z",
  "ended_at": null,
  "duration": null,
  "emergency_recording": false,
  "end_reason": null
}
```

**Error Responses:**
- `401` - Access token required
- `403` - Access denied
- `404` - No call found for this trip

---

## Ratings

### POST /api/trips/:id/rate

Rate a completed trip.

**Authentication:** Required  
**Authorization:** Must be trip passenger or driver

**Request:**
```json
{
  "rating": 5,
  "comment": "Excellent service!"
}
```

**Response (200):**
```json
{
  "message": "Rating submitted successfully",
  "rating": {
    "id": 1,
    "tripId": 1,
    "raterId": 2,
    "rateeId": 3,
    "rating": 5,
    "comment": "Excellent service!",
    "createdAt": "2024-01-01T01:05:00.000Z"
  }
}
```

**Error Responses:**
- `400` - Rating must be between 1 and 5
- `400` - Already rated this trip
- `401` - Access token required
- `403` - Not authorized
- `404` - Trip not found or not completed

**Notes:**
- Driver ratings are recalculated automatically
- Each user can rate a trip only once

---

## Driver Management

### POST /api/drivers/register

Register as a driver.

**Authentication:** Required  
**Authorization:** `driver` role only

**Request:**
```json
{
  "license_number": "DL123456",
  "vehicle_make": "Toyota",
  "vehicle_model": "Corolla",
  "vehicle_plate": "ABC-123",
  "vehicle_year": 2020
}
```

**Response (201):**
```json
{
  "id": 3,
  "userId": 3,
  "licenseNumber": "DL123456",
  "vehicleMake": "Toyota",
  "vehicleModel": "Corolla",
  "vehiclePlate": "ABC-123",
  "vehicleYear": 2020,
  "verificationStatus": "pending",
  "rating": 5.0,
  "totalTrips": 0,
  "isOnline": false,
  "lastLocationLat": null,
  "lastLocationLng": null,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `400` - All vehicle details required
- `400` - Already registered as driver
- `401` - Access token required
- `403` - Access denied (not a driver)

**Notes:**
- Driver must be verified by admin before making offers
- Initial rating is 5.0
- Verification status starts as `pending`

---

### PUT /api/drivers/status

Update driver online status.

**Authentication:** Required  
**Authorization:** `driver` role only  
**Note:** Driver must be verified

**Request:**
```json
{
  "is_online": true
}
```

**Response (200):**
```json
{
  "id": 3,
  "userId": 3,
  "isOnline": true,
  "verificationStatus": "verified"
}
```

**Socket.io Event:** Emits `driver_online` globally when set to `true`

**Error Responses:**
- `401` - Access token required
- `403` - Access denied (not driver or driver not verified)
- `404` - Driver not found

---

## SOS Emergency

### POST /api/sos

Trigger an SOS emergency alert.

**Authentication:** Required

**Request:**
```json
{
  "trip_id": 1,
  "emergency_contact": "+923009999999",
  "message": "Help! I need assistance.",
  "location_lat": 31.5204,
  "location_lng": 74.3587
}
```

**Response (201):**
```json
{
  "message": "SOS alert sent successfully",
  "sos_id": 1,
  "emergency_services_notified": true
}
```

**Socket.io Event:** Emits `sos_alert` globally to all connected clients

**Error Responses:**
- `401` - Access token required

**Notes:**
- All fields are optional except authentication
- SOS alerts are logged to console with 🚨 emoji
- Global broadcast ensures maximum visibility

---

### GET /api/sos

List all SOS events (admin only).

**Authentication:** Required  
**Authorization:** `admin` role only

**Response (200):**
```json
[
  {
    "id": 1,
    "userId": 2,
    "tripId": 1,
    "emergencyContact": "+923009999999",
    "message": "Help! I need assistance.",
    "locationLat": 31.5204,
    "locationLng": 74.3587,
    "status": "active",
    "createdAt": "2024-01-01T00:30:00.000Z",
    "resolvedAt": null
  }
]
```

**Error Responses:**
- `401` - Access token required
- `403` - Access denied (admin only)

---

## Admin Panel

### GET /api/admin/trips

List all trips (admin only).

**Authentication:** Required  
**Authorization:** `admin` role only

**Response (200):**
```json
[
  {
    "id": 1,
    "passengerId": 2,
    "driverId": 3,
    "status": "completed",
    "pickupAddress": "Lahore Railway Station",
    "dropAddress": "Lahore Fort",
    "passenger_name": "Ayesha Khan",
    "driver_name": "Test Driver",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**Notes:**
- Returns last 50 trips, sorted by creation date (newest first)

---

### GET /api/admin/drivers/pending

List pending driver verifications (admin only).

**Authentication:** Required  
**Authorization:** `admin` role only

**Response (200):**
```json
[
  {
    "id": 3,
    "userId": 3,
    "licenseNumber": "DL123456",
    "vehicleMake": "Toyota",
    "vehicleModel": "Corolla",
    "vehiclePlate": "ABC-123",
    "verificationStatus": "pending",
    "name": "Test Driver",
    "phone": "+923002222222"
  }
]
```

---

### POST /api/admin/drivers/:id/verify

Verify or reject a driver (admin only).

**Authentication:** Required  
**Authorization:** `admin` role only

**Request:**
```json
{
  "status": "verified"
}
```

**Response (200):**
```json
{
  "id": 3,
  "userId": 3,
  "verificationStatus": "verified"
}
```

**Error Responses:**
- `400` - Status must be verified or rejected
- `404` - Driver not found

---

### GET /api/admin/stats

Get system statistics (admin only).

**Authentication:** Required  
**Authorization:** `admin` role only

**Response (200):**
```json
{
  "total_users": 100,
  "total_drivers": 25,
  "total_trips": 500,
  "active_trips": 10,
  "completed_trips": 450,
  "verified_drivers": 20,
  "sos_events": 5,
  "active_sos": 1
}
```

---

### GET /api/admin/messages

Monitor chat messages (admin only).

**Authentication:** Required  
**Authorization:** `admin` role only

**Query Parameters:**
- `tripId` (optional) - Filter by trip ID
- `flagged` (optional) - Filter flagged messages (`true` or `false`)
- `limit` (optional) - Limit results (default: 100)

**Response (200):**
```json
[
  {
    "message_id": 1,
    "trip_id": 1,
    "sender_id": 2,
    "sender_name": "Ayesha Khan",
    "recipient_id": 3,
    "recipient_name": "Test Driver",
    "message": "Hello!",
    "timestamp": "2024-01-01T00:20:00.000Z",
    "read_at": "2024-01-01T00:20:05.000Z",
    "is_flagged": false,
    "trip_status": "in_progress"
  }
]
```

---

### GET /api/admin/calls

Monitor voice calls (admin only).

**Authentication:** Required  
**Authorization:** `admin` role only

**Query Parameters:**
- `tripId` (optional) - Filter by trip ID
- `status` (optional) - Filter by status (`ringing`, `connected`, `ended`)
- `emergency` (optional) - Filter emergency calls (`true` or `false`)
- `limit` (optional) - Limit results (default: 100)

**Response (200):**
```json
[
  {
    "call_id": 1,
    "trip_id": 1,
    "caller_id": 2,
    "caller_name": "Ayesha Khan",
    "callee_id": 3,
    "callee_name": "Test Driver",
    "status": "ended",
    "initiated_at": "2024-01-01T00:25:00.000Z",
    "connected_at": "2024-01-01T00:25:05.000Z",
    "ended_at": "2024-01-01T00:30:00.000Z",
    "duration": 295,
    "emergency_recording": false,
    "end_reason": "completed",
    "trip_status": "completed",
    "trip_pickup_address": "Lahore Railway Station",
    "trip_drop_address": "Lahore Fort"
  }
]
```

---

## Socket.io Events

All Socket.io events require authentication via the `authenticate` event before use.

### Authentication

#### authenticate

Authenticate socket connection with JWT token.

**Client → Server:**
```javascript
socket.emit('authenticate', {
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
});
```

**Server → Client (Success):**
```javascript
socket.on('authenticated', (data) => {
  console.log(data.userId); // Authenticated user ID
});
```

**Server → Client (Error):**
```javascript
socket.on('auth_error', (data) => {
  console.error(data.error); // Error message
});
```

---

### Connection Management

#### join_trip

Join a trip-specific room for real-time updates.

**Client → Server:**
```javascript
socket.emit('join_trip', {
  tripId: 1
});
```

**Server → Client (Success):**
```javascript
socket.on('joined_trip', (data) => {
  console.log(`Joined trip ${data.tripId}`);
});
```

**Server → Client (Error):**
```javascript
socket.on('join_error', (data) => {
  console.error(data.error);
});
```

---

### Location Tracking

#### driver_online

Mark driver as online and join drivers room.

**Client → Server:**
```javascript
socket.emit('driver_online', {});
```

**Authorization:** Driver role required

---

#### location_update

Send driver location update (broadcasts to active trips).

**Client → Server:**
```javascript
socket.emit('location_update', {
  lat: 31.5204,
  lng: 74.3587
});
```

**Authorization:** Driver role required

**Server → Client (Broadcast):**
```javascript
socket.on('location_update', (data) => {
  console.log(`Driver ${data.driverId} at ${data.lat}, ${data.lng}`);
  // data: { driverId, lat, lng, timestamp }
});
```

---

### Chat Messaging

#### send_message

Send a chat message.

**Client → Server:**
```javascript
socket.emit('send_message', {
  tripId: 1,
  message: 'Hello, I\'m on my way!'
});
```

**Server → Client (Broadcast):**
```javascript
socket.on('receive_message', (data) => {
  console.log(`Message from ${data.sender_id}: ${data.message}`);
  // data: { message_id, trip_id, sender_id, recipient_id, message, timestamp, is_flagged }
});
```

**Server → Client (Error):**
```javascript
socket.on('message_error', (data) => {
  console.error(data.error);
});
```

---

#### typing_indicator

Send typing indicator.

**Client → Server:**
```javascript
socket.emit('typing_indicator', {
  tripId: 1,
  isTyping: true
});
```

**Server → Client (Broadcast):**
```javascript
socket.on('user_typing', (data) => {
  console.log(`User ${data.user_id} is typing: ${data.is_typing}`);
  // data: { trip_id, user_id, is_typing }
});
```

---

#### message_read

Mark a message as read.

**Client → Server:**
```javascript
socket.emit('message_read', {
  messageId: 1
});
```

**Server → Client (Broadcast):**
```javascript
socket.on('message_read_receipt', (data) => {
  console.log(`Message ${data.message_id} read at ${data.read_at}`);
  // data: { message_id, trip_id, read_at }
});
```

---

#### chat_disabled

Notification that chat is disabled (trip completed/cancelled).

**Server → Client (Broadcast):**
```javascript
socket.on('chat_disabled', (data) => {
  console.log(`Chat disabled: ${data.reason}`);
  // data: { trip_id, reason }
});
```

---

### Voice Call Signaling

#### call_initiate

Initiate a voice call.

**Client → Server:**
```javascript
socket.emit('call_initiate', {
  tripId: 1,
  emergencyRecording: false
});
```

**Server → Client (Broadcast):**
```javascript
socket.on('call_incoming', (data) => {
  console.log(`Incoming call from ${data.caller_id}`);
  // data: { call_id, trip_id, caller_id, callee_id, emergency_recording, initiated_at }
});
```

---

#### call_offer

Send WebRTC SDP offer.

**Client → Server:**
```javascript
socket.emit('call_offer', {
  callId: 1,
  sdp: {
    type: 'offer',
    sdp: 'v=0\r\no=- 1234567890...'
  }
});
```

**Server → Client (Targeted):**
```javascript
socket.on('call_offer', (data) => {
  console.log('Received SDP offer');
  // data: { call_id, trip_id, from_user_id, sdp }
});
```

---

#### call_answer

Send WebRTC SDP answer.

**Client → Server:**
```javascript
socket.emit('call_answer', {
  callId: 1,
  sdp: {
    type: 'answer',
    sdp: 'v=0\r\no=- 1234567890...'
  }
});
```

**Server → Client (Broadcast):**
```javascript
socket.on('call_connected', (data) => {
  console.log(`Call ${data.call_id} connected`);
  // data: { call_id, trip_id, connected_at }
});
```

**Server → Client (Targeted):**
```javascript
socket.on('call_answer', (data) => {
  console.log('Received SDP answer');
  // data: { call_id, trip_id, from_user_id, sdp }
});
```

---

#### ice_candidate

Send WebRTC ICE candidate.

**Client → Server:**
```javascript
socket.emit('ice_candidate', {
  callId: 1,
  candidate: {
    candidate: 'candidate:1 1 UDP 2130706431...',
    sdpMLineIndex: 0,
    sdpMid: '0'
  }
});
```

**Server → Client (Targeted):**
```javascript
socket.on('ice_candidate', (data) => {
  console.log('Received ICE candidate');
  // data: { call_id, trip_id, from_user_id, candidate }
});
```

---

#### call_end

End a call.

**Client → Server:**
```javascript
socket.emit('call_end', {
  callId: 1,
  reason: 'completed'
});
```

**Server → Client (Broadcast):**
```javascript
socket.on('call_ended', (data) => {
  console.log(`Call ended: ${data.reason}, duration: ${data.duration}s`);
  // data: { call_id, trip_id, ended_at, duration, reason }
});
```

---

### Trip Updates

#### new_trip

New trip available for drivers.

**Server → Client (Broadcast to drivers_online):**
```javascript
socket.on('new_trip', (data) => {
  console.log(`New trip from ${data.pickup_address} to ${data.drop_address}`);
  // data: { trip_id, pickup_lat, pickup_lng, drop_lat, drop_lng, proposed_price, pickup_address, drop_address }
});
```

---

#### new_offer

New offer received by passenger.

**Server → Client (Broadcast to trip room):**
```javascript
socket.on('new_offer', (data) => {
  console.log(`Offer from ${data.driver_name}: ${data.price_offer}`);
  // data: { offer_id, driver_id, driver_name, vehicle_info, vehicle_plate, price_offer, eta_minutes, rating }
});
```

---

#### offer_accepted

Offer accepted by passenger (notifies driver).

**Server → Client (Targeted to driver):**
```javascript
socket.on('offer_accepted', (data) => {
  console.log(`Your offer for trip ${data.trip_id} was accepted!`);
  // data: { trip_id, offer_id }
});
```

---

#### trip_started

Trip started notification.

**Server → Client (Broadcast to trip room):**
```javascript
socket.on('trip_started', (data) => {
  console.log(`Trip ${data.trip_id} started at ${data.started_at}`);
  // data: { trip_id, started_at }
});
```

---

#### trip_completed

Trip completed notification.

**Server → Client (Broadcast to trip room):**
```javascript
socket.on('trip_completed', (data) => {
  console.log(`Trip ${data.trip_id} completed at ${data.completed_at}`);
  // data: { trip_id, completed_at }
});
```

---

#### trip_shared

Trip shared with trusted contact.

**Server → Client (Targeted to contact):**
```javascript
socket.on('trip_shared', (data) => {
  console.log(`${data.passenger_name} shared their trip`);
  // data: { trip_id, passenger_id, passenger_name, pickup_address, drop_address, status, shared_at }
});
```

---

### Emergency

#### sos_alert

SOS emergency alert (global broadcast).

**Server → Client (Global Broadcast):**
```javascript
socket.on('sos_alert', (data) => {
  console.log(`🚨 SOS ALERT from user ${data.user_id}`);
  // data: { sos_id, user_id, trip_id, message, location: { lat, lng }, timestamp }
});
```

---

## Data Models

This section describes the data structures returned by the API endpoints. Properties use camelCase naming as returned by REST API endpoints. Note that Socket.io events may use snake_case naming.

### User

Represents a user account (passenger, driver, or admin).

**Properties:**
- `id` (number) - Unique user identifier
- `phone` (string) - User's phone number (e.g., "+923001111111")
- `name` (string) - User's display name
- `role` (string) - User role: `"passenger"`, `"driver"`, or `"admin"`
- `verified` (boolean) - Whether the user account is verified
- `createdAt` (string, ISO 8601) - Account creation timestamp
- `emergencyContact` (string | null) - Emergency contact phone number
- `trustedContacts` (string[]) - Array of trusted contact identifiers

**Example:**
```json
{
  "id": 2,
  "phone": "+923001111111",
  "name": "Ayesha Khan",
  "role": "passenger",
  "verified": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "emergencyContact": "+923009999999",
  "trustedContacts": ["+923008888888"]
}
```

---

### Driver

Represents driver-specific information and vehicle details.

**Properties:**
- `id` (number) - Driver record ID (matches user ID)
- `userId` (number) - Reference to User ID
- `licenseNumber` (string) - Driver's license number
- `vehicleMake` (string) - Vehicle manufacturer (e.g., "Toyota")
- `vehicleModel` (string) - Vehicle model (e.g., "Corolla")
- `vehiclePlate` (string) - License plate number (e.g., "ABC-123")
- `vehicleYear` (number | null) - Vehicle model year
- `verificationStatus` (string) - Driver verification status: `"pending"`, `"verified"`, or `"rejected"`
- `rating` (number) - Average rating (0.0 to 5.0)
- `totalTrips` (number) - Total number of completed trips
- `isOnline` (boolean) - Whether driver is currently online
- `lastLocationLat` (number | null) - Last known latitude
- `lastLocationLng` (number | null) - Last known longitude
- `createdAt` (string, ISO 8601) - Driver registration timestamp

**Example:**
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
  "rating": 4.8,
  "totalTrips": 15,
  "isOnline": false,
  "lastLocationLat": null,
  "lastLocationLng": null,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### Trip

Represents a ride request or active/completed trip.

**Properties:**
- `id` (number) - Unique trip identifier
- `passengerId` (number) - User ID of the passenger
- `driverId` (number | null) - User ID of the assigned driver (null if not assigned)
- `pickupLat` (number) - Pickup location latitude
- `pickupLng` (number) - Pickup location longitude
- `pickupAddress` (string) - Pickup address
- `dropLat` (number) - Drop-off location latitude
- `dropLng` (number) - Drop-off location longitude
- `dropAddress` (string) - Drop-off address
- `status` (string) - Trip status: `"requested"`, `"accepted"`, `"in_progress"`, `"completed"`, or `"cancelled"`
- `proposedPrice` (number) - Initial price proposed by passenger
- `acceptedPrice` (number | null) - Final agreed price (set when offer accepted)
- `createdAt` (string, ISO 8601) - Trip creation timestamp
- `startedAt` (string | null, ISO 8601) - Trip start timestamp
- `completedAt` (string | null, ISO 8601) - Trip completion timestamp
- `sharedWith` (string[]) - Array of contact IDs with whom trip is shared
- `safetyCheckEnabled` (boolean) - Whether safety check features are enabled

**Example:**
```json
{
  "id": 1,
  "passengerId": 2,
  "driverId": 3,
  "pickupLat": 31.5204,
  "pickupLng": 74.3587,
  "pickupAddress": "Lahore Railway Station",
  "dropLat": 31.5497,
  "dropLng": 74.3436,
  "dropAddress": "Lahore Fort",
  "status": "accepted",
  "proposedPrice": 250,
  "acceptedPrice": 240,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "startedAt": null,
  "completedAt": null,
  "sharedWith": [],
  "safetyCheckEnabled": true
}
```

---

### Offer

Represents a driver's offer/bid for a trip.

**Properties:**
- `id` (number) - Unique offer identifier
- `tripId` (number) - Reference to Trip ID
- `driverId` (number) - User ID of the driver making the offer
- `priceOffer` (number) - Offered price
- `etaMinutes` (number) - Estimated time of arrival in minutes
- `status` (string) - Offer status: `"pending"`, `"accepted"`, or `"rejected"`
- `createdAt` (string, ISO 8601) - Offer creation timestamp

**Example:**
```json
{
  "id": 1,
  "tripId": 1,
  "driverId": 3,
  "priceOffer": 240,
  "etaMinutes": 10,
  "status": "pending",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### Message

Represents a chat message between passenger and driver.

**Properties:**
- `id` (number) - Unique message identifier
- `tripId` (number) - Reference to Trip ID
- `senderId` (number) - User ID of the message sender
- `recipientId` (number) - User ID of the message recipient
- `message` (string) - Message content (profanity-filtered)
- `timestamp` (string, ISO 8601) - Message creation timestamp
- `readAt` (string | null, ISO 8601) - Timestamp when message was read
- `isFlagged` (boolean) - Whether message was flagged for inappropriate content

**Example:**
```json
{
  "id": 1,
  "tripId": 1,
  "senderId": 2,
  "recipientId": 3,
  "message": "Hello, I'm on my way!",
  "timestamp": "2024-01-01T00:20:00.000Z",
  "readAt": "2024-01-01T00:20:05.000Z",
  "isFlagged": false
}
```

---

### Call

Represents a voice call between passenger and driver.

**Properties:**
- `id` (number) - Unique call identifier
- `tripId` (number) - Reference to Trip ID
- `callerId` (number) - User ID of the caller
- `calleeId` (number) - User ID of the callee
- `status` (string) - Call status: `"ringing"`, `"connected"`, or `"ended"`
- `initiatedAt` (string, ISO 8601) - Call initiation timestamp
- `connectedAt` (string | null, ISO 8601) - Call connection timestamp
- `endedAt` (string | null, ISO 8601) - Call end timestamp
- `duration` (number | null) - Call duration in seconds (set when call ends)
- `emergencyRecording` (boolean) - Whether emergency recording is enabled
- `endReason` (string | null) - Reason for call ending (e.g., `"completed"`, `"trip_completed"`, `"cancelled"`)

**Example:**
```json
{
  "id": 1,
  "tripId": 1,
  "callerId": 2,
  "calleeId": 3,
  "status": "connected",
  "initiatedAt": "2024-01-01T00:25:00.000Z",
  "connectedAt": "2024-01-01T00:25:05.000Z",
  "endedAt": null,
  "duration": null,
  "emergencyRecording": false,
  "endReason": null
}
```

---

### Rating

Represents a rating given after trip completion.

**Properties:**
- `id` (number) - Unique rating identifier
- `tripId` (number) - Reference to Trip ID
- `raterId` (number) - User ID of the user giving the rating
- `rateeId` (number) - User ID of the user being rated
- `rating` (number) - Rating value (1 to 5)
- `comment` (string) - Optional comment text
- `createdAt` (string, ISO 8601) - Rating creation timestamp

**Example:**
```json
{
  "id": 1,
  "tripId": 1,
  "raterId": 2,
  "rateeId": 3,
  "rating": 5,
  "comment": "Excellent service!",
  "createdAt": "2024-01-01T01:05:00.000Z"
}
```

---

### SOSEvent

Represents an SOS emergency alert.

**Properties:**
- `id` (number) - Unique SOS event identifier
- `userId` (number) - User ID who triggered the SOS
- `tripId` (number | null) - Associated trip ID (if applicable)
- `emergencyContact` (string | null) - Emergency contact phone number
- `message` (string) - Emergency message
- `locationLat` (number | null) - Alert location latitude
- `locationLng` (number | null) - Alert location longitude
- `status` (string) - SOS status: `"active"` or `"resolved"`
- `createdAt` (string, ISO 8601) - SOS alert creation timestamp
- `resolvedAt` (string | null, ISO 8601) - Timestamp when SOS was resolved

**Example:**
```json
{
  "id": 1,
  "userId": 2,
  "tripId": 1,
  "emergencyContact": "+923009999999",
  "message": "Help! I need assistance.",
  "locationLat": 31.5204,
  "locationLng": 74.3587,
  "status": "active",
  "createdAt": "2024-01-01T00:30:00.000Z",
  "resolvedAt": null
}
```

---

## Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

### Error Response Format

```json
{
  "error": "Error message description"
}
```

### Socket.io Error Events

All Socket.io errors use event-specific error events:
- `auth_error` - Authentication errors
- `join_error` - Trip join errors
- `message_error` - Chat message errors
- `call_error` - Voice call errors
- `error` - General errors

---

## Rate Limiting

### Authentication Endpoints
- **Limit:** 5 requests per 15 minutes
- **Applies to:** `/api/auth/otp`, `/api/auth/verify`
- **Response:** `429 Too Many Requests`

### General API Endpoints
- **Limit:** 100 requests per minute
- **Applies to:** All `/api/*` endpoints (except auth)
- **Response:** `429 Too Many Requests`

---

## Authentication Flow

1. Client requests OTP via `POST /api/auth/otp`
2. Client receives OTP (shown in development mode)
3. Client verifies OTP via `POST /api/auth/verify`
4. Client receives JWT token and user data
5. Client includes token in `Authorization: Bearer <token>` header for all requests
6. For Socket.io, client emits `authenticate` event with token
7. Server responds with `authenticated` event containing `userId`

---

## Sample Test Accounts

**Admin:**
- Phone: `+923001234567`
- Name: `Admin User`
- User ID: `1`
- Role: `admin`

**Passenger:**
- Phone: `+923001111111`
- Name: `Test Passenger`
- User ID: `2`
- Role: `passenger`

**Driver:**
- Phone: `+923002222222`
- Name: `Test Driver`
- User ID: `3`
- Role: `driver`
- License: `DL123456`
- Vehicle: `Toyota Corolla (ABC-123)`
- Rating: `4.8`
- Total Trips: `15`
- Status: `verified`

---

**Last Updated:** January 2024  
**API Version:** 1.0.0  
**Server Base URL:** `http://localhost:4000`

