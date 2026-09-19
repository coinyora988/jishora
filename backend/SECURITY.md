# Security Features Documentation

This document outlines the comprehensive security measures implemented in the Jishora platform backend.

## Table of Contents
1. [Input Validation](#input-validation)
2. [Rate Limiting](#rate-limiting)
3. [Authentication & Authorization](#authentication--authorization)
4. [SQL Injection Prevention](#sql-injection-prevention)
5. [XSS Protection](#xss-protection)
6. [CORS Configuration](#cors-configuration)
7. [Security Headers](#security-headers)
8. [Password Security](#password-security)
9. [Session Management](#session-management)
10. [Security Best Practices](#security-best-practices)

---

## Input Validation

### Express-Validator Implementation

All user inputs are validated using `express-validator` before processing:

#### Authentication Validation
- **Email**: Valid email format, normalized, max 255 characters
- **Username**: 3-50 characters, alphanumeric + underscore only
- **Password**: Minimum 6 characters, must contain at least one number
- **Referral Code**: Optional, max 50 characters, sanitized

#### Transaction Validation
- **Amount**: Positive number, max 2 decimal places, range: 0.01 - 1,000,000
- **Method**: Whitelist validation (usdt, bank_transfer, crypto only)
- **Address**: Required for withdrawals, max 255 characters, sanitized

#### Market & Product Validation
- **Name**: 2-100 characters, required, sanitized
- **Description**: Max 500-1000 characters, sanitized
- **Commission/Balance**: Positive numbers with proper ranges
- **VIP Level**: Integer 0-3

#### Notification Validation
- **Type**: Whitelist (announcement, info, success, warning, error)
- **Title**: 3-100 characters, sanitized
- **Message**: 10-500 characters, sanitized
- **Audience**: Whitelist validation for targeted messages

### Sanitization

All inputs are sanitized to prevent XSS:
- HTML special characters escaped
- JavaScript protocols removed
- Event handlers stripped
- Whitespace trimmed

---

## Rate Limiting

### Endpoint-Specific Limits

| Endpoint Type | Window | Max Requests | Purpose |
|--------------|--------|--------------|---------|
| **Authentication** | 15 min | 5 | Prevent brute force attacks |
| **Sensitive Operations** | 1 hour | 10 | Password resets, email changes |
| **Transactions** | 1 hour | 20 | Prevent spam deposits/withdrawals |
| **Task Operations** | 1 minute | 10 | Prevent automated task grabbing |
| **Notifications** | 1 hour | 50 | Prevent notification spam |
| **Admin Operations** | 15 min | 200 | Higher limit for admin panel |
| **General API** | 15 min | 100 | Standard API protection |
| **File Uploads** | 1 hour | 30 | Prevent upload abuse |

### Rate Limit Headers

All rate-limited responses include:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when the window resets

### Implementation

```javascript
// Example: Auth rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true
});
```

---

## Authentication & Authorization

### JWT-Based Authentication

#### Access Tokens
- **Expiry**: 24 hours
- **Usage**: API authentication
- **Storage**: HTTP-only cookies (recommended) or localStorage

#### Refresh Tokens
- **Expiry**: 30 days
- **Usage**: Obtain new access tokens
- **Storage**: Database with session tracking

### Authorization Levels

1. **Public**: No authentication required (login, register)
2. **User**: Protected routes requiring valid JWT
3. **VIP**: Enhanced features for VIP users (VIP1, VIP2, VIP3)
4. **Admin**: Full platform control

### Middleware Protection

```javascript
// Public route
router.post('/register', validateRegister, register);

// Protected route
router.get('/wallet', protect, getWallet);

// Admin only route
router.get('/admin/users', protect, admin, getAllUsers);

// VIP only route
router.post('/vip-task', protect, requireVIP, grabVIPTask);
```

---

## SQL Injection Prevention

### Parameterized Queries

All database queries use parameterized statements:

✅ **Secure:**
```javascript
const users = await query(
  'SELECT * FROM users WHERE email = ?',
  [email]
);
```

❌ **Vulnerable:**
```javascript
const users = await query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

### Input Escaping (Backup Layer)

Additional SQL input escaping utility available:
```javascript
const { escapeSQLInput } = require('./utils/security');
const sanitized = escapeSQLInput(userInput);
```

### Database User Permissions

- Application database user has minimal permissions
- No DROP, TRUNCATE, or ALTER privileges
- Read/Write access limited to necessary tables only

---

## XSS Protection

### Output Encoding

All user-generated content is encoded before display:
- HTML entities escaped
- JavaScript context encoding
- URL encoding for links

### Content Security Policy (CSP)

Helmet.js implements strict CSP headers:
```javascript
helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:']
  }
});
```

### Input Sanitization

```javascript
const { sanitizeInput } = require('./utils/security');
const clean = sanitizeInput(userInput);
// Removes: <script>, javascript:, onclick=, etc.
```

---

## CORS Configuration

### Allowed Origins

```javascript
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};
```

### Preflight Requests

All complex requests require preflight:
- PUT, DELETE, PATCH methods
- Custom headers
- Content-Type other than simple types

---

## Security Headers

### Helmet.js Implementation

```javascript
app.use(helmet());
```

**Headers Added:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`
- `Content-Security-Policy: (custom directives)`

### Custom Headers

```javascript
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Jishora API');
  res.setHeader('X-API-Version', '1.0.0');
  next();
});
```

---

## Password Security

### Hashing Algorithm

- **Algorithm**: bcrypt
- **Salt Rounds**: 10
- **Minimum Length**: 6 characters
- **Requirements**: Must contain at least one number

### Password Strength Validation

```javascript
const { checkPasswordStrength } = require('./utils/security');

const result = checkPasswordStrength(password);
// Returns: { strong: true/false, strength: 'weak'/'medium'/'strong' }
```

### Password Reset

- **Token Expiry**: 1 hour
- **One-Time Use**: Tokens invalidated after use
- **Rate Limited**: 10 requests per hour

---

## Session Management

### Session Tracking

All active sessions tracked in database:
- Session ID (JWT token ID)
- User ID
- IP Address
- User Agent
- Created/Expires timestamps

### Session Invalidation

Sessions invalidated on:
- User logout
- Password change
- Account suspension
- Token expiration

### Concurrent Sessions

- Multiple active sessions allowed per user
- Admin can view/revoke sessions
- Suspicious IP detection and logging

---

## Security Best Practices

### For Developers

1. **Never Trust User Input**
   - Always validate and sanitize
   - Use whitelist validation when possible

2. **Keep Dependencies Updated**
   ```bash
   npm audit
   npm audit fix
   ```

3. **Environment Variables**
   - Never commit `.env` files
   - Use strong secrets (32+ characters)
   - Rotate secrets regularly

4. **Error Handling**
   - Don't expose stack traces in production
   - Log errors securely
   - Use generic error messages for users

5. **Database Security**
   - Use connection pooling
   - Limit connection lifetime
   - Monitor slow queries
   - Regular backups

### For Deployment

1. **HTTPS Only**
   - Force HTTPS in production
   - Redirect HTTP to HTTPS
   - Use valid SSL certificates

2. **Environment Configuration**
   ```bash
   NODE_ENV=production
   JWT_SECRET=<strong-random-secret>
   JWT_REFRESH_SECRET=<different-strong-secret>
   ```

3. **Database Security**
   - Use separate database user for application
   - Restrict database access by IP
   - Enable database audit logging

4. **Monitoring & Logging**
   - Log all authentication attempts
   - Monitor rate limit violations
   - Alert on suspicious activities
   - Regular security audits

### Security Checklist

- [ ] All routes have proper authentication
- [ ] Input validation on all endpoints
- [ ] Rate limiting configured
- [ ] SQL injection prevention verified
- [ ] XSS protection implemented
- [ ] CORS properly configured
- [ ] Security headers enabled
- [ ] Password hashing working
- [ ] Session management active
- [ ] Error handling secure
- [ ] Environment variables set
- [ ] HTTPS enforced (production)
- [ ] Database secured
- [ ] Logging configured
- [ ] Regular security audits scheduled

---

## Reporting Security Issues

If you discover a security vulnerability, please email: **security@jishora.com**

**Do NOT** create public GitHub issues for security vulnerabilities.

---

## Security Updates

### Version 1.0.0 (Current)
- ✅ JWT authentication
- ✅ Input validation with express-validator
- ✅ Rate limiting per endpoint
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ CORS configuration
- ✅ Security headers (Helmet)
- ✅ Password hashing (bcrypt)
- ✅ Session tracking
- ✅ Comprehensive error handling

### Planned Enhancements
- [ ] Two-factor authentication (2FA)
- [ ] IP-based geolocation blocking
- [ ] Advanced fraud detection
- [ ] Automated security scanning
- [ ] Bug bounty program

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

**Last Updated**: 2024
**Maintainer**: Jishora Security Team
