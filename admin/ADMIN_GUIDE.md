# Jishora Admin Panel Guide

Complete guide for managing the Jishora crypto trading platform through the admin panel.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [User Management](#user-management)
4. [Markets & Products](#markets--products)
5. [Transaction Management](#transaction-management)
6. [Reports & Analytics](#reports--analytics)
7. [Settings](#settings)
8. [Best Practices](#best-practices)

---

## Getting Started

### Accessing the Admin Panel

1. Navigate to `http://yourdomain.com/admin/login.html`
2. Login with admin credentials
   - Default: `admin@jishora.com`
   - Password: Set during database setup
3. You'll be redirected to the dashboard

### First Time Setup

1. **Change Default Password**
   - Go to Settings → Account
   - Update your password immediately

2. **Configure Platform Settings**
   - Set commission rates
   - Configure VIP levels
   - Set minimum withdrawal amounts

3. **Add Markets and Products**
   - Navigate to Markets
   - Add your first market
   - Add products to the market

---

## Dashboard Overview

The dashboard provides a real-time overview of your platform:

### Key Metrics

- **Total Users**: Current registered users
- **Total Revenue**: Platform revenue (deposits - withdrawals)
- **Tasks Completed**: Total completed marketplace tasks
- **Pending Requests**: Deposits and withdrawals awaiting approval

### Charts

- **Revenue Overview**: Line chart showing revenue trends
- **User Activity**: Bar chart showing daily active users

### Recent Transactions

View the latest 10 transactions with:
- Transaction ID
- User information
- Type (deposit, withdrawal, commission)
- Amount and status
- Timestamp

### Quick Actions

- Add new user
- Add new market
- Approve pending deposits
- Approve pending withdrawals

---

## User Management

### Viewing Users

**Path**: Users → All Users

**Features**:
- Search by username or email
- Filter by status (active, inactive, suspended)
- Filter by role (user, admin)
- Filter by VIP level
- Pagination (20 users per page)

### User Actions

#### Edit User
1. Click edit button (pencil icon)
2. Modify:
   - Status (active, inactive, suspended)
   - VIP Level (0-3)
3. Save changes

#### Suspend User
- Click ban icon
- Confirms suspension
- User cannot login until reactivated

#### Activate User
- Click check icon
- Reactivates suspended/inactive users

### Export Users

Click "Export" button to download user list as CSV containing:
- User ID
- Username
- Email
- Role
- Status
- VIP Level
- Registration date
- Last login

---

## Markets & Products

### Market Management

**Path**: Markets → All Markets

#### Adding a Market

1. Click "Add Market" button
2. Fill in:
   - Market Name (e.g., "JD.com")
   - Description
   - Category
   - Logo URL
   - Min Balance requirement ($)
   - Max Balance requirement ($)
   - Commission Rate (%)
   - Status (active/inactive)
3. Click "Save Market"

#### Market Card Information

Each market displays:
- Balance range ($20 - $498)
- Commission rate (5%)
- Number of products
- Total tasks completed

### Product Management

#### Adding Products

1. Click on a market card
2. Click "Add Product" button
3. Fill in:
   - Product Name
   - Description
   - Image URL (use real product images)
   - Price ($)
   - Commission amount ($)
   - Min/Max balance requirements
   - Status
4. Save Product

#### Product Guidelines

- Use **real product images** (not icons)
- Set realistic prices
- Commission should be 3-8% of price
- Balance requirements should match market range
- Products should vary in price range

### Example Market Setup

**JD.com Market**:
- Balance Range: $20 - $498
- Commission: 5%
- Products: 40-50 items
- Price Range: $15 - $120

**Sample Products**:
- Wireless Headphones: $45.99 (Commission: $2.30)
- Smart Watch: $89.99 (Commission: $4.50)
- Phone Case: $12.99 (Commission: $0.65)

---

## Transaction Management

### Deposit Management

**Path**: Deposits → Pending Deposits

#### Reviewing Deposits

1. View pending deposit requests
2. Click "Review" button
3. Check:
   - User information
   - Amount
   - Payment method
   - Proof image (if provided)
4. Take action:
   - **Approve**: Adds funds to user wallet
   - **Reject**: Returns to user with reason

#### Approval Process

✅ **When to Approve**:
- Valid payment proof provided
- Amount matches request
- User information verified

❌ **When to Reject**:
- Invalid or no proof
- Suspicious activity
- Amount mismatch
- Duplicate request

### Withdrawal Management

**Path**: Withdrawals → Pending Withdrawals

#### Processing Withdrawals

1. Review withdrawal request
2. Verify:
   - User has sufficient balance
   - Account details are complete
   - No suspicious patterns
3. Process payment externally
4. Approve in system

**Important**: Balance is frozen when withdrawal is requested, deducted when approved.

### Transaction History

**Path**: Transactions → All Transactions

View complete transaction history with filters:
- Transaction type
- Status
- Date range
- User search

---

## Reports & Analytics

**Path**: Reports → Reports & Analytics

### Overview Report

**Metrics**:
- Total Revenue
- Total Deposits
- Total Withdrawals
- Net Profit
- Growth percentages

**Charts**:
- Revenue Trend (30 days)
- Transaction Distribution (pie chart)
- Top Performing Markets

### Financial Report

**Analysis**:
- Total Deposits (approved)
- Total Withdrawals (processed)
- Commission Paid
- Platform Balance
- Cash Flow Chart

### Users Report

**Metrics**:
- Active Users
- New Registrations
- Retention Rate
- VIP Users
- User Growth Chart

### Tasks Report

**Statistics**:
- Total Tasks
- Completed Tasks
- Pending Tasks
- Completion Rate
- Task Completion Trend

### Exporting Reports

1. Select report type
2. Choose date range
3. Click "Export Report"
4. Download JSON/CSV file

---

## Settings

### Platform Settings

**Commission Rates**:
- Set default commission percentage
- Minimum: 3%
- Maximum: 10%

**VIP Levels**:
- Configure VIP benefits
- Set upgrade requirements
- Define commission bonuses

**Limits**:
- Minimum deposit: $10
- Minimum withdrawal: $20
- Maximum daily withdrawal
- Task completion limits

### Account Settings

- Change admin password
- Update email
- Enable two-factor authentication
- Session management

---

## Best Practices

### Daily Tasks

1. **Morning Review**
   - Check dashboard metrics
   - Review pending deposits (approve within 2 hours)
   - Check pending withdrawals

2. **User Management**
   - Monitor new registrations
   - Review suspicious activity
   - Respond to support requests

3. **Market Management**
   - Update product prices
   - Add new products
   - Remove out-of-stock items

### Weekly Tasks

1. **Financial Review**
   - Generate weekly revenue report
   - Analyze cash flow
   - Review commission expenses

2. **User Analysis**
   - Review user growth
   - Check retention rates
   - Identify top performers

3. **Platform Optimization**
   - Review task completion rates
   - Optimize market offerings
   - Update VIP benefits

### Monthly Tasks

1. **Comprehensive Reports**
   - Generate monthly financial report
   - User acquisition analysis
   - Market performance review

2. **Platform Updates**
   - Review and adjust commission rates
   - Update VIP level requirements
   - Add new markets (if needed)

### Security Best Practices

✅ **Do**:
- Change password regularly
- Use strong passwords (12+ characters)
- Enable two-factor authentication
- Log out after sessions
- Monitor audit logs
- Review large transactions manually

❌ **Don't**:
- Share admin credentials
- Approve without verification
- Process suspicious withdrawals
- Ignore pending requests for long periods
- Make bulk changes without backup

### Fraud Prevention

**Red Flags**:
- Multiple deposits from same IP
- Unusual withdrawal patterns
- Account created → deposit → immediate withdrawal
- Mismatched user information
- Requests shortly after registration

**Actions**:
1. Suspend account temporarily
2. Request additional verification
3. Contact user for clarification
4. Check transaction history
5. Verify payment sources

---

## Troubleshooting

### Can't Login

**Solutions**:
- Verify you're using admin email (not regular user)
- Check password (case-sensitive)
- Clear browser cache
- Try incognito/private mode
- Contact technical support

### Dashboard Not Loading

**Check**:
- Backend server is running
- Database is connected
- Network connection
- Browser console for errors

### Transaction Issues

**If deposits not showing**:
- Verify transaction was approved
- Check database connection
- Refresh the page
- Check user's wallet balance

**If withdrawals failing**:
- Verify user has sufficient balance
- Check frozen balance amount
- Ensure withdrawal limits not exceeded

---

## API Integration

Admin panel connects to backend APIs:

- **Dashboard**: `/api/admin/dashboard`
- **Users**: `/api/admin/users`
- **Transactions**: `/api/admin/transactions`
- **Approvals**: `/api/admin/transaction/:id/approve`
- **Rejections**: `/api/admin/transaction/:id/reject`

All requests require:
- Admin authentication token
- Admin role verification
- Proper request format

---

## Support & Contact

For technical issues:
- Check backend logs
- Review browser console
- Contact development team

For feature requests:
- Document the requirement
- Provide use case examples
- Submit through proper channels

---

## Keyboard Shortcuts

- `Ctrl + K`: Quick search
- `Ctrl + S`: Save current form
- `Esc`: Close modals
- `F5`: Refresh current view

---

## Version History

**v1.0.0** - Initial Release
- Dashboard with analytics
- User management
- Market & product management
- Transaction approvals
- Reports & analytics

---

**Last Updated**: September 9, 2026  
**Admin Panel Version**: 1.0.0  
**Backend API Version**: 1.0.0
