// Direct Admin User Creation Script
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    try {
        // Create database connection
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'jishora_db'
        });

        console.log('✅ Connected to database');

        // Hash the password
        const hashedPassword = await bcrypt.hash('admin123', 10);
        console.log('✅ Password hashed');

        // Check if admin already exists
        const [existing] = await connection.execute(
            'SELECT * FROM users WHERE email = ?',
            ['admin@jishora.com']
        );

        if (existing.length > 0) {
            console.log('⚠️  Admin user already exists!');
            console.log('Email:', existing[0].email);
            console.log('Username:', existing[0].username);
            
            // Update the password
            await connection.execute(
                'UPDATE users SET password_hash = ? WHERE email = ?',
                [hashedPassword, 'admin@jishora.com']
            );
            console.log('✅ Admin password updated to: admin123');
        } else {
            // Create admin user
            const [result] = await connection.execute(
                `INSERT INTO users (
                    username, email, password_hash, role, 
                    vip_level, created_at
                ) VALUES (?, ?, ?, ?, ?, NOW())`,
                ['admin', 'admin@jishora.com', hashedPassword, 'admin', 0]
            );

            console.log('✅ Admin user created successfully!');
            console.log('📧 Email: admin@jishora.com');
            console.log('🔑 Password: admin123');
        }

        await connection.end();
        console.log('\n🎉 Done! You can now login at: http://localhost:3000/admin/login.html');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createAdmin();
