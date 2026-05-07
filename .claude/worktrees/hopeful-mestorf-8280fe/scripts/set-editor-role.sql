-- Assign editor role by device ID
-- UPDATE users SET user_role = 'editor' WHERE device_id = 'YOUR_DEVICE_ID';

-- Assign editor role by email
-- UPDATE users SET user_role = 'editor' WHERE email = 'your@email.com';

-- Assign editor role by wallet address
-- UPDATE users SET user_role = 'editor' WHERE wallet_address = '0xYOUR_WALLET_ADDRESS';

-- Revoke editor role
-- UPDATE users SET user_role = 'user' WHERE device_id = 'DEVICE_ID';

-- List all editors
-- SELECT id, device_id, email, wallet_address, user_role FROM users WHERE user_role = 'editor';
