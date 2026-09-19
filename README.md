# Jishora - Crypto Trading Platform

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

A complete, production-ready cryptocurrency trading and task marketplace platform with advanced features including VIP tiers, commission systems, wallet management, and comprehensive admin controls.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Screenshots](#screenshots)
- [API Overview](#api-overview)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

### User Features
- 🔐 **Secure Authentication** - JWT-based with refresh tokens
- 💰 **Wallet Management** - Deposits, withdrawals, balance tracking
- 📊 **Trading Dashboard** - Real-time statistics and insights
- 🎯 **Task Marketplace** - Grab and complete tasks for commissions
- 🏆 **VIP Tiers** - 3 VIP levels with exclusive benefits
- 📱 **Responsive Design** - Works on all devices
- 🔔 **Real-time Notifications** - Stay updated on transactions
- 👥 **Referral System** - Earn through referrals
- 📈 **Transaction History** - Complete audit trail

### Admin Features
- 📊 **Analytics Dashboard** - Revenue, users, tasks statistics
- 👤 **User Management** - View, edit, suspend, upgrade users
- 🏪 **Market Control** - Create/edit markets and products
- ✅ **Transaction Approval** - Review and process deposits/withdrawals
- 📢 **Broadcast Notifications** - Send messages to all or specific user groups
- 📑 **Comprehensive Reports** - Financial, user, task analytics
- 🔍 **Advanced Search & Filters** - Find anything quickly
- 📤 **Export Data** - CSV export for all data

### Technical Features
- ⚡ **High Performance** - Optimized queries and caching
- 🔒 **Enterprise Security** - Rate limiting, input validation, SQL injection prevention
- 🛡️ **XSS Protection** - Input sanitization and output encoding
- 📝 **Comprehensive Logging** - Track all operations
- 🔄 **Auto Backups** - Database and file backups
- 🚀 **Scalable Architecture** - Microservices-ready design
- 📱 **RESTful API** - Clean, documented API endpoints
- 🧪 **Automated Testing** - Security and functionality tests

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 16+
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **Authentication**: JWT (jsonwebtoken)
- **Security**: Helmet, CORS, express-validator, express-rate-limit
- **Password Hashing**: bcryptjs
- **Process Manager**: PM2

### Frontend
- **Languages**: HTML5, CSS3, JavaScript (ES6+)
- **Charts**: Chart.js
- **Icons**: Font Awesome
- **Architecture**: Vanilla JS with modular design

### DevOps
- **Web Server**: Nginx
- **SSL**: Let's Encrypt (Certbot)
- **Monitoring**: PM2, custom logging
- **Backups**: Automated MySQL dumps

## 📁 Project Structure

```
Jishora/
├── backend/                 # Backend API
│   ├── src/
│   │   ├── config/         # Database and app configuration
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Auth, validation, rate limiting
│   │   ├── models/         # Database models
│   │   ├── routes/         # API routes
│   │   ├── utils/          # Helper functions
│   │   └── server.js       # Entry point
│   ├── .env.example        # Environment template
│   ├── database_schema.sql # Database structure
│   ├── package.json
│   └── [docs]/            # API, Security, Setup guides
│
├── admin/                  # Admin panel
│   ├── css/               # Admin styles
│   ├── js/                # Admin scripts
│   ├── login.html         # Admin login
│   ├── index.html         # Dashboard
│   ├── users.html         # User management
│   ├── markets.html       # Market management
│   ├── deposits.html      # Transaction approval
│   ├── notifications.html # Messaging system
│   └── reports.html       # Analytics reports
│
├── js/                    # Frontend JavaScript
│   ├── api.js            # API client
│   ├── auth.js           # Authentication
│   ├── dashboard.js      # Dashboard logic
│   ├── markets.js        # Market functionality
│   └── transactions.js   # Transaction handling
│
├── css/                   # Frontend styles
├── images/               # Assets
├── [pages]/              # User-facing HTML pages
├── DEPLOYMENT_GUIDE.md   # Production deployment
├── TESTING_GUIDE.md      # Testing procedures
└── README.md            # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.0.0
- MySQL >= 8.0
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/jishora.git
cd jishora
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
nano .env
```

4. **Set up database**
```bash
# Create database
mysql -u root -p
CREATE DATABASE jishora_db;
USE jishora_db;
SOURCE database_schema.sql;
EXIT;
```

5. **Start the backend**
```bash
npm run dev
```

6. **Open frontend**
```bash
# In another terminal
cd ..
# Serve frontend (use any local server)
npx serve .
# Or use Live Server in VS Code
```

7. **Access the application**
- Frontend: http://localhost:3000
- API: http://localhost:5000/api
- Admin: http://localhost:3000/admin

### Default Credentials

**Admin Account:**
- Email: admin@jishora.com
- Password: Admin123!

**Test User:**
- Email: user@jishora.com
- Password: User123!

> ⚠️ **Important**: Change default passwords immediately!

## 📚 Documentation

Comprehensive documentation is available:

| Document | Description |
|----------|-------------|
| [API Documentation](backend/API_DOCUMENTATION.md) | Complete API reference with examples |
| [Authentication Guide](backend/AUTHENTICATION.md) | JWT setup and usage |
| [Security Guide](backend/SECURITY.md) | Security features and best practices |
| [Setup Guide](backend/SETUP_GUIDE.md) | Database and environment setup |
| [Admin Guide](admin/ADMIN_GUIDE.md) | Admin panel usage |
| [Frontend Integration](FRONTEND_INTEGRATION_GUIDE.md) | Frontend-backend connection |
| [Deployment Guide](DEPLOYMENT_GUIDE.md) | Production deployment steps |
| [Testing Guide](TESTING_GUIDE.md) | Complete testing procedures |

## 📸 Screenshots

### User Dashboard
![Dashboard](screenshots/dashboard.png)
*Real-time wallet balance, task statistics, and notifications*

### Market Marketplace
![Markets](screenshots/markets.png)
*Browse markets, view products, and grab tasks*

### Admin Panel
![Admin](screenshots/admin.png)
*Comprehensive admin dashboard with analytics*

### Transaction Management
![Transactions](screenshots/transactions.png)
*Review and approve deposits/withdrawals*

## 🔌 API Overview

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

```http
POST   /auth/register        # Register new user
POST   /auth/login           # User login
POST   /auth/refresh         # Refresh access token
GET    /auth/me              # Get current user
POST   /auth/logout          # Logout user
POST   /auth/forgot-password # Request password reset
```

### User Endpoints

```http
GET    /wallet               # Get wallet balance
POST   /wallet/deposit       # Create deposit request
POST   /wallet/withdraw      # Create withdrawal request

GET    /market               # Get all markets
GET    /market/:id           # Get market details

POST   /task/grab            # Grab a task
POST   /task/:id/complete    # Complete task
GET    /task                 # Get user tasks

GET    /transaction          # Get transactions
GET    /transaction/stats    # Get statistics
```

### Admin Endpoints

```http
GET    /admin/dashboard      # Dashboard statistics
GET    /admin/users          # List all users
PUT    /admin/user/:id/status # Update user status

GET    /admin/transactions   # All transactions
POST   /admin/transaction/:id/approve  # Approve transaction
POST   /admin/transaction/:id/reject   # Reject transaction

POST   /admin/notifications/broadcast  # Broadcast message
POST   /admin/notifications/targeted   # Targeted message
```

### Example Request

```javascript
// Login
const response = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const data = await response.json();
console.log(data.data.accessToken);
```

## 🔒 Security

### Implemented Security Features

- ✅ **JWT Authentication** with refresh tokens
- ✅ **Password Hashing** using bcrypt (10 rounds)
- ✅ **Input Validation** with express-validator
- ✅ **Rate Limiting** per endpoint (prevents brute force)
- ✅ **SQL Injection Prevention** via parameterized queries
- ✅ **XSS Protection** through input sanitization
- ✅ **CORS** properly configured
- ✅ **Security Headers** via Helmet.js
- ✅ **Session Management** with IP/user agent tracking
- ✅ **Audit Logging** for all sensitive operations

### Security Best Practices

1. **Never commit `.env` files**
2. **Use strong JWT secrets** (32+ characters)
3. **Rotate secrets regularly**
4. **Keep dependencies updated**
5. **Enable HTTPS in production**
6. **Restrict database user permissions**
7. **Monitor logs for suspicious activity**
8. **Regular security audits**

### Run Security Tests

```bash
cd backend
npm run test:security
```

## 🧪 Testing

### Automated Tests

```bash
# All tests
npm test

# Authentication tests
npm run test:auth

# Security tests
npm run test:security
```

### Manual Testing

Follow the [Testing Guide](TESTING_GUIDE.md) for comprehensive manual testing procedures.

## 🚢 Deployment

### Production Deployment

Follow the [Deployment Guide](DEPLOYMENT_GUIDE.md) for complete production deployment instructions.

### Quick Production Setup

1. **Server Requirements**
   - Ubuntu 20.04+ or similar
   - Node.js 16+
   - MySQL 8.0+
   - Nginx
   - SSL certificate

2. **Deploy Backend**
```bash
# Install PM2
npm install -g pm2

# Start with PM2
cd backend
pm2 start src/server.js --name jishora-api
pm2 save
pm2 startup
```

3. **Configure Nginx**
```bash
sudo nano /etc/nginx/sites-available/jishora
# Add configuration
sudo ln -s /etc/nginx/sites-available/jishora /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

4. **SSL Setup**
```bash
sudo certbot --nginx -d yourdomain.com
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Write meaningful commit messages
- Add tests for new features
- Update documentation
- Ensure all tests pass

## 📝 Changelog

### Version 1.0.0 (2024)
- ✅ Initial release
- ✅ Complete backend API
- ✅ User authentication and authorization
- ✅ Wallet and transaction management
- ✅ Market and task system
- ✅ Admin panel with full controls
- ✅ Notification system
- ✅ Security features
- ✅ Comprehensive documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Team

- **Development Team**: Jishora Developers
- **Maintainer**: Jishora Team
- **Support**: support@jishora.com

## 🙏 Acknowledgments

- Express.js community
- MySQL team
- All open-source contributors
- Beta testers and early adopters

## 📞 Support

### Documentation
- API Docs: `backend/API_DOCUMENTATION.md`
- Security: `backend/SECURITY.md`
- Setup: `backend/SETUP_GUIDE.md`

### Contact
- **Email**: support@jishora.com
- **Website**: https://jishora.com
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

## 🗺️ Roadmap

### Upcoming Features
- [ ] Two-factor authentication (2FA)
- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard
- [ ] Automated market making
- [ ] Multi-language support
- [ ] Dark mode
- [ ] WebSocket real-time updates
- [ ] Advanced referral program
- [ ] KYC verification system
- [ ] Payment gateway integration

---

**Made with ❤️ by the Jishora Team**

⭐ **Star this repo if you find it helpful!**
