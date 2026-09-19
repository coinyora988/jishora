# Jishora API Documentation

Complete REST API documentation for Jishora Crypto Trading Platform.

**Base URL:** `http://localhost:5000/api`

**Authentication:** Bearer Token (JWT) in Authorization header

---

## Table of Contents

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Wallet Operations](#wallet-operations)
4. [Markets & Products](#markets--products)
5. [Tasks & Orders](#tasks--orders)
6. [Transactions](#transactions)
7. [Notifications](#notifications)
8. [Referrals](#referrals)

---

## Authentication

### Register User
```http
POST /api/auth/register
```

**Body:**
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
    "user": {...},
    "token": "...",
    "refreshToken": "..."
  }
}
```

### Login
```http
POST /api/auth/login
```

**Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer {token}
```

### Refresh Token
```http
POST /api/auth/refresh
```

**Body:**
```json
{
  "refreshToken": "..."
}
```

### Change Password
```http
POST /api/auth/change-password
Authorization: Bearer {token}
```

**Body:**
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass456"
}
```

### Logout
```http
POST /api/auth/logout
Authorization: Bearer {token}
```

---

## User Management

### Get Profile
```http
GET /api/user/profile
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "vipLevel": 0,
      "referralCode": "XYZ123"
    },
    "stats": {
      "completed_tasks": 15,
      "today_tasks": 3,
      "total_commission": 125.50,
      "total_referrals": 5
    }
  }
}
```

### Update Profile
```http
PUT /api/user/profile
Authorization: Bearer {token}
```

**Body:**
```json
{
  "username": "newusername",
  "phone": "+1234567890",
  "country": "USA"
}
```

### Get Referrals
```http
GET /api/user/referrals
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "referrals": [...],
    "stats": {
      "total_referrals": 5,
      "total_commission": 50.00,
      "active_referrals": 4
    }
  }
}
```

---

## Wallet Operations

### Get Wallet
```http
GET /api/wallet
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": 1500.5000,
    "frozen_balance": 200.0000,
    "total_deposited": 2000.0000,
    "total_withdrawn": 500.0000,
    "total_earned": 200.5000,
    "pending_withdrawal": 0.0000
  }
}
```

### Create Deposit
```http
POST /api/wallet/deposit
Authorization: Bearer {token}
```

**Body:**
```json
{
  "amount": 100.00,
  "method": "USDT",
  "proofImage": "https://..." // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deposit request submitted. Please wait for admin approval.",
  "data": {
    "transactionId": 123
  }
}
```

### Create Withdrawal
```http
POST /api/wallet/withdraw
Authorization: Bearer {token}
```

**Body:**
```json
{
  "amount": 50.00,
  "method": "USDT",
  "accountDetails": {
    "address": "TXxx...xxx",
    "network": "TRC20"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal request submitted successfully",
  "data": {
    "transactionId": 124
  }
}
```

---

## Markets & Products

### Get All Markets
```http
GET /api/market
Authorization: Bearer {token}
```

**Query Parameters:**
- `category` (optional): Filter by category

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "JD.com",
      "description": "E-commerce platform",
      "category": "shopping",
      "logo_url": "/images/jd-logo.png",
      "min_balance": 20.0000,
      "max_balance": 498.0000,
      "commission_rate": 0.0500,
      "status": "active"
    }
  ]
}
```

### Get Market by ID
```http
GET /api/market/:id
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "market": {...},
    "products": [...],
    "userBalance": 150.00
  }
}
```

### Get Product by ID
```http
GET /api/market/product/:id
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "product": {
      "id": 1,
      "name": "Wireless Headphones",
      "price": 45.99,
      "commission": 2.30,
      "min_balance": 20.00,
      "max_balance": 498.00
    },
    "userBalance": 150.00,
    "meetsRequirement": true
  }
}
```

---

## Tasks & Orders

### Grab Task/Order
```http
POST /api/task/grab
Authorization: Bearer {token}
```

**Body:**
```json
{
  "productId": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order grabbed successfully",
  "data": {
    "taskId": 123,
    "frozenAmount": 45.99,
    "newBalance": 104.01,
    "commission": 2.30
  }
}
```

**Error Response (Insufficient Balance):**
```json
{
  "success": false,
  "message": "Insufficient balance. Please deposit funds.",
  "redirectTo": "/deposit.html"
}
```

### Complete Task
```http
POST /api/task/:id/complete
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "message": "Task completed successfully",
  "data": {
    "commission": 2.30,
    "totalReturn": 48.29,
    "taskId": 123
  }
}
```

### Cancel Task
```http
POST /api/task/:id/cancel
Authorization: Bearer {token}
```

### Get User Tasks
```http
GET /api/task
Authorization: Bearer {token}
```

**Query Parameters:**
- `status` (optional): Filter by status (pending, in_progress, completed, cancelled)
- `marketId` (optional): Filter by market

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "product_name": "Wireless Headphones",
      "product_price": 45.99,
      "commission": 2.30,
      "status": "completed",
      "market_name": "JD.com",
      "created_at": "2024-01-15T10:30:00.000Z",
      "completed_at": "2024-01-15T10:35:00.000Z"
    }
  ]
}
```

### Get Task by ID
```http
GET /api/task/:id
Authorization: Bearer {token}
```

### Get Today's Tasks
```http
GET /api/task/today
Authorization: Bearer {token}
```

### Get Task Statistics
```http
GET /api/task/stats
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_tasks": 50,
    "completed_tasks": 45,
    "pending_tasks": 5,
    "total_earned": 125.50,
    "today_tasks": 3
  }
}
```

---

## Transactions

### Get User Transactions
```http
GET /api/transaction
Authorization: Bearer {token}
```

**Query Parameters:**
- `type` (optional): deposit, withdraw, commission, referral_commission
- `status` (optional): pending, completed, rejected

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "deposit",
      "amount": 100.00,
      "status": "completed",
      "payment_method": "USDT",
      "description": "Deposit request",
      "created_at": "2024-01-15T10:00:00.000Z",
      "processed_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Get Transaction by ID
```http
GET /api/transaction/:id
Authorization: Bearer {token}
```

### Get Transaction Statistics
```http
GET /api/transaction/stats
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_deposits": 1000.00,
    "total_withdrawals": 200.00,
    "total_commissions": 150.50,
    "pending_count": 2,
    "pending_amount": 50.00
  }
}
```

---

## Notifications

### Get Notifications
```http
GET /api/user/notifications
Authorization: Bearer {token}
```

**Query Parameters:**
- `limit` (optional, default: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": 1,
        "title": "Order Completed",
        "message": "Order completed! You earned $2.30 commission.",
        "type": "success",
        "is_read": false,
        "created_at": "2024-01-15T10:35:00.000Z"
      }
    ],
    "unreadCount": 5
  }
}
```

