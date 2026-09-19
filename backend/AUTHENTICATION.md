# Jishora Authentication System Documentation

## Overview

The Jishora platform uses a **JWT (JSON Web Token)** based authentication system with refresh tokens for secure, stateless authentication.

## Features

✅ **Secure Registration** - Email and username validation, password hashing with bcrypt  
✅ **JWT Access Tokens** - Short-lived tokens (24 hours) for API access  
✅ **Refresh Tokens** - Long-lived tokens (30 days) for obtaining new access tokens  
✅ **Password Reset** - Secure token-based password recovery  
✅ **Session Management** - Track active user sessions  
✅ **Role-Based Access Control** - User and Admin roles  
✅ **VIP Level System** - Multi-tier VIP access control  
✅ **Account Status** - Active, inactive, and suspended states  

## Authentication Flow

### 1. User Registration

**Endpoint:** `POST /api/auth/register`

**Request:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "referralCode": "ABC12345" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "role": "user",
      "vipLevel": 0,
      "referralCode": "XYZ78901"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Validation Rules:**
- Username: 3-30 characters, alphanumeric + underscore only
- Email: Valid email format
- Password: Minimum 6 characters, must contain at least one number
- Referral code: Optional, 6-10 characters

**Automatic Actions:**
- Creates user account
- Creates wallet for user
- Generates unique referral code
- Links referrer if referral code provided
- Returns access and refresh tokens

---

### 2. User Login

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "role": "user",
      "vipLevel": 0,
      "referralCode": "XYZ78901"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Client-Side Storage:**
```javascript
// Store tokens in localStorage
localStorage.setItem('authToken', data.token);
localStorage.setItem('refreshToken', data.refreshToken);
localStorage.setItem('user', JSON.stringify(data.user));
```

---

### 3. Making Authenticated Requests

Include the access token in the Authorization header:

```javascript
fetch('http://localhost:5000/api/user/profile', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
    'Content-Type': 'application/json'
  }
})
```

**Example with axios:**
```javascript
axios.get('http://localhost:5000/api/user/profile', {
  headers: {
    'Authorization': `Bearer ${authToken}`
  }
})
```

---

### 4. Token Refresh

When the access token expires (after 24 hours), use the refresh token to get a new one:

**Endpoint:** `POST /api/auth/refresh`

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Auto-Refresh Implementation:**
```javascript
// Intercept 401 errors and refresh token
axios.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        
        localStorage.setItem('authToken', data.data.token);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        
        originalRequest.headers['Authorization'] = `Bearer ${data.data.token}`;
        return axios(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        window.location.href = '/login.html';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
```

---

### 5. Get Current User Profile

**Endpoint:** `GET /api/auth/me`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "role": "user",
      "status": "active",
      "vipLevel": 0,
      "phone": null,
      "country": null,
      "referralCode": "XYZ78901",
      "emailVerified": false,
      "twoFactorEnabled": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "lastLogin": "2024-01-20T14:25:00.000Z"
    },
    "wallet": {
      "balance": 100.5000,
      "frozenBalance": 50.0000,
      "totalDeposited": 200.0000,
      "totalWithdrawn": 50.0000,
      "totalEarned": 25.5000
    },
    "stats": {
      "completed_tasks": 15,
      "today_tasks": 3,
      "total_commission": 25.5000,
      "total_referrals": 5
    }
  }
}
```

---

### 6. Change Password

**Endpoint:** `POST /api/auth/change-password`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### 7. Forgot Password

**Endpoint:** `POST /api/auth/forgot-password`

**Request:**
```json
{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset instructions sent to your email"
}
```

**Note:** Email functionality needs to be configured. For now, this returns success but doesn't send emails.

---

### 8. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Request:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "NewSecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

---

### 9. Logout

**Endpoint:** `POST /api/auth/logout`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Client-Side:**
```javascript
// Clear tokens and user data
localStorage.removeItem('authToken');
localStorage.removeItem('refreshToken');
localStorage.removeItem('user');
window.location.href = '/login.html';
```

---

## Middleware Protection

### Protect Routes (Require Authentication)

```javascript
const { protect } = require('./middleware/authMiddleware');

