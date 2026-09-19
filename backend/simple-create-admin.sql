USE jishora_db;

INSERT INTO users (username, email, password, role, is_vip, vip_level, status, created_at) VALUES ('admin', 'admin@jishora.com', '$2a$10$YQ5HzZ6YQ5HzZ6YQ5HzZ6uJ/1K8K8K8K8K8K8K8K8K8K8K8K8K8K8', 'admin', 1, 3, 'active', NOW());

INSERT INTO wallets (user_id, main_balance, frozen_balance, total_earned, total_withdrawn, created_at) VALUES (LAST_INSERT_ID(), 0, 0, 0, 0, NOW());

SELECT 'Admin user created successfully!' as Result;
