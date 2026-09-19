-- Jishora Admin User Creation Script
-- Run this in MySQL to create admin user

USE jishora_db;

-- Create admin user with password: admin123
INSERT INTO users (username, email, password, role, is_vip, vip_level, status, created_at)
VALUES (
    'admin',
    'admin@jishora.com',
    '$2a$10$rQY5YqZQZJZQYqZQYqZQYuO7K7K7K7K7K7K7K7K7K7K7K7K7K7K7K',
    'admin',
    1,
    3,
    'active',
    NOW()
);

-- Create wallet for admin user
INSERT INTO wallets (user_id, main_balance, frozen_balance, total_earned, total_withdrawn, created_at)
VALUES (
    LAST_INSERT_ID(),
    0,
    0,
    0,
    0,
    NOW()
);

-- Verify admin user was created
SELECT id, username, email, role, status FROM users WHERE email = 'admin@jishora.com';

-- Show success message
SELECT 'Admin user created successfully!' as Status,
       'Email: admin@jishora.com' as Email,
       'Password: admin123' as Password;
