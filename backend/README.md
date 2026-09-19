# Jishora Backend API

Backend server for the Jishora crypto trading platform.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MySQL
- **Authentication:** JWT (JSON Web Tokens)
- **Security:** Helmet, CORS, Rate Limiting, bcrypt

## Project Structure

```
backend/
├── src/
│   ├── config/           # Configuration files
│   │   └── database.js   # Database connection
│   ├── controllers/      # Route controllers
│   ├── middleware/       # Custom middleware
│   │   ├── authMiddleware.js
│   │   ├── errorHandler.js
│   │   └── notFound.js
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── walletRoutes.js
│   │   ├── marketRoutes.js
│   │   ├── taskRoutes.js
│   │   ├── transactionRoutes.js
│   │   └── adminRoutes.js
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   └── server.js         # Main application file
├── .env.example          # Environment variables template
├── package.json
└── README.md
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Database credentials
- JWT secrets
- Email settings
- etc.

### 3. Setup Database

Create a MySQL database:

```sql
CREATE DATABASE jishora_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Run migrations:

```bash
npm run db:migrate
```

Seed initial data (optional):

```bash
npm run db:seed
```

### 4. Start Server

Development mode (with auto-restart):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - Register new user
- `POST /login` - Login user
- `POST /logout` - Logout user
- `POST /refresh` - Refresh access token
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password

### User (`/api/user`)
- `GET /profile` - Get user profile
- `PUT /profile` - Update user profile
- `GET /stats` - Get user statistics

### Wallet (`/api/wallet`)
- `GET /balance` - Get wallet balance
- `POST /deposit` - Create deposit request
- `POST /withdraw` - Create withdrawal request
- `GET /transactions` - Get wallet transactions

### Markets (`/api/markets`)
- `GET /` - Get all markets
- `GET /:id/products` - Get market products

### Tasks (`/api/tasks`)
- `GET /available` - Get available tasks
- `POST /grab` - Grab a task
- `POST /submit` - Submit completed task

### Transactions (`/api/transactions`)
- `GET /` - Get user transactions
- `GET /:id` - Get transaction details

### Admin (`/api/admin`)
- `GET /dashboard` - Get dashboard stats
- `GET /users` - Get all users
- `PUT /users/:id` - Update user
- `GET /transactions` - Get all transactions
- `POST /notifications/broadcast` - Send broadcast notification

## Security Features

- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt with salt rounds
- **Rate Limiting** - Prevent abuse
- **Input Validation** - express-validator
- **CORS** - Configured for frontend origin
- **Helmet** - Security headers
- **SQL Injection Prevention** - Prepared statements

## Error Handling

All errors return consistent JSON format:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400
  }
}
```

## Development

### Testing

```bash
npm test
```

### Logging

Logs are managed by Morgan:
- Development: Detailed console logs
- Production: Combined format

## Environment Variables

See `.env.example` for all required environment variables.

## Next Steps

1. Implement controllers
2. Create database models
3. Build service layer
4. Add comprehensive tests
5. Set up CI/CD pipeline

## Support

For issues or questions, contact the development team.
