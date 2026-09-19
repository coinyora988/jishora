# Jishora Backend - Complete Setup Guide

## Prerequisites

Before you begin, ensure you have installed:
- **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- **MySQL** (v8.0 or higher) - [Download](https://dev.mysql.com/downloads/mysql/)
- **npm** (comes with Node.js)

## Step-by-Step Setup

### 1. Install MySQL

#### Windows:
1. Download MySQL installer from official website
2. Run the installer and choose "Developer Default"
3. Set root password during installation
4. Complete the installation

#### Verify MySQL Installation:
```bash
mysql --version
```

### 2. Create Database

Open MySQL command line or MySQL Workbench and run:

```sql
CREATE DATABASE jishora_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Import Database Schema

Navigate to the backend folder and import the schema:

```bash
cd d:\Jishora\backend
mysql -u root -p jishora_db < database_schema.sql
```

Enter your MySQL root password when prompted.

**Verify tables were created:**
```bash
mysql -u root -p
```

Then in MySQL:
```sql
USE jishora_db;
SHOW TABLES;
```

You should see 11 tables:
- users
- wallets
- markets
- products
- tasks
- transactions
- notifications
- referrals
- settings
- audit_logs

### 4. Install Backend Dependencies

```bash
cd d:\Jishora\backend
npm install
```

This will install all required packages:
- express
- mysql2
- bcryptjs
- jsonwebtoken
- dotenv
- cors
- helmet
- express-validator
- express-rate-limit
- morgan
- compression
- multer
- nodemailer
- uuid
- nodemon (dev dependency)

### 5. Configure Environment Variables

1. Copy the example environment file:
```bash
copy .env.example .env
```

2. Open `.env` file and update these critical settings:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=jishora_db
DB_PORT=3306

# JWT Configuration (IMPORTANT: Change these!)
JWT_SECRET=generate_a_long_random_string_here
JWT_REFRESH_SECRET=generate_another_random_string_here

# Admin Configuration
ADMIN_EMAIL=admin@jishora.com
ADMIN_PASSWORD=YourSecurePassword123!
```

**To generate secure JWT secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run this twice and use the outputs for JWT_SECRET and JWT_REFRESH_SECRET.

### 6. Create Admin User

The admin user is created automatically when you import the database schema. However, you need to update the password hash.

**Generate password hash:**

Create a file `hash-password.js`:
```javascript
const bcrypt = require('bcryptjs');

const password = 'Admin123!'; // Change this to your desired password
const hash = bcrypt.hashSync(password, 10);
console.log('Password hash:', hash);
```

Run it:
```bash
node hash-password.js
```

Copy the hash and update the admin user in MySQL:
```sql
USE jishora_db;
UPDATE users SET password_hash = 'your_generated_hash_here' WHERE email = 'admin@jishora.com';
```

### 7. Start the Backend Server

**Development mode (with auto-restart):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

You should see:
```
🚀 Jishora API Server running on port 5000
📝 Environment: development
🔗 API URL: http://localhost:5000
✅ Database connected successfully
```

### 8. Test the API

Open your browser or Postman and test:

**Health Check:**
```
GET http://localhost:5000/health
```

You should get:
```json
{
  "success": true,
  "message": "Jishora API is running",
  "timestamp": "2026-09-12T...",
  "environment": "development"
}
```

## Common Issues & Solutions

### Issue 1: "Cannot connect to MySQL"

**Solution:**
- Verify MySQL is running: `net start MySQL80` (Windows)
- Check MySQL credentials in `.env` file
- Ensure database `jishora_db` exists
- Check MySQL port (default: 3306)

### Issue 2: "Module not found"

**Solution:**
```bash
rm -rf node_modules
npm install
```

### Issue 3: "JWT_SECRET is not defined"

**Solution:**
- Ensure `.env` file exists in `backend/` directory
- Verify `.env` has `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Restart the server after modifying `.env`

### Issue 4: Port 5000 already in use

**Solution:**
Change PORT in `.env`:
```env
PORT=5001
```

## Next Steps

After successful setup:

1. ✅ Test all API endpoints with Postman
2. ✅ Create additional admin users if needed
3. ✅ Add sample products to markets
4. ✅ Configure email settings for notifications
5. ✅ Connect frontend to backend
6. ✅ Build admin panel

## API Testing with Postman

### Create a Postman Collection

1. **Register User:**
```
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "Test123456"
}
```

2. **Login:**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123456"
}
```

Save the returned `token` for authenticated requests.

3. **Get Profile (Authenticated):**
```
GET http://localhost:5000/api/user/profile
Authorization: Bearer YOUR_TOKEN_HERE
```

## Database Management

### View all users:
```sql
USE jishora_db;
SELECT id, username, email, role, status, vip_level FROM users;
```

### View all transactions:
```sql
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;
```

### Check wallet balances:
```sql
SELECT u.username, w.balance, w.frozen_balance, w.total_earned 
FROM wallets w 
JOIN users u ON w.user_id = u.id;
```

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production` in `.env`
2. Use strong JWT secrets
3. Enable SSL/HTTPS
4. Set up reverse proxy (nginx)
5. Use PM2 for process management
6. Configure firewall rules
7. Set up automated backups
8. Enable monitoring and logging

## Support

If you encounter any issues:
1. Check the error logs
2. Verify all environment variables
3. Ensure MySQL is running
4. Check firewall settings
5. Review the backend README.md

## Success Checklist

- [ ] MySQL installed and running
- [ ] Database created and schema imported
- [ ] Node.js dependencies installed
- [ ] `.env` file configured
- [ ] Admin user password set
- [ ] Backend server starts without errors
- [ ] Health check endpoint returns success
- [ ] Can register and login users via API

Once all items are checked, your backend is ready! ✅
