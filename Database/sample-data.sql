USE RideFlow;

-- ─── USERS ───────────────────────────────────────────────────────────────────
-- Passwords are all: Password123! (bcrypt hashed)
INSERT INTO Users (fname, lname, email, phone_number, password_hash, role, account_status) VALUES
('Admin',  'RideFlow', 'admin@rideflow.com',  '03000000000', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMd2BM/gEJ5sCDTkVwU3YkNG', 'admin',  'active'),
('Ali',    'Khan',     'ali@example.com',      '03001111111', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMd2BM/gEJ5sCDTkVwU3YkNG', 'rider',  'active'),
('Sara',   'Ahmed',    'sara@example.com',     '03002222222', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMd2BM/gEJ5sCDTkVwU3YkNG', 'rider',  'active'),
('Bilal',  'Malik',    'bilal@example.com',    '03003333333', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMd2BM/gEJ5sCDTkVwU3YkNG', 'driver', 'active'),
('Hamza',  'Sheikh',   'hamza@example.com',    '03004444444', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMd2BM/gEJ5sCDTkVwU3YkNG', 'driver', 'active'),
('Zainab', 'Raza',     'zainab@example.com',   '03005555555', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMd2BM/gEJ5sCDTkVwU3YkNG', 'rider',  'active');

-- ─── DRIVERS ─────────────────────────────────────────────────────────────────
INSERT INTO Driver (user_id, CNIC, license_number, verification_status, availability_status, average_rating, total_trips) VALUES
(4, '4210101234561', 'LHR-2020-12345', 'verified', 'available', 4.5, 120),
(5, '4210109876542', 'LHR-2019-98765', 'verified', 'offline',   4.2, 85);

-- ─── VEHICLES ────────────────────────────────────────────────────────────────
INSERT INTO Vehicles (driver_id, license_plate, make, model, year, color, vehicle_type, verification_status, total_trips) VALUES
(1, 'LEA-123', 'Toyota', 'Corolla', 2021, 'White',  'economy', 'verified', 120),
(2, 'LEB-456', 'Honda',  'Civic',   2022, 'Silver', 'premium', 'verified', 85);

-- ─── LOCATIONS ───────────────────────────────────────────────────────────────
INSERT INTO Location (latitude, longitude, address) VALUES
(24.8607, 67.0011, 'Saddar, Karachi'),
(24.9215, 67.0875, 'Gulshan-e-Iqbal, Karachi'),
(24.8810, 67.0650, 'Clifton, Karachi'),
(24.9014, 67.1323, 'Johar, Karachi');

-- ─── DRIVER LOCATIONS ────────────────────────────────────────────────────────
INSERT INTO Driver_Location (driver_id, latitude, longitude) VALUES
(1, 24.8607, 67.0011),
(2, 24.9215, 67.0875);

-- ─── PROMO CODES ─────────────────────────────────────────────────────────────
INSERT INTO PromoCode (code, discount_amount, expiry_date) VALUES
('WELCOME50',  50.00, '2027-12-31'),
('SAVE100',   100.00, '2026-12-31'),
('RIDE25',     25.00, '2026-06-30');

-- ─── SAMPLE RIDES ────────────────────────────────────────────────────────────
INSERT INTO Rides (user_id, driver_id, vehicle_id, pickup_location_id, dropoff_location_id, ride_status, fare, request_time, start_time, end_time) VALUES
(2, 1, 1, 1, 2, 'completed', 350.00, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY + INTERVAL 5 MINUTE, NOW() - INTERVAL 2 DAY + INTERVAL 25 MINUTE),
(3, 2, 2, 3, 4, 'completed', 500.00, NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 1 DAY + INTERVAL 3 MINUTE, NOW() - INTERVAL 1 DAY + INTERVAL 30 MINUTE),
(2, 1, 1, 2, 3, 'cancelled', NULL,   NOW() - INTERVAL 3 HOUR, NULL, NULL);

-- ─── RIDE HISTORY ────────────────────────────────────────────────────────────
INSERT INTO Ride_History (ride_id, status) VALUES
(1, 'requested'), (1, 'accepted'), (1, 'driver_en_route'), (1, 'in_progress'), (1, 'completed'),
(2, 'requested'), (2, 'accepted'), (2, 'driver_en_route'), (2, 'in_progress'), (2, 'completed'),
(3, 'requested'), (3, 'cancelled');

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────
INSERT INTO Payments (ride_id, user_id, amount, payment_method, payment_status) VALUES
(1, 2, 350.00, 'cash',   'paid'),
(2, 3, 500.00, 'wallet', 'paid');

-- ─── RATINGS ─────────────────────────────────────────────────────────────────
INSERT INTO Ratings (ride_id, rated_by, rated_user_id, score, comment) VALUES
(1, 2, 4, 5, 'Excellent driver, very punctual!'),
(1, 4, 2, 4, 'Good rider, no issues.'),
(2, 3, 5, 4, 'Smooth ride, comfortable car.'),
(2, 5, 3, 5, 'Great passenger!');

-- ─── COMPLAINTS ──────────────────────────────────────────────────────────────
INSERT INTO Complaints (ride_id, user_id, description, status) VALUES
(1, 2, 'Driver took a longer route than necessary.', 'resolved');

-- ─── DCL: Role-based access control ──────────────────────────────────────────
-- Run these as root after setup:
-- CREATE USER 'rf_rider'@'localhost'   IDENTIFIED BY 'rider_pass';
-- CREATE USER 'rf_driver'@'localhost'  IDENTIFIED BY 'driver_pass';
-- CREATE USER 'rf_admin'@'localhost'   IDENTIFIED BY 'admin_pass';
-- 
-- GRANT SELECT ON RideFlow.Users TO 'rf_rider'@'localhost';
-- GRANT SELECT, INSERT ON RideFlow.Rides TO 'rf_rider'@'localhost';
-- GRANT SELECT, INSERT ON RideFlow.Ratings TO 'rf_rider'@'localhost';
-- GRANT SELECT, INSERT ON RideFlow.Complaints TO 'rf_rider'@'localhost';
-- GRANT SELECT, INSERT ON RideFlow.Payments TO 'rf_rider'@'localhost';
-- 
-- GRANT SELECT, UPDATE ON RideFlow.Driver TO 'rf_driver'@'localhost';
-- GRANT SELECT, UPDATE ON RideFlow.Rides TO 'rf_driver'@'localhost';
-- GRANT SELECT, INSERT ON RideFlow.Driver_Location TO 'rf_driver'@'localhost';
-- GRANT SELECT ON RideFlow.Vehicles TO 'rf_driver'@'localhost';
-- GRANT INSERT ON RideFlow.Ratings TO 'rf_driver'@'localhost';
-- 
-- GRANT ALL PRIVILEGES ON RideFlow.* TO 'rf_admin'@'localhost';
-- FLUSH PRIVILEGES;
