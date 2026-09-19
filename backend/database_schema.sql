-- Jishora Database Schema
-- MySQL Database Structure

-- Create database
CREATE DATABASE IF NOT EXISTS jishora_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE jishora_db;

-- Users table
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') DEFAULT 'user',
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  vip_level INT DEFAULT 0,
  phone VARCHAR(20),
  country VARCHAR(50),
  referral_code VARCHAR(20) UNIQUE,
  referred_by INT,
  email_verified BOOLEAN DEFAULT FALSE,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  INDEX idx_email (email),
  INDEX idx_username (username),
  INDEX idx_referral_code (referral_code),
  FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Wallets table
CREATE TABLE wallets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  balance DECIMAL(15, 4) DEFAULT 0.0000,
  frozen_balance DECIMAL(15, 4) DEFAULT 0.0000,
  total_deposited DECIMAL(15, 4) DEFAULT 0.0000,
  total_withdrawn DECIMAL(15, 4) DEFAULT 0.0000,
  total_earned DECIMAL(15, 4) DEFAULT 0.0000,
  wallet_address VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- Markets table
CREATE TABLE markets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  logo_url VARCHAR(255),
  description TEXT,
  commission_rate DECIMAL(5, 4) NOT NULL,
  min_balance DECIMAL(15, 4) NOT NULL,
  max_balance DECIMAL(15, 4),
  vip_level_required INT DEFAULT 0,
  status ENUM('active', 'inactive') DEFAULT 'active',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slug (slug),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- Products table
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(255),
  market_id INT,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL,
  INDEX idx_market_id (market_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- Tasks/Orders table
CREATE TABLE tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  market_id INT,
  product_id INT,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  quantity INT NOT NULL,
  order_amount DECIMAL(15, 4) NOT NULL,
  commission DECIMAL(15, 4) NOT NULL,
  expected_income DECIMAL(15, 4) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
  is_combo BOOLEAN DEFAULT FALSE,
  completion_time TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_order_number (order_number),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Transactions table
CREATE TABLE transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  transaction_number VARCHAR(50) UNIQUE NOT NULL,
  type ENUM('deposit', 'withdraw', 'commission', 'referral', 'bonus', 'penalty') NOT NULL,
  amount DECIMAL(15, 4) NOT NULL,
  balance_before DECIMAL(15, 4) NOT NULL,
  balance_after DECIMAL(15, 4) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_address VARCHAR(255),
  transaction_hash VARCHAR(255),
  notes TEXT,
  admin_notes TEXT,
  processed_by INT,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_type (type),
  INDEX idx_status (status),
  INDEX idx_transaction_number (transaction_number),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Notifications table
CREATE TABLE notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  link VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Referrals table
CREATE TABLE referrals (
  id INT PRIMARY_KEY AUTO_INCREMENT,
  referrer_id INT NOT NULL,
  referred_id INT NOT NULL,
  commission_earned DECIMAL(15, 4) DEFAULT 0.0000,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_referrer_id (referrer_id),
  INDEX idx_referred_id (referred_id),
  UNIQUE KEY unique_referral (referrer_id, referred_id)
) ENGINE=InnoDB;

-- System settings table
CREATE TABLE settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  key_name VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  description VARCHAR(255),
  is_public BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_key_name (key_name)
) ENGINE=InnoDB;

-- Audit logs table
CREATE TABLE audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT,
  old_values JSON,
  new_values JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_entity_type (entity_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Insert default markets
INSERT INTO markets (name, slug, commission_rate, min_balance, max_balance, vip_level_required, sort_order) VALUES
('JD.com', 'jd', 0.06, 20.00, 498.00, 1, 1),
('Rakuten', 'shopee', 0.12, 499.00, 898.00, 2, 2),
('Temu', 'temu', 0.18, 899.00, NULL, 3, 3);

-- Insert default system settings
INSERT INTO settings (key_name, value, description, is_public) VALUES
('site_name', 'Jishora', 'Platform name', TRUE),
('site_maintenance', 'false', 'Maintenance mode', TRUE),
('min_withdraw', '10', 'Minimum withdrawal amount', TRUE),
('max_withdraw', '10000', 'Maximum withdrawal amount', TRUE),
('withdraw_fee_percent', '0.02', 'Withdrawal fee percentage', TRUE),
('referral_commission_rate', '0.05', 'Referral commission rate', FALSE),
('max_daily_tasks', '25', 'Maximum daily tasks per user', TRUE);

-- Create admin user (password: Admin123!)
-- Password hash for 'Admin123!' using bcrypt
INSERT INTO users (username, email, password_hash, role, status, vip_level, email_verified) VALUES
('admin', 'admin@jishora.com', '$2a$10$YourHashedPasswordHere', 'admin', 'active', 999, TRUE);

-- User Sessions table (for session management)
CREATE TABLE user_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_token_hash (token_hash),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB;

-- Password Resets table
CREATE TABLE password_resets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(100) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_token_hash (token_hash),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB;
