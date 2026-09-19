// Fix Missing Referrals Table
const mysql = require('mysql2/promise');

async function fixReferralsTable() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'jishora_db'
        });

        console.log('✅ Connected to database');

        // Create referrals table
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS referrals (
                id INT PRIMARY KEY AUTO_INCREMENT,
                referrer_id INT NOT NULL,
                referred_id INT NOT NULL,
                commission_earned DECIMAL(15, 4) DEFAULT 0.0000,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_referrer (referrer_id),
                INDEX idx_referred (referred_id)
            ) ENGINE=InnoDB;
        `;

        await connection.execute(createTableQuery);
        console.log('✅ Referrals table created successfully');

        await connection.end();
        console.log('\n🎉 Done! You can now restart the backend server.');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

fixReferralsTable();