router.get('/profile', protect, getProfile);
```

### Admin Only Routes

```javascript
const { protect, admin } = require('./middleware/authMiddleware');

router.get('/admin/users', protect, admin, getAllUsers);
```

### VIP Level Requirements

```javascript
const { protect, requireVIP } = require('./middleware/authMiddleware');

// Require VIP Level 2 or higher
router.post('/premium-task', protect, requireVIP(2), startPremiumTask);
```

---

## Error Responses

### 400 - Bad Request (Validation Failed)
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Password must be at least 6 characters",
      "param": "password",
      "location": "body"
    }
  ]
}
```

### 401 - Unauthorized (Invalid Token)
```json
{
  "success": false,
  "message": "Not authorized, invalid or expired token"
}
```

### 403 - Forbidden (Insufficient Permissions)
```json
{
  "success": false,
  "message": "Access denied. Admin privileges required."
}
```

### 404 - Not Found
```json
{
  "success": false,
  "message": "User not found"
}
```

---

## Security Best Practices

### Password Requirements
- Minimum 6 characters
- At least one number
- Hashed with bcrypt (10 rounds)

### Token Security
- Access tokens expire in 24 hours
- Refresh tokens expire in 30 days
- Tokens are signed with JWT_SECRET from environment
- Never expose JWT_SECRET in client code

### Session Management
- Track active sessions with IP and user agent
- Allow users to view and revoke sessions
- Automatic cleanup of expired sessions

### Account Security
- Email verification (to be implemented)
- Two-factor authentication support (to be implemented)
- Account suspension for security violations
- Rate limiting on login attempts

---

## Testing Authentication

Run the authentication test suite:

```bash
# Make sure server is running first
npm run dev

# In another terminal
npm run test:auth
```

This tests:
- ✅ User registration
- ✅ Duplicate prevention
- ✅ Login
- ✅ Get profile
- ✅ Token validation
- ✅ Token refresh
- ✅ Password change
- ✅ Logout

---

## Frontend Integration Example

### Complete Login Flow

```javascript
// login.js
async function handleLogin(email, password) {
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (data.success) {
      // Store tokens
      localStorage.setItem('authToken', data.data.token);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      
      // Redirect to dashboard
      window.location.href = '/index.html';
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Login failed. Please try again.');
  }
}
```

### Check Authentication Status

```javascript
// Check if user is logged in
function isAuthenticated() {
  const token = localStorage.getItem('authToken');
  return token !== null;
}

// Redirect to login if not authenticated
function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
  }
}

// Use on protected pages
requireAuth();
```

---

## Database Tables

### users
- Stores user credentials and profile information
- Password is hashed with bcrypt
- Includes role, status, VIP level

### user_sessions
- Tracks active login sessions
- Stores hashed tokens
- Includes IP address and user agent

### password_resets
- Temporary storage for password reset tokens
- Tokens expire in 1 hour
- Marked as used after successful reset

---

## Environment Variables Required

```env
JWT_SECRET=your_secret_key_here
JWT_REFRESH_SECRET=another_secret_key_here
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Next Steps

1. ✅ Authentication system complete
2. 🔄 Implement email notifications (password reset, verification)
3. 🔄 Add two-factor authentication (2FA)
4. 🔄 Implement session management UI
5. 🔄 Add OAuth providers (Google, Facebook)
6. 🔄 Rate limiting on authentication endpoints
7. 🔄 CAPTCHA on registration/login

---

## Support

For issues or questions about authentication, check:
- Server logs: `npm run dev`
- Test authentication: `npm run test:auth`
- Database: Check `users` and `user_sessions` tables
