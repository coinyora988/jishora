/**
 * Create Admin User Script
 * Run: node create-admin.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function createAdmin() {
    try {
        console.log('Creating admin user...\n');

        // Create database connection
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'jishora_db'
        });

        console.log('✓ Connected to database');

        // Hash password
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if admin already exists
        const [existingAdmin] = await connection.execute(
            'SELECT id FROM users WHERE email = ?',
            ['admin@jishora.com']
        );

        if (existingAdmin.length > 0) {
            console.log('✗ Admin user already exists!');
            console.log('\nLogin with:');
            console.log('Email: admin@jishora.com');
            console.log('Password: admin123');
            await connection.end();
            return;
        }

        // Create admin user
        const [result] = await connection.execute(
            `INSERT INTO users (username, email, password, role, is_vip, vip_level, status, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            ['admin', 'admin@jishora.com', hashedPassword, 'admin', 1, 3, 'active']
        );

        const userId = result.insertId;
        console.log('✓ Admin user created (ID: ' + userId + ')');

        // Create wallet for admin
        await connection.execute(
            `INSERT INTO wallets (user_id, main_balance, frozen_balance, total_earned, total_withdrawn, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [userId, 0, 0, 0, 0]
        );

        console.log('✓ Admin wallet created');

        await connection.end();

        console.log('\n========================================');
        console.log('  ADMIN USER CREATED SUCCESSFULLY!');
        console.log('========================================\n');
        console.log('Login Credentials:');
        console.log('Email:    admin@jishora.com');
        console.log('Password: admin123');
        console.log('\nAdmin Panel: http://localhost:3000/admin/login.html');
        console.log('========================================\n');

    } catch (error) {
        console.error('Error creating admin:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n⚠️  Cannot connect to MySQL. Make sure:');
            console.log('1. MySQL is running');
            console.log('2. Database credentials in .env are correct');
        }
        
        process.exit(1);
    }
}

createAdmin();