### Mark Notification as Read
```http
PUT /api/user/notifications/:id/read
Authorization: Bearer {token}
```

### Mark All as Read
```http
PUT /api/user/notifications/read-all
Authorization: Bearer {token}
```

### Delete Notification
```http
DELETE /api/user/notifications/:id
Authorization: Bearer {token}
```

---

## Referrals

### Get User Referrals
```http
GET /api/user/referrals
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "referrals": [
      {
        "id": 1,
        "username": "friend123",
        "email": "friend@example.com",
        "joined_date": "2024-01-10T08:00:00.000Z",
        "vip_level": 0,
        "total_earned": 10.50,
        "status": "active"
      }
    ],
    "stats": {
      "total_referrals": 5,
      "total_commission": 50.00,
      "active_referrals": 4
    }
  }
}
```

---

## Error Responses

### 400 - Bad Request
```json
{
  "success": false,
  "message": "Invalid amount"
}
```

### 401 - Unauthorized
```json
{
  "success": false,
  "message": "Not authorized, invalid or expired token"
}
```

### 403 - Forbidden
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
  "message": "Resource not found"
}
```

### 500 - Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Rate Limiting

- **Authentication endpoints:** 5 requests per 15 minutes
- **All other endpoints:** 100 requests per 15 minutes

---

## Frontend Integration Examples

### Login Example
```javascript
async function login(email, password) {
  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();
  
  if (data.success) {
    localStorage.setItem('authToken', data.data.token);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    window.location.href = '/index.html';
  }
}
```

### Authenticated Request Example
```javascript
async function getWallet() {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch('http://localhost:5000/api/wallet', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();
  return data;
}
```

### Grab Task Example
```javascript
async function grabTask(productId) {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch('http://localhost:5000/api/task/grab', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ productId })
  });

  const data = await response.json();
  
  if (!data.success && data.redirectTo) {
    window.location.href = data.redirectTo;
  }
  
  return data;
}
```

---

## Testing with curl

### Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"Test123456"}'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123456"}'
```

### Get Wallet (with auth)
```bash
curl -X GET http://localhost:5000/api/wallet \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Support

For more information, see:
- [AUTHENTICATION.md](./AUTHENTICATION.md) - Detailed authentication guide
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Installation and setup
- [README.md](./README.md) - General overview

---

**Last Updated:** September 9, 2026
